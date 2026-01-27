// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** Archive metadata, compression detection, and file collection shared by service backup implementations. */

import { Glob } from "bun";
import { Array as Arr, Effect, Option, pipe } from "effect";
import type { ArchiveMetadata } from "../system/archive";
import { CURRENT_BACKUP_SCHEMA_VERSION } from "./backup-compat";
import { collectAsyncOrDie } from "./collection-utils";
import { mapCharsToString } from "./str";
import { DIVBAN_PRODUCER_NAME, DIVBAN_VERSION } from "./version";

/** ISO timestamps contain `:` and `.` which are problematic in filenames. */
const sanitizeTimestamp = mapCharsToString((c) => (c === ":" || c === "." ? "-" : c));

export const createBackupTimestamp = (): string =>
  pipe(new Date().toISOString(), sanitizeTimestamp);

export const createBackupMetadata = (
  service: string,
  files: readonly string[]
): ArchiveMetadata => ({
  schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
  producer: DIVBAN_PRODUCER_NAME,
  producerVersion: DIVBAN_VERSION,
  service,
  timestamp: new Date().toISOString(),
  files,
});

const COMPRESSION_EXTENSIONS: readonly {
  readonly extensions: readonly string[];
  readonly format: "gzip" | "zstd";
}[] = [
  { extensions: [".tar.gz", ".gz"], format: "gzip" },
  { extensions: [".tar.zst", ".zst"], format: "zstd" },
];

export const detectCompressionFormat = (path: string): Option.Option<"gzip" | "zstd"> =>
  pipe(
    COMPRESSION_EXTENSIONS,
    Arr.findFirst((entry) => entry.extensions.some((ext) => path.endsWith(ext))),
    Option.map((entry) => entry.format)
  );

const notExcluded =
  (exclude: readonly string[]) =>
  (path: string): boolean =>
    !exclude.some((ex) => path.startsWith(ex) || path === ex);

export const scanDirectoryFiles = (
  dir: string,
  exclude: readonly string[] = []
): Effect.Effect<readonly string[], never> =>
  Effect.gen(function* () {
    const glob = new Glob("**/*");
    const files = yield* collectAsyncOrDie(glob.scan({ cwd: dir, onlyFiles: true }));

    return files.filter(notExcluded(exclude));
  });

interface FileWithContent {
  readonly path: string;
  readonly content: Uint8Array;
}

const readFileContent = (dir: string, path: string): Effect.Effect<FileWithContent> =>
  Effect.promise(async () => ({
    path,
    content: await Bun.file(`${dir}/${path}`).bytes(),
  }));

const buildFilesRecord = (
  entries: readonly FileWithContent[]
): Readonly<Record<string, Uint8Array>> =>
  Object.fromEntries(entries.map((e) => [e.path, e.content]));

export interface CollectedFiles {
  readonly files: Readonly<Record<string, Uint8Array>>;
  readonly fileList: readonly string[];
}

export const collectFilesWithContent = (
  dir: string,
  exclude: readonly string[] = []
): Effect.Effect<CollectedFiles, never> =>
  pipe(
    scanDirectoryFiles(dir, exclude),
    Effect.flatMap((paths) =>
      Effect.forEach(paths, (p) => readFileContent(dir, p), { concurrency: 10 })
    ),
    Effect.map((entries) => ({
      files: buildFilesRecord(entries),
      fileList: entries.map((e) => e.path),
    }))
  );
