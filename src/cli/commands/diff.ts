// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Preview changes before setup. Compares newly generated quadlet files
 * against installed versions, showing what would change. Essential for
 * reviewing config updates before applying - prevents unexpected
 * service behavior from silent configuration drift.
 */

import { Effect, Either, Match, pipe } from "effect";
import { loadServiceConfig } from "../../config/loader";
import { getServiceUsername } from "../../config/schema";
import type { DivbanEffectError, GeneralError, SystemError } from "../../lib/errors";
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
import { createServiceLayer, detectSystemCapabilities } from "./utils";

export interface DiffOptions {
  readonly service: ExistentialService;
  readonly configPath: string;
  readonly verbose: boolean;
  readonly dryRun: boolean;
  readonly force: boolean;
  readonly logger: Logger;
}

export const executeDiff = (options: DiffOptions): Effect.Effect<void, DivbanEffectError> =>
  Effect.gen(function* () {
    const { service, configPath, verbose, dryRun, force, logger } = options;

    const validPath = yield* toAbsolutePathEffect(configPath);
    logger.info(`Comparing configuration for ${service.definition.name}...`);

    const username = yield* getServiceUsername(service.definition.name);

    const userResult = yield* Effect.either(getUserByName(username));

    type UserInfoType =
      | {
          homeDir: AbsolutePath;
          uid: UserIdType;
          gid: GroupIdType;
          username: UsernameType;
        }
      | undefined;
    type PathInfoType = {
      quadletDir: AbsolutePath;
      configDir: AbsolutePath;
      userInfo: UserInfoType;
    };
    const { quadletDir, configDir, userInfo } = Either.match(userResult, {
      onRight: (user): PathInfoType => ({
        quadletDir: userQuadletDir(user.homeDir),
        configDir: userConfigDir(user.homeDir),
        userInfo: {
          homeDir: user.homeDir,
          uid: user.uid,
          gid: user.gid,
          username: user.username,
        },
      }),
      onLeft: (): PathInfoType => {
        logger.warn("Service user does not exist. Showing generated files only.");
        return {
          quadletDir: TEMP_PATHS.nonexistent,
          configDir: TEMP_PATHS.nonexistent,
          userInfo: undefined,
        };
      },
    });

    // Create fallback user IDs for when user doesn't exist (known-valid literals)
    const fallbackUid = UserIdSchema.make(0);
    const fallbackGid = GroupIdSchema.make(0);

    const system = yield* detectSystemCapabilities();

    const user = pipe(
      Match.value(userInfo),
      Match.when(undefined, () => ({
        name: username,
        uid: fallbackUid,
        gid: fallbackGid,
        homeDir: TEMP_PATHS.nonexistent,
      })),
      Match.orElse((info) => ({
        name: info.username,
        uid: info.uid,
        gid: info.gid,
        homeDir: info.homeDir,
      }))
    );

    const files: GeneratedFiles = yield* service.apply((s) =>
      Effect.gen(function* () {
        const config = yield* loadServiceConfig(validPath, s.configSchema);

        const prereqs = {
          user,
          system,
          paths: {
            dataDir: TEMP_PATHS.diffDataDir,
            quadletDir,
            configDir,
            homeDir: pipe(
              Match.value(userInfo),
              Match.when(undefined, () => TEMP_PATHS.nonexistent),
              Match.orElse((info) => info.homeDir)
            ),
          },
        };

        const layer = createServiceLayer(
          config,
          s.configTag,
          prereqs,
          { dryRun, verbose, force },
          logger
        );

        return yield* s.generate().pipe(Effect.provide(layer));
      })
    );

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

    const diffs = yield* Effect.forEach(
      fileEntries,
      ({ path, content }) =>
        pipe(
          compareFile(path, content),
          Effect.map((result) => ({ path, ...result }))
        ),
      { concurrency: 1 }
    );

    const newFiles = diffs.filter((d) => d.status === "new");
    const modifiedFiles = diffs.filter((d) => d.status === "modified");
    const unchangedFiles = diffs.filter((d) => d.status === "unchanged");

    // Format diff results as lines
    const newFileLines = pipe(
      Match.value(newFiles.length > 0),
      Match.when(true, () => [
        "\nNew files (would be created):",
        ...newFiles.map((f) => `  + ${f.path}`),
      ]),
      Match.when(false, (): string[] => []),
      Match.exhaustive
    );

    const modifiedFileLines = pipe(
      Match.value(modifiedFiles.length > 0),
      Match.when(true, () => [
        "\nModified files:",
        ...modifiedFiles.flatMap((f) => [
          `  ~ ${f.path}`,
          ...pipe(
            Match.value(verbose && f.diff !== undefined),
            Match.when(true, () => [f.diff as string]),
            Match.when(false, (): string[] => []),
            Match.exhaustive
          ),
        ]),
      ]),
      Match.when(false, (): string[] => []),
      Match.exhaustive
    );

    const unchangedFileLines = pipe(
      Match.value(unchangedFiles.length > 0 && verbose),
      Match.when(true, () => ["\nUnchanged files:", ...unchangedFiles.map((f) => `    ${f.path}`)]),
      Match.when(false, (): string[] => []),
      Match.exhaustive
    );

    const formatLines: readonly string[] = [
      ...newFileLines,
      ...modifiedFileLines,
      ...unchangedFileLines,
    ];

    // Single side effect: log all lines
    yield* Effect.forEach(formatLines, (line) => Effect.sync(() => logger.info(line)), {
      discard: true,
    });

    logger.info("");
    yield* pipe(
      Match.value(newFiles.length === 0 && modifiedFiles.length === 0),
      Match.when(true, () => Effect.sync(() => logger.success("No changes detected"))),
      Match.when(false, () =>
        Effect.sync(() =>
          logger.info(
            `Summary: ${newFiles.length} new, ${modifiedFiles.length} modified, ${unchangedFiles.length} unchanged`
          )
        )
      ),
      Match.exhaustive
    );
  });

const compareFile = (
  path: AbsolutePath,
  newContent: string
): Effect.Effect<
  { status: "new" | "modified" | "unchanged"; diff?: string },
  SystemError | GeneralError
> =>
  Effect.gen(function* () {
    const exists = yield* fileExists(path);

    return yield* pipe(
      Match.value(exists),
      Match.when(false, () => Effect.succeed({ status: "new" as const })),
      Match.when(true, () =>
        Effect.gen(function* () {
          const oldResult = yield* Effect.either(readFile(path));

          type DiffResultType = { status: "new" | "modified" | "unchanged"; diff?: string };
          return Either.match(oldResult, {
            onLeft: (): DiffResultType => ({ status: "new" as const }),
            onRight: (oldContent): DiffResultType =>
              pipe(
                Match.value(oldContent === newContent),
                Match.when(true, () => ({ status: "unchanged" as const })),
                Match.when(false, () => ({
                  status: "modified" as const,
                  diff: generateSimpleDiff(oldContent, newContent),
                })),
                Match.exhaustive
              ),
          });
        })
      ),
      Match.exhaustive
    );
  });

const compareLine = (oldLine: string | undefined, newLine: string | undefined): string | null =>
  pipe(
    Match.value({ oldLine, newLine }),
    Match.when({ oldLine: Match.undefined, newLine: Match.undefined }, () => null),
    Match.when(
      { oldLine: Match.string, newLine: Match.undefined },
      ({ oldLine: o }) => `      - ${o}`
    ),
    Match.when(
      { oldLine: Match.undefined, newLine: Match.string },
      ({ newLine: n }) => `      + ${n}`
    ),
    Match.when(
      { oldLine: Match.string, newLine: Match.string },
      ({ oldLine: o, newLine: n }): string | null => (o === n ? null : `      - ${o}\n      + ${n}`)
    ),
    Match.exhaustive
  );

/**
 * Simplified line-by-line diff for quick visual comparison.
 * Not a proper unified diff - just shows changed lines without context.
 */
const generateSimpleDiff = (oldContent: string, newContent: string): string => {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const maxLen = Math.max(oldLines.length, newLines.length);

  return Array.from({ length: maxLen }, (_, i) => compareLine(oldLines[i], newLines[i]))
    .filter((line): line is string => line !== null)
    .join("\n");
};
