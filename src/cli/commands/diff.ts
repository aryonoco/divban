// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Effect-based diff command - show differences between generated and installed files.
 */

import { Effect } from "effect";
import { loadServiceConfig } from "../../config/loader";
import { getServiceUsername } from "../../config/schema";
import {
  type DivbanEffectError,
  ErrorCode,
  GeneralError,
  type SystemError,
} from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import {
  TEMP_PATHS,
  configFilePath,
  quadletFilePath,
  toAbsolutePathEffect,
  userConfigDir,
  userQuadletDir,
} from "../../lib/paths";
import type {
  AbsolutePath,
  GroupId as GroupIdType,
  UserId as UserIdType,
  Username as UsernameType,
} from "../../lib/types";
import { GroupIdSchema, UserIdSchema } from "../../lib/types";
import type { AnyServiceEffect, ServiceContext } from "../../services/types";
import { fileExists, readFile } from "../../system/fs";
import { getUserByName } from "../../system/user";
import type { ParsedArgs } from "../parser";
import { detectSystemCapabilities, getContextOptions } from "./utils";

export interface DiffOptions {
  service: AnyServiceEffect;
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
export const executeDiff = (options: DiffOptions): Effect.Effect<void, DivbanEffectError> =>
  Effect.gen(function* () {
    const { service, args, logger } = options;
    const configPath = args.configPath;

    if (!configPath) {
      return yield* Effect.fail(
        new GeneralError({
          code: ErrorCode.INVALID_ARGS as 2,
          message: "Config path is required for diff command",
        })
      );
    }

    const validPath = yield* toAbsolutePathEffect(configPath);
    logger.info(`Comparing configuration for ${service.definition.name}...`);
    const config = yield* loadServiceConfig(validPath, service.definition.configSchema);

    // Get service username
    const username = yield* getServiceUsername(service.definition.name);

    // Check if user exists and get paths
    const userResult = yield* Effect.either(getUserByName(username));
    let quadletDir: AbsolutePath;
    let configDir: AbsolutePath;
    let userInfo:
      | { homeDir: AbsolutePath; uid: UserIdType; gid: GroupIdType; username: UsernameType }
      | undefined;

    if (userResult._tag === "Right") {
      const user = userResult.right;
      userInfo = {
        homeDir: user.homeDir,
        uid: user.uid,
        gid: user.gid,
        username: user.username,
      };
      quadletDir = userQuadletDir(user.homeDir);
      configDir = userConfigDir(user.homeDir);
    } else {
      logger.warn("Service user does not exist. Showing generated files only.");
      quadletDir = TEMP_PATHS.nonexistent;
      configDir = TEMP_PATHS.nonexistent;
    }

    // Create fallback user IDs for when user doesn't exist (known-valid literals)
    const fallbackUid = UserIdSchema.make(0);
    const fallbackGid = GroupIdSchema.make(0);

    const system = yield* detectSystemCapabilities();

    // Create service context for generation
    const ctx: ServiceContext<unknown> = {
      config,
      logger,
      paths: {
        dataDir: TEMP_PATHS.diffDataDir,
        quadletDir,
        configDir,
        homeDir: userInfo ? userInfo.homeDir : TEMP_PATHS.nonexistent,
      },
      user: userInfo
        ? {
            name: userInfo.username,
            uid: userInfo.uid,
            gid: userInfo.gid,
          }
        : {
            name: username,
            uid: fallbackUid,
            gid: fallbackGid,
          },
      options: getContextOptions(args),
      system,
    };

    // Generate files
    const files = yield* service.generate(ctx);
    const diffs: FileDiff[] = [];

    // Compare quadlet files
    for (const [name, newContent] of files.quadlets) {
      const path = quadletFilePath(quadletDir, name);
      const diff = yield* compareFile(path, newContent);
      diffs.push({ path, ...diff });
    }

    // Compare network files
    for (const [name, newContent] of files.networks) {
      const path = quadletFilePath(quadletDir, name);
      const diff = yield* compareFile(path, newContent);
      diffs.push({ path, ...diff });
    }

    // Compare volume files
    for (const [name, newContent] of files.volumes) {
      const path = quadletFilePath(quadletDir, name);
      const diff = yield* compareFile(path, newContent);
      diffs.push({ path, ...diff });
    }

    // Compare environment files
    for (const [name, newContent] of files.environment) {
      const path = configFilePath(configDir, name);
      const diff = yield* compareFile(path, newContent);
      diffs.push({ path, ...diff });
    }

    // Compare other files
    for (const [name, newContent] of files.other) {
      const path = configFilePath(configDir, name);
      const diff = yield* compareFile(path, newContent);
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
  });

/**
 * Compare a file with new content.
 */
const compareFile = (
  path: AbsolutePath,
  newContent: string
): Effect.Effect<
  { status: "new" | "modified" | "unchanged"; diff?: string },
  SystemError | GeneralError
> =>
  Effect.gen(function* () {
    const exists = yield* fileExists(path);

    if (!exists) {
      return { status: "new" as const };
    }

    const oldResult = yield* Effect.either(readFile(path));
    if (oldResult._tag === "Left") {
      return { status: "new" as const };
    }

    const oldContent = oldResult.right;

    if (oldContent === newContent) {
      return { status: "unchanged" as const };
    }

    // Generate simple line diff
    const diff = generateSimpleDiff(oldContent, newContent);

    return { status: "modified" as const, diff };
  });

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
