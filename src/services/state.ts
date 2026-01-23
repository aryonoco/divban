// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Runtime state discovery from filesystem.
 *
 * The quadlet files written during setup ARE the persisted state.
 * At runtime, we derive RuntimeState by scanning the quadlet directory:
 * - *.container files -> container names
 * - *.network files -> network names
 * - *.volume files -> volume names
 * - Volume= lines -> dataDir (bind mount paths)
 *
 * Benefits:
 * - Single source of truth - no duplication between state file and quadlets
 * - State always matches what's actually deployed
 * - Self-healing - manual quadlet edits automatically reflected
 * - No extra serialization format to maintain
 */

import { Array as Arr, Effect, Option, type ParseResult, pipe } from "effect";
import { ConfigError, ErrorCode, type SystemError } from "../lib/errors";
import {
  type AbsolutePath,
  type ContainerName,
  type NetworkName,
  type VolumeName,
  decodeContainerName,
  decodeNetworkName,
  decodeVolumeName,
  pathJoin,
} from "../lib/types";
import { globFiles, readFile } from "../system/fs";
import type { RuntimeStateValue } from "./context";

/** Extract basename without extension: "/path/to/foo.container" -> "foo" */
const basenameWithoutExt = (filePath: string, ext: string): string =>
  pipe(
    filePath.split("/"),
    Arr.last,
    Option.map((name): string => (name.endsWith(ext) ? name.slice(0, -ext.length) : name)),
    Option.getOrElse((): string => "")
  );

/** Generic discovery - DRY helper for all quadlet file types. */
const discoverByExtension = <T>(
  quadletDir: AbsolutePath,
  ext: string,
  decode: (s: string) => Effect.Effect<T, ParseResult.ParseError>
): Effect.Effect<readonly T[], never> =>
  pipe(
    globFiles(`*${ext}`, { cwd: quadletDir }),
    Effect.map(Arr.map((p): string => basenameWithoutExt(p, ext))),
    Effect.flatMap((names) =>
      Effect.forEach(
        names,
        (name): Effect.Effect<T | null, never> =>
          decode(name).pipe(Effect.orElseSucceed((): null => null)),
        { concurrency: "unbounded" }
      )
    ),
    Effect.map(Arr.filter((n): n is T => n !== null))
  );

/** Parse Volume= lines from quadlet content. Returns absolute host paths only. */
const parseBindMounts = (content: string): readonly string[] =>
  pipe(
    content.split("\n"),
    Arr.filter((line): boolean => line.startsWith("Volume=")),
    Arr.map((line): string => line.slice(7)),
    Arr.map((spec): string => {
      const colonIndex = spec.indexOf(":");
      return colonIndex === -1 ? spec : spec.slice(0, colonIndex);
    }),
    Arr.filter((mountPath): boolean => mountPath.startsWith("/"))
  );

/** Extract dataDir from quadlet bind mounts. */
const discoverDataDir = (
  quadletDir: AbsolutePath,
  containers: readonly ContainerName[]
): Effect.Effect<AbsolutePath, ConfigError | SystemError> =>
  Effect.gen(function* () {
    const containerPaths = containers.map(
      (name): AbsolutePath => pathJoin(quadletDir, `${name}.container`)
    );

    const allMounts = yield* pipe(
      Effect.forEach(
        containerPaths,
        (containerPath): Effect.Effect<readonly string[], never> =>
          pipe(
            readFile(containerPath),
            Effect.map(parseBindMounts),
            Effect.orElseSucceed((): readonly string[] => [])
          ),
        { concurrency: "unbounded" }
      ),
      Effect.map(Arr.flatten)
    );

    return yield* pipe(
      Arr.head(allMounts),
      Option.map((mount): AbsolutePath => {
        const parts = mount.split("/");
        return parts.slice(0, -1).join("/") as AbsolutePath;
      }),
      Option.match({
        onNone: (): Effect.Effect<AbsolutePath, ConfigError> =>
          Effect.fail(
            new ConfigError({
              code: ErrorCode.CONFIG_NOT_FOUND as 10,
              message: "No bind mounts found in quadlet files to determine dataDir",
            })
          ),
        onSome: (dir): Effect.Effect<AbsolutePath, never> => Effect.succeed(dir),
      })
    );
  });

/** Discover runtime state from filesystem. */
export const discoverRuntimeState = (
  quadletDir: AbsolutePath,
  configDir: AbsolutePath
): Effect.Effect<RuntimeStateValue, ConfigError | SystemError> =>
  Effect.gen(function* () {
    const [containers, networks, volumes] = yield* Effect.all([
      discoverByExtension<ContainerName>(quadletDir, ".container", decodeContainerName),
      discoverByExtension<NetworkName>(quadletDir, ".network", decodeNetworkName),
      discoverByExtension<VolumeName>(quadletDir, ".volume", decodeVolumeName),
    ]);

    yield* pipe(
      containers.length > 0,
      (hasContainers): Effect.Effect<void, ConfigError> =>
        hasContainers
          ? Effect.void
          : Effect.fail(
              new ConfigError({
                code: ErrorCode.CONFIG_NOT_FOUND as 10,
                message: `No containers found in ${quadletDir}. Run 'divban <service> setup' first.`,
              })
            )
    );

    const dataDir = yield* discoverDataDir(quadletDir, containers);
    return { containers, networks, volumes, dataDir, configDir, quadletDir };
  });
