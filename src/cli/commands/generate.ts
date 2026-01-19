// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Generate command - generate quadlet files without installing.
 */

import { loadServiceConfig } from "../../config/loader";
import { DivbanError, ErrorCode } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import { TEMP_PATHS, outputConfigDir, outputQuadletDir } from "../../lib/paths";
import { Err, Ok, type Result, combine3 } from "../../lib/result";
import { type AbsolutePath, GroupId, UserId, Username } from "../../lib/types";
import { writeGeneratedFilesPreview } from "../../services/helpers";
import type { AnyService, ServiceContext } from "../../services/types";
import { getFileCount } from "../../services/types";
import { ensureDirectory } from "../../system/fs";
import type { ParsedArgs } from "../parser";
import { detectSystemCapabilities, getContextOptions } from "./utils";

export interface GenerateOptions {
  service: AnyService;
  args: ParsedArgs;
  logger: Logger;
}

/**
 * Execute the generate command.
 */
export const executeGenerate = async (
  options: GenerateOptions
): Promise<Result<void, DivbanError>> => {
  const { service, args, logger } = options;
  const configPath = args.configPath;
  const outputDir = args.outputDir ?? ".";

  if (!configPath) {
    return Err(
      new DivbanError(ErrorCode.INVALID_ARGS, "Config path is required for generate command")
    );
  }

  logger.info(`Generating files for ${service.definition.name}...`);

  // Load and validate config
  const configResult = await loadServiceConfig(
    configPath as AbsolutePath,
    service.definition.configSchema
  );

  if (!configResult.ok) {
    return configResult;
  }

  // Create mock service context for generation
  const userResult = combine3(Username("divban-preview"), UserId(1000), GroupId(1000));
  if (!userResult.ok) {
    return userResult;
  }
  const [username, uid, gid] = userResult.value;

  const quadletDirResult = outputQuadletDir(outputDir);
  if (!quadletDirResult.ok) {
    return quadletDirResult;
  }
  const configDirResult = outputConfigDir(outputDir);
  if (!configDirResult.ok) {
    return configDirResult;
  }

  const ctx: ServiceContext<unknown> = {
    config: configResult.value,
    logger,
    paths: {
      dataDir: TEMP_PATHS.generateDataDir,
      quadletDir: quadletDirResult.value,
      configDir: configDirResult.value,
    },
    user: {
      name: username,
      uid: uid,
      gid: gid,
    },
    options: getContextOptions(args),
    system: await detectSystemCapabilities(),
  };

  // Generate files
  const filesResult = await service.generate(ctx);

  if (!filesResult.ok) {
    return filesResult;
  }

  const files = filesResult.value;

  if (args.dryRun) {
    // Just print what would be generated
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

    return Ok(undefined);
  }

  // Ensure output directories exist (paths already validated above)
  await ensureDirectory(quadletDirResult.value);
  await ensureDirectory(configDirResult.value);

  // Write all generated files
  const writeResult = await writeGeneratedFilesPreview(
    files,
    quadletDirResult.value,
    configDirResult.value
  );
  if (!writeResult.ok) {
    return writeResult;
  }

  const total = getFileCount(files);
  logger.success(`Generated ${total} files in ${outputDir}/`);

  return Ok(undefined);
};
