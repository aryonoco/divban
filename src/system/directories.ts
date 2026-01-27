// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Directory creation with ownership and mode for rootless Podman setup.
 * Uses `install -d` for atomic mkdir+chown+chmod. Tracked operations
 * record which directories were created for precise rollback.
 */

import { Array as Arr, Effect, Option, pipe } from "effect";
import { ErrorCode, type GeneralError, SystemError } from "../lib/errors";
import { isTransientSystemError, systemRetrySchedule } from "../lib/retry";
import { type AbsolutePath, type GroupId, type UserId, pathJoin } from "../lib/types";
import { execSuccess } from "./exec";
import { directoryExists as fsDirectoryExists } from "./fs";

export interface DirectoryOwner {
  uid: UserId;
  gid: GroupId;
}

/**
 * Ensure a directory exists with proper ownership and permissions.
 */
export const ensureDirectory = (
  path: AbsolutePath,
  owner: DirectoryOwner,
  mode = "0755"
): Effect.Effect<void, SystemError | GeneralError> =>
  Effect.gen(function* () {
    yield* execSuccess([
      "install",
      "-d",
      "-m",
      mode,
      "-o",
      String(owner.uid),
      "-g",
      String(owner.gid),
      path,
    ]);
  }).pipe(
    Effect.retry({
      schedule: systemRetrySchedule,
      while: (err): boolean => isTransientSystemError(err),
    }),
    Effect.mapError(
      (err) =>
        new SystemError({
          code: ErrorCode.DIRECTORY_CREATE_FAILED,
          message: `Failed to create directory ${path}: ${err.message}`,
          ...(err instanceof Error ? { cause: err } : {}),
        })
    )
  );

/**
 * Ensure multiple directories exist with the same ownership.
 */
export const ensureDirectories = (
  paths: AbsolutePath[],
  owner: DirectoryOwner,
  mode = "0755"
): Effect.Effect<void, SystemError | GeneralError> =>
  Effect.gen(function* () {
    yield* Effect.all(
      paths.map((path) => ensureDirectory(path, owner, mode)),
      { concurrency: "unbounded" }
    );
  });

/**
 * Change ownership of a file or directory.
 */
export const chown = (
  path: AbsolutePath,
  owner: DirectoryOwner,
  recursive = false
): Effect.Effect<void, SystemError | GeneralError> =>
  Effect.gen(function* () {
    const args = recursive
      ? ["chown", "-R", `${owner.uid}:${owner.gid}`, path]
      : ["chown", `${owner.uid}:${owner.gid}`, path];

    yield* execSuccess(args);
  }).pipe(
    Effect.retry({
      schedule: systemRetrySchedule,
      while: (err): boolean => isTransientSystemError(err),
    }),
    Effect.mapError(
      (err) =>
        new SystemError({
          code: ErrorCode.EXEC_FAILED,
          message: `Failed to change ownership of ${path}: ${err.message}`,
          ...(err instanceof Error ? { cause: err } : {}),
        })
    )
  );

/**
 * Change permissions of a file or directory.
 */
export const chmod = (
  path: AbsolutePath,
  mode: string,
  recursive = false
): Effect.Effect<void, SystemError | GeneralError> =>
  Effect.gen(function* () {
    const args = recursive ? ["chmod", "-R", mode, path] : ["chmod", mode, path];

    yield* execSuccess(args);
  }).pipe(
    Effect.retry({
      schedule: systemRetrySchedule,
      while: (err): boolean => isTransientSystemError(err),
    }),
    Effect.mapError(
      (err) =>
        new SystemError({
          code: ErrorCode.EXEC_FAILED,
          message: `Failed to change permissions of ${path}: ${err.message}`,
          ...(err instanceof Error ? { cause: err } : {}),
        })
    )
  );

/**
 * Get standard directories for a service.
 */
export const getServiceDirectories = (
  dataDir: AbsolutePath,
  homeDir: AbsolutePath
): {
  data: AbsolutePath;
  config: AbsolutePath;
  quadlet: AbsolutePath;
  logs: AbsolutePath;
} => ({
  data: dataDir,
  config: pathJoin(dataDir, "config"),
  quadlet: pathJoin(homeDir, ".config", "containers", "systemd"),
  logs: pathJoin(dataDir, "logs"),
});

/**
 * Ensure all standard service directories exist.
 */
export const ensureServiceDirectories = (
  dataDir: AbsolutePath,
  homeDir: AbsolutePath,
  owner: DirectoryOwner
): Effect.Effect<void, SystemError | GeneralError> =>
  Effect.gen(function* () {
    const dirs = getServiceDirectories(dataDir, homeDir);

    const dataDirs: AbsolutePath[] = [dirs.data, dirs.config, dirs.logs];
    const quadletParent = pathJoin(homeDir, ".config", "containers");
    const configParent = pathJoin(homeDir, ".config");

    // Create data dirs and config parent in parallel
    yield* Effect.all([ensureDirectories(dataDirs, owner), ensureDirectory(configParent, owner)], {
      concurrency: "unbounded",
    });

    // Now create containers directory and quadlet directory sequentially
    yield* ensureDirectory(quadletParent, owner);
    yield* ensureDirectory(dirs.quadlet, owner);
  });

/**
 * Remove a directory and its contents.
 */
export const removeDirectory = (
  path: AbsolutePath,
  force = false
): Effect.Effect<void, SystemError | GeneralError> =>
  Effect.gen(function* () {
    const args = force ? ["rm", "-rf", path] : ["rm", "-r", path];

    yield* execSuccess(args);
  }).pipe(
    Effect.retry({
      schedule: systemRetrySchedule,
      while: (err): boolean => isTransientSystemError(err),
    }),
    Effect.mapError(
      (err) =>
        new SystemError({
          code: ErrorCode.DIRECTORY_CREATE_FAILED,
          message: `Failed to remove directory ${path}: ${err.message}`,
          ...(err instanceof Error ? { cause: err } : {}),
        })
    )
  );

// --- Tracked directory operations ---

/**
 * Ensure directories with tracking.
 * Uses Effect.forEach for functional iteration over paths.
 */
export const ensureDirectoriesTracked = (
  paths: readonly AbsolutePath[],
  owner: DirectoryOwner,
  mode = "0755"
): Effect.Effect<{ readonly createdPaths: readonly AbsolutePath[] }, SystemError | GeneralError> =>
  pipe(
    Effect.forEach(
      paths,
      (path) =>
        pipe(
          fsDirectoryExists(path),
          Effect.flatMap((exists) =>
            exists
              ? Effect.succeed(Option.none<AbsolutePath>())
              : pipe(ensureDirectory(path, owner, mode), Effect.as(Option.some(path)))
          )
        ),
      { concurrency: 1 } // Sequential for parent-before-child ordering
    ),
    Effect.map((results) => ({
      createdPaths: pipe(
        results,
        Arr.filter(Option.isSome),
        Arr.map((o) => o.value)
      ),
    }))
  );

/**
 * Remove directories in reverse order.
 * Functional composition with reversed array.
 */
export const removeDirectoriesReverse = (
  paths: readonly AbsolutePath[]
): Effect.Effect<void, never> =>
  Effect.forEach([...paths].reverse(), (path) => removeDirectory(path, true).pipe(Effect.ignore), {
    concurrency: 1,
  }).pipe(Effect.asVoid);

/**
 * Ensure service directories with tracking.
 */
export const ensureServiceDirectoriesTracked = (
  dataDir: AbsolutePath,
  homeDir: AbsolutePath,
  owner: DirectoryOwner
): Effect.Effect<
  { readonly createdPaths: readonly AbsolutePath[] },
  SystemError | GeneralError
> => {
  const dirs = getServiceDirectories(dataDir, homeDir);

  const allPaths: readonly AbsolutePath[] = [
    dirs.data,
    dirs.config,
    dirs.logs,
    pathJoin(homeDir, ".config"),
    pathJoin(homeDir, ".config", "containers"),
    dirs.quadlet,
  ];

  return ensureDirectoriesTracked(allPaths, owner);
};
