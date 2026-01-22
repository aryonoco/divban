// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Effect-based diff command - show differences between generated and installed files.
 */

import { Effect, pipe } from "effect";
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
import type { ExistentialService, GeneratedFiles } from "../../services/types";
import { fileExists, readFile } from "../../system/fs";
import { getUserByName } from "../../system/user";
import type { ParsedArgs } from "../parser";
import { createServiceLayer, detectSystemCapabilities, getContextOptions } from "./utils";

export interface DiffOptions {
  service: ExistentialService;
  args: ParsedArgs;
  logger: Logger;
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

    // Build user info for layer
    const user = userInfo
      ? {
          name: userInfo.username,
          uid: userInfo.uid,
          gid: userInfo.gid,
          homeDir: userInfo.homeDir,
        }
      : {
          name: username,
          uid: fallbackUid,
          gid: fallbackGid,
          homeDir: TEMP_PATHS.nonexistent,
        };

    // Enter existential for typed config loading
    const files: GeneratedFiles = yield* service.apply((s) =>
      Effect.gen(function* () {
        const config = yield* loadServiceConfig(validPath, s.configSchema);

        // Build prerequisites for layer creation
        const prereqs = {
          user,
          system,
          paths: {
            dataDir: TEMP_PATHS.diffDataDir,
            quadletDir,
            configDir,
            homeDir: userInfo ? userInfo.homeDir : TEMP_PATHS.nonexistent,
          },
        };

        const layer = createServiceLayer(
          config,
          s.configTag,
          prereqs,
          getContextOptions(args),
          logger
        );

        // Generate files
        return yield* s.generate().pipe(Effect.provide(layer));
      })
    );

    // Collect all file entries
    const fileEntries: readonly { path: AbsolutePath; content: string }[] = [
      ...[...files.quadlets].map(([name, content]) => ({
        path: quadletFilePath(quadletDir, name),
        content,
      })),
      ...[...files.networks].map(([name, content]) => ({
        path: quadletFilePath(quadletDir, name),
        content,
      })),
      ...[...files.volumes].map(([name, content]) => ({
        path: quadletFilePath(quadletDir, name),
        content,
      })),
      ...[...files.environment].map(([name, content]) => ({
        path: configFilePath(configDir, name),
        content,
      })),
      ...[...files.other].map(([name, content]) => ({
        path: configFilePath(configDir, name),
        content,
      })),
    ];

    // Compute all diffs
    const diffs = yield* Effect.forEach(
      fileEntries,
      ({ path, content }) =>
        pipe(
          compareFile(path, content),
          Effect.map((result) => ({ path, ...result }))
        ),
      { concurrency: 1 }
    );

    // Partition diffs by status
    const newFiles = diffs.filter((d) => d.status === "new");
    const modifiedFiles = diffs.filter((d) => d.status === "modified");
    const unchangedFiles = diffs.filter((d) => d.status === "unchanged");

    // Format diff results as lines
    const formatLines: readonly string[] = [
      ...(newFiles.length > 0
        ? ["\nNew files (would be created):", ...newFiles.map((f) => `  + ${f.path}`)]
        : []),
      ...(modifiedFiles.length > 0
        ? [
            "\nModified files:",
            ...modifiedFiles.flatMap((f) => [
              `  ~ ${f.path}`,
              ...(args.verbose && f.diff !== undefined ? [f.diff] : []),
            ]),
          ]
        : []),
      ...(unchangedFiles.length > 0 && args.verbose
        ? ["\nUnchanged files:", ...unchangedFiles.map((f) => `    ${f.path}`)]
        : []),
    ];

    // Single side effect: log all lines
    yield* Effect.forEach(formatLines, (line) => Effect.sync(() => logger.info(line)), {
      discard: true,
    });

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
  const maxLen = Math.max(oldLines.length, newLines.length);

  return Array.from({ length: maxLen }, (_, i) => {
    const oldLine = oldLines[i]; // string | undefined with noUncheckedIndexedAccess
    const newLine = newLines[i];

    if (oldLine === newLine) {
      return null;
    }
    if (oldLine !== undefined && newLine === undefined) {
      return `      - ${oldLine}`;
    }
    if (oldLine === undefined && newLine !== undefined) {
      return `      + ${newLine}`;
    }
    if (oldLine !== undefined && newLine !== undefined && oldLine !== newLine) {
      return `      - ${oldLine}\n      + ${newLine}`;
    }
    return null;
  })
    .filter((line): line is string => line !== null)
    .join("\n");
}
