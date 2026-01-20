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
import { GroupId, UserId, Username } from "../../lib/types";
import { writeGeneratedFilesPreview } from "../../services/helpers";
import type { AnyServiceEffect, ServiceContext } from "../../services/types";
import { getFileCount } from "../../services/types";
import { ensureDirectory } from "../../system/fs";
import type { ParsedArgs } from "../parser";
import { detectSystemCapabilities, getContextOptions } from "./utils";

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

    // Create mock user for preview context
    const usernameResult = Username("divban-preview");
    const uidResult = UserId(1000);
    const gidResult = GroupId(1000);

    if (!(usernameResult.ok && uidResult.ok && gidResult.ok)) {
      return yield* Effect.fail(
        new GeneralError({
          code: ErrorCode.GENERAL_ERROR as 1,
          message: "Failed to create preview user",
        })
      );
    }

    const username = usernameResult.value;
    const uid = uidResult.value;
    const gid = gidResult.value;

    const validPath = yield* toAbsolutePathEffect(configPath);
    const config = yield* loadServiceConfig(validPath, service.definition.configSchema);

    const quadletDirResult = outputQuadletDir(outputDir);
    if (!quadletDirResult.ok) {
      return yield* Effect.fail(
        new GeneralError({
          code: ErrorCode.GENERAL_ERROR as 1,
          message: quadletDirResult.error.message,
        })
      );
    }

    const configDirResult = outputConfigDir(outputDir);
    if (!configDirResult.ok) {
      return yield* Effect.fail(
        new GeneralError({
          code: ErrorCode.GENERAL_ERROR as 1,
          message: configDirResult.error.message,
        })
      );
    }

    const system = yield* detectSystemCapabilities();

    const ctx: ServiceContext<unknown> = {
      config,
      logger,
      paths: {
        dataDir: TEMP_PATHS.generateDataDir,
        quadletDir: quadletDirResult.value,
        configDir: configDirResult.value,
        homeDir: TEMP_PATHS.generateDataDir, // Pseudo-home for generation
      },
      user: { name: username, uid, gid },
      options: getContextOptions(args),
      system,
    };

    // Generate files
    const files = yield* service.generate(ctx);

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

    yield* ensureDirectory(quadletDirResult.value);
    yield* ensureDirectory(configDirResult.value);

    yield* writeGeneratedFilesPreview(files, quadletDirResult.value, configDirResult.value);

    const total = getFileCount(files);
    logger.success(`Generated ${total} files in ${outputDir}/`);
  });
