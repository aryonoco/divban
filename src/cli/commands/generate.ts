// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Dry-run quadlet generation. Writes files to a specified output
 * directory instead of the systemd quadlet path - useful for
 * reviewing generated configs, version control, or debugging
 * without affecting the running system.
 */

import { Effect, pipe } from "effect";
import { loadServiceConfig } from "../../config/loader";
import { type DivbanEffectError, ErrorCode, GeneralError } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import {
  TEMP_PATHS,
  outputConfigDir,
  outputQuadletDir,
  toAbsolutePathEffect,
} from "../../lib/paths";
import { GroupIdSchema, UserIdSchema, UsernameSchema } from "../../lib/types";
import { writeGeneratedFilesPreview } from "../../services/helpers";
import type { ExistentialService } from "../../services/types";
import { getFileCount } from "../../services/types";
import { ensureDirectory } from "../../system/fs";
import type { ParsedArgs } from "../parser";
import { createServiceLayer, detectSystemCapabilities, getContextOptions } from "./utils";

export interface GenerateOptions {
  service: ExistentialService;
  args: ParsedArgs;
  logger: Logger;
}

export const executeGenerate = (options: GenerateOptions): Effect.Effect<void, DivbanEffectError> =>
  Effect.gen(function* () {
    const { service, args, logger } = options;
    const configPath = args.configPath;
    const outputDir = args.outputDir ?? ".";

    const validatedConfigPath = yield* pipe(
      Effect.succeed(configPath),
      Effect.filterOrFail(
        (p): p is string => p !== undefined && p !== "",
        () =>
          new GeneralError({
            code: ErrorCode.INVALID_ARGS as 2,
            message: "Config path is required for generate command",
          })
      )
    );

    logger.info(`Generating files for ${service.definition.name}...`);

    // Create mock user for preview context (known-valid literals)
    const username = UsernameSchema.make("divban-preview");
    const uid = UserIdSchema.make(1000);
    const gid = GroupIdSchema.make(1000);

    const validPath = yield* toAbsolutePathEffect(validatedConfigPath);
    const quadletDir = yield* outputQuadletDir(outputDir);
    const configDir = yield* outputConfigDir(outputDir);
    const system = yield* detectSystemCapabilities();

    const files = yield* service.apply((s) =>
      Effect.gen(function* () {
        const config = yield* loadServiceConfig(validPath, s.configSchema);

        // Build prerequisites for layer creation
        const prereqs = {
          user: { name: username, uid, gid, homeDir: TEMP_PATHS.generateDataDir },
          system,
          paths: {
            dataDir: TEMP_PATHS.generateDataDir,
            quadletDir,
            configDir,
            homeDir: TEMP_PATHS.generateDataDir, // Pseudo-home for generation
          },
        };

        const layer = createServiceLayer(
          config,
          s.configTag,
          prereqs,
          getContextOptions(args),
          logger
        );

        return yield* s.generate().pipe(Effect.provide(layer));
      })
    );

    const dryRunLog = (): Effect.Effect<void, never> =>
      Effect.gen(function* () {
        logger.info("Would generate the following files:");
        const logLines = [
          ...[...files.quadlets].map(([name]) => `  quadlets/${name}`),
          ...[...files.networks].map(([name]) => `  quadlets/${name}`),
          ...[...files.volumes].map(([name]) => `  quadlets/${name}`),
          ...[...files.environment].map(([name]) => `  config/${name}`),
          ...[...files.other].map(([name]) => `  config/${name}`),
        ];
        yield* Effect.forEach(logLines, (line) => Effect.sync(() => logger.info(line)), {
          discard: true,
        });
      });

    const writeFiles = (): Effect.Effect<void, DivbanEffectError> =>
      Effect.gen(function* () {
        yield* ensureDirectory(quadletDir);
        yield* ensureDirectory(configDir);
        yield* writeGeneratedFilesPreview(files, quadletDir, configDir);
        const total = getFileCount(files);
        logger.success(`Generated ${total} files in ${outputDir}/`);
      });

    yield* Effect.if(args.dryRun, {
      onTrue: (): Effect.Effect<void, never> => dryRunLog(),
      onFalse: (): Effect.Effect<void, DivbanEffectError> => writeFiles(),
    });
  });
