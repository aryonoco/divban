// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Effect-based generate command - generate quadlet files without installing.
 */

import { Effect } from "effect";
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
import type { AnyServiceEffect } from "../../services/types";
import { getFileCount } from "../../services/types";
import { ensureDirectory } from "../../system/fs";
import type { ParsedArgs } from "../parser";
import { createServiceLayer, detectSystemCapabilities, getContextOptions } from "./utils";

export interface GenerateOptions {
  service: AnyServiceEffect;
  args: ParsedArgs;
  logger: Logger;
}

/**
 * Execute the generate command.
 */
export const executeGenerate = (options: GenerateOptions): Effect.Effect<void, DivbanEffectError> =>
  Effect.gen(function* () {
    const { service, args, logger } = options;
    const configPath = args.configPath;
    const outputDir = args.outputDir ?? ".";

    if (!configPath) {
      return yield* Effect.fail(
        new GeneralError({
          code: ErrorCode.INVALID_ARGS as 2,
          message: "Config path is required for generate command",
        })
      );
    }

    logger.info(`Generating files for ${service.definition.name}...`);

    // Create mock user for preview context (known-valid literals)
    const username = UsernameSchema.make("divban-preview");
    const uid = UserIdSchema.make(1000);
    const gid = GroupIdSchema.make(1000);

    const validPath = yield* toAbsolutePathEffect(configPath);
    const config = yield* loadServiceConfig(validPath, service.definition.configSchema);

    const quadletDir = yield* outputQuadletDir(outputDir);
    const configDir = yield* outputConfigDir(outputDir);

    const system = yield* detectSystemCapabilities();

    // Build prerequisites for layer creation
    const prereqs = {
      user: { name: username, uid, gid, homeDir: TEMP_PATHS.generateDataDir },
      config,
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
      service.configTag,
      prereqs,
      getContextOptions(args),
      logger
    );

    // Generate files
    const files = yield* service.generate().pipe(Effect.provide(layer));

    if (args.dryRun) {
      logger.info("Would generate the following files:");
      for (const [name] of files.quadlets) {
        logger.info(`  quadlets/${name}`);
      }
      for (const [name] of files.networks) {
        logger.info(`  quadlets/${name}`);
      }
      for (const [name] of files.volumes) {
        logger.info(`  quadlets/${name}`);
      }
      for (const [name] of files.environment) {
        logger.info(`  config/${name}`);
      }
      for (const [name] of files.other) {
        logger.info(`  config/${name}`);
      }
      return;
    }

    yield* ensureDirectory(quadletDir);
    yield* ensureDirectory(configDir);

    yield* writeGeneratedFilesPreview(files, quadletDir, configDir);

    const total = getFileCount(files);
    logger.success(`Generated ${total} files in ${outputDir}/`);
  });
