/**
 * Generate command - generate quadlet files without installing.
 */

import { loadServiceConfig } from "../../config/loader";
import { DivbanError, ErrorCode } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import { Err, Ok, type Result } from "../../lib/result";
import { type AbsolutePath, GroupId, UserId, Username } from "../../lib/types";
import type { Service, ServiceContext } from "../../services/types";
import { getFileCount } from "../../services/types";
import { ensureDirectory, writeFile } from "../../system/fs";
import type { ParsedArgs } from "../parser";
import { getContextOptions } from "./utils";

export interface GenerateOptions {
  service: Service;
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
  const ctx: ServiceContext = {
    config: configResult.value,
    logger,
    paths: {
      dataDir: "/tmp/divban-generate" as AbsolutePath,
      quadletDir: `${outputDir}/quadlets` as AbsolutePath,
      configDir: `${outputDir}/config` as AbsolutePath,
    },
    user: {
      name: Username("divban-preview"),
      uid: UserId(1000),
      gid: GroupId(1000),
    },
    options: getContextOptions(args),
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

  // Create output directories
  const quadletDir = `${outputDir}/quadlets` as AbsolutePath;
  const configDir = `${outputDir}/config` as AbsolutePath;

  await ensureDirectory(quadletDir);
  await ensureDirectory(configDir);

  // Write quadlet files
  for (const [name, content] of files.quadlets) {
    const path = `${quadletDir}/${name}` as AbsolutePath;
    const result = await writeFile(path, content);
    if (!result.ok) {
      return result;
    }
    logger.debug(`Wrote ${path}`);
  }

  // Write network files
  for (const [name, content] of files.networks) {
    const path = `${quadletDir}/${name}` as AbsolutePath;
    const result = await writeFile(path, content);
    if (!result.ok) {
      return result;
    }
    logger.debug(`Wrote ${path}`);
  }

  // Write volume files
  for (const [name, content] of files.volumes) {
    const path = `${quadletDir}/${name}` as AbsolutePath;
    const result = await writeFile(path, content);
    if (!result.ok) {
      return result;
    }
    logger.debug(`Wrote ${path}`);
  }

  // Write environment files
  for (const [name, content] of files.environment) {
    const path = `${configDir}/${name}` as AbsolutePath;
    const result = await writeFile(path, content);
    if (!result.ok) {
      return result;
    }
    logger.debug(`Wrote ${path}`);
  }

  // Write other files
  for (const [name, content] of files.other) {
    const path = `${configDir}/${name}` as AbsolutePath;
    const result = await writeFile(path, content);
    if (!result.ok) {
      return result;
    }
    logger.debug(`Wrote ${path}`);
  }

  const total = getFileCount(files);
  logger.success(`Generated ${total} files in ${outputDir}/`);

  return Ok(undefined);
};
