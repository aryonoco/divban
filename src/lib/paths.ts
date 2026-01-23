// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Centralized path constants prevent typos and enable global refactoring.
 * All system paths are branded AbsolutePath types for compile-time safety.
 * User home lookups cache results since /etc/passwd rarely changes.
 */

import { readFileSync } from "node:fs";
import { normalize, resolve } from "node:path";
import { Array as Arr, Effect, Option, Schema, pipe } from "effect";
import { ConfigError, ErrorCode, type GeneralError } from "./errors";
import {
  path,
  AbsolutePathSchema,
  type AbsolutePath as AbsolutePathType,
  joinPath,
  pathJoin,
} from "./types";

export const SYSTEM_PATHS: {
  readonly passwd: AbsolutePathType;
  readonly subuid: AbsolutePathType;
  readonly subgid: AbsolutePathType;
  readonly lingerDir: AbsolutePathType;
  readonly usrSbin: AbsolutePathType;
  readonly sbin: AbsolutePathType;
  readonly nologinPaths: readonly [AbsolutePathType, AbsolutePathType];
  readonly sysctlUnprivilegedPorts: AbsolutePathType;
} = {
  passwd: path("/etc/passwd"),
  subuid: path("/etc/subuid"),
  subgid: path("/etc/subgid"),
  lingerDir: path("/var/lib/systemd/linger"),
  usrSbin: path("/usr/sbin"),
  sbin: path("/sbin"),
  nologinPaths: [path("/usr/sbin/nologin"), path("/sbin/nologin")],
  sysctlUnprivilegedPorts: path("/etc/sysctl.d/50-divban-unprivileged-ports.conf"),
};

export const lookupUserHomeFromPasswd = (
  passwdContent: string,
  username: string
): Option.Option<AbsolutePathType> =>
  pipe(
    passwdContent.split("\n"),
    Arr.findFirst((line) => {
      const fields = line.split(":");
      return pipe(
        Arr.get(fields, 0),
        Option.map((name) => name === username),
        Option.getOrElse(() => false)
      );
    }),
    Option.flatMap((line) => {
      const fields = line.split(":");
      return pipe(
        Arr.get(fields, 5),
        Option.filter((p) => Schema.is(AbsolutePathSchema)(p))
      );
    })
  );

/**
 * Creates a memoized home directory lookup function.
 * The cache is encapsulated in a closure, not a module-level mutable variable.
 * Memoization is a controlled side effect pattern used in FP.
 */
const createMemoizedHomeDir = (): ((username: string) => AbsolutePathType) => {
  const cache = new Map<string, AbsolutePathType>();
  return (username: string): AbsolutePathType =>
    pipe(
      Option.fromNullable(cache.get(username)),
      Option.getOrElse(() => {
        const fallback = pathJoin(path("/home"), username);
        const result = pipe(
          Effect.try(() => readFileSync("/etc/passwd", "utf-8")),
          Effect.map((content) =>
            pipe(
              lookupUserHomeFromPasswd(content, username),
              Option.getOrElse(() => fallback)
            )
          ),
          Effect.catchAll(() => Effect.succeed(fallback)),
          Effect.runSync
        );
        cache.set(username, result);
        return result;
      })
    );
};

/**
 * Get user's home directory from /etc/passwd.
 * Falls back to /home/<username> if user not found.
 */
export const userHomeDir: (username: string) => AbsolutePathType = createMemoizedHomeDir();

export const userQuadletDir = (homeDir: AbsolutePathType): AbsolutePathType =>
  pathJoin(homeDir, ".config/containers/systemd");

export const userConfigDir = (homeDir: AbsolutePathType): AbsolutePathType =>
  pathJoin(homeDir, ".config/divban");

export const userDataDir = (homeDir: AbsolutePathType): AbsolutePathType =>
  pathJoin(homeDir, "data");

export const lingerFile = (username: string): AbsolutePathType =>
  pathJoin(SYSTEM_PATHS.lingerDir, username);

/** Rejects null bytes to prevent path injection attacks. */
const hasNullByte = (p: string): boolean => p.includes("\x00");

const resolveToAbsolute = (p: string): AbsolutePathType => {
  const normalized = normalize(p);
  return (
    normalized.startsWith("/") ? normalized : resolve(process.cwd(), normalized)
  ) as AbsolutePathType;
};

/** Use for all user-provided or config-file paths. */
export const toAbsolutePathEffect = (p: string): Effect.Effect<AbsolutePathType, ConfigError> =>
  hasNullByte(p)
    ? Effect.fail(
        new ConfigError({
          code: ErrorCode.CONFIG_VALIDATION_ERROR as 12,
          message: `Invalid path contains null byte: ${p}`,
        })
      )
    : Effect.succeed(resolveToAbsolute(p));

/** Use ONLY for trusted paths (hardcoded defaults, validated inputs). */
export const toAbsolutePathUnsafe = (p: string): AbsolutePathType => resolveToAbsolute(p);

export interface ServicePaths {
  dataDir: AbsolutePathType;
  configDir: AbsolutePathType;
  quadletDir: AbsolutePathType;
  homeDir: AbsolutePathType;
}

export const buildServicePaths = (
  homeDir: AbsolutePathType,
  dataDir: AbsolutePathType
): ServicePaths => ({
  dataDir,
  configDir: userConfigDir(homeDir),
  quadletDir: userQuadletDir(homeDir),
  homeDir,
});

export const quadletFilePath = (quadletDir: AbsolutePathType, filename: string): AbsolutePathType =>
  pathJoin(quadletDir, filename);

export const configFilePath = (configDir: AbsolutePathType, filename: string): AbsolutePathType =>
  pathJoin(configDir, filename);

export const TEMP_PATHS: {
  readonly generateDataDir: AbsolutePathType;
  readonly diffDataDir: AbsolutePathType;
  readonly nonexistent: AbsolutePathType;
} = {
  generateDataDir: path("/tmp/divban-generate"),
  diffDataDir: path("/tmp/divban-diff"),
  nonexistent: path("/nonexistent"),
};

export const outputQuadletDir = (
  outputDir: string
): Effect.Effect<AbsolutePathType, ConfigError | GeneralError> =>
  Effect.flatMap(toAbsolutePathEffect(outputDir), (absDir) => joinPath(absDir, "quadlets"));

export const outputConfigDir = (
  outputDir: string
): Effect.Effect<AbsolutePathType, ConfigError | GeneralError> =>
  Effect.flatMap(toAbsolutePathEffect(outputDir), (absDir) => joinPath(absDir, "config"));
