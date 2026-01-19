// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Diff command - show differences between generated and installed files.
 */

import { loadServiceConfig } from "../../config/loader";
import { getServiceUsername } from "../../config/schema";
import { DivbanError, ErrorCode } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import {
  TEMP_PATHS,
  configFilePath,
  quadletFilePath,
  userConfigDir,
  userQuadletDir,
} from "../../lib/paths";
import { Err, Ok, type Result } from "../../lib/result";
import { type AbsolutePath, GroupId, UserId } from "../../lib/types";
import type { AnyService, ServiceContext } from "../../services/types";
import { fileExists, readFile } from "../../system/fs";
import { getUserByName } from "../../system/user";
import type { ParsedArgs } from "../parser";
import { detectSystemCapabilities, getContextOptions } from "./utils";

export interface DiffOptions {
  service: AnyService;
  args: ParsedArgs;
  logger: Logger;
}

interface FileDiff {
  path: string;
  status: "new" | "modified" | "unchanged" | "deleted";
  diff?: string;
}

/**
 * Execute the diff command.
 */
export const executeDiff = async (options: DiffOptions): Promise<Result<void, DivbanError>> => {
  const { service, args, logger } = options;
  const configPath = args.configPath;

  if (!configPath) {
    return Err(new DivbanError(ErrorCode.INVALID_ARGS, "Config path is required for diff command"));
  }

  logger.info(`Comparing configuration for ${service.definition.name}...`);

  // Load and validate config
  const configResult = await loadServiceConfig(
    configPath as AbsolutePath,
    service.definition.configSchema
  );

  if (!configResult.ok) {
    return configResult;
  }

  // Get service username
  const usernameResult = getServiceUsername(service.definition.name);
  if (!usernameResult.ok) {
    return usernameResult;
  }
  const username = usernameResult.value;

  // Check if user exists and get paths
  const userResult = await getUserByName(username);
  let quadletDir: AbsolutePath;
  let configDir: AbsolutePath;

  if (userResult.ok) {
    quadletDir = userQuadletDir(userResult.value.homeDir);
    configDir = userConfigDir(userResult.value.homeDir);
  } else {
    logger.warn("Service user does not exist. Showing generated files only.");
    quadletDir = TEMP_PATHS.nonexistent;
    configDir = TEMP_PATHS.nonexistent;
  }

  // Create fallback user IDs for when user doesn't exist
  const fallbackUidResult = UserId(0);
  const fallbackGidResult = GroupId(0);
  if (!(fallbackUidResult.ok && fallbackGidResult.ok)) {
    return Err(new DivbanError(ErrorCode.GENERAL_ERROR, "Failed to create fallback user IDs"));
  }

  // Create service context for generation
  const ctx: ServiceContext<unknown> = {
    config: configResult.value,
    logger,
    paths: {
      dataDir: TEMP_PATHS.diffDataDir,
      quadletDir,
      configDir,
    },
    user: userResult.ok
      ? {
          name: userResult.value.username,
          uid: userResult.value.uid,
          gid: userResult.value.gid,
        }
      : {
          name: username,
          uid: fallbackUidResult.value,
          gid: fallbackGidResult.value,
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
  const diffs: FileDiff[] = [];

  // Compare quadlet files
  for (const [name, newContent] of files.quadlets) {
    const path = quadletFilePath(quadletDir, name);
    const diff = await compareFile(path, newContent);
    diffs.push({ path, ...diff });
  }

  // Compare network files
  for (const [name, newContent] of files.networks) {
    const path = quadletFilePath(quadletDir, name);
    const diff = await compareFile(path, newContent);
    diffs.push({ path, ...diff });
  }

  // Compare volume files
  for (const [name, newContent] of files.volumes) {
    const path = quadletFilePath(quadletDir, name);
    const diff = await compareFile(path, newContent);
    diffs.push({ path, ...diff });
  }

  // Compare environment files
  for (const [name, newContent] of files.environment) {
    const path = configFilePath(configDir, name);
    const diff = await compareFile(path, newContent);
    diffs.push({ path, ...diff });
  }

  // Compare other files
  for (const [name, newContent] of files.other) {
    const path = configFilePath(configDir, name);
    const diff = await compareFile(path, newContent);
    diffs.push({ path, ...diff });
  }

  // Print results
  const newFiles = diffs.filter((d) => d.status === "new");
  const modifiedFiles = diffs.filter((d) => d.status === "modified");
  const unchangedFiles = diffs.filter((d) => d.status === "unchanged");

  if (newFiles.length > 0) {
    logger.info("\nNew files (would be created):");
    for (const f of newFiles) {
      logger.info(`  + ${f.path}`);
    }
  }

  if (modifiedFiles.length > 0) {
    logger.info("\nModified files:");
    for (const f of modifiedFiles) {
      logger.info(`  ~ ${f.path}`);
      if (args.verbose && f.diff) {
        logger.info(f.diff);
      }
    }
  }

  if (unchangedFiles.length > 0 && args.verbose) {
    logger.info("\nUnchanged files:");
    for (const f of unchangedFiles) {
      logger.info(`    ${f.path}`);
    }
  }

  // Summary
  logger.info("");
  if (newFiles.length === 0 && modifiedFiles.length === 0) {
    logger.success("No changes detected");
  } else {
    logger.info(
      `Summary: ${newFiles.length} new, ${modifiedFiles.length} modified, ${unchangedFiles.length} unchanged`
    );
  }

  return Ok(undefined);
};

/**
 * Compare a file with new content.
 */
async function compareFile(
  path: AbsolutePath,
  newContent: string
): Promise<{ status: "new" | "modified" | "unchanged"; diff?: string }> {
  const exists = await fileExists(path);

  if (!exists) {
    return { status: "new" };
  }

  const oldResult = await readFile(path);
  if (!oldResult.ok) {
    return { status: "new" };
  }

  const oldContent = oldResult.value;

  if (oldContent === newContent) {
    return { status: "unchanged" };
  }

  // Generate simple line diff
  const diff = generateSimpleDiff(oldContent, newContent);

  return { status: "modified", diff };
}

/**
 * Generate a simple unified diff.
 */
function generateSimpleDiff(oldContent: string, newContent: string): string {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");

  const output: string[] = [];
  const maxLines = Math.max(oldLines.length, newLines.length);

  for (let i = 0; i < maxLines; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];

    if (oldLine === newLine) {
      continue;
    }

    if (oldLine !== undefined && newLine === undefined) {
      output.push(`      - ${oldLine}`);
    } else if (oldLine === undefined && newLine !== undefined) {
      output.push(`      + ${newLine}`);
    } else if (oldLine !== newLine) {
      output.push(`      - ${oldLine}`);
      output.push(`      + ${newLine}`);
    }
  }

  return output.join("\n");
}
