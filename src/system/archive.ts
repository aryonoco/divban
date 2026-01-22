// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Archive utilities using Effect and Bun's native Archive API.
 * MUST be used for ALL archive operations - no external tar commands.
 */

import { Array as Arr, Effect, Option, pipe } from "effect";
import type { AbsolutePath } from "../lib/types";

export interface ArchiveMetadata {
  version: string;
  service: string;
  timestamp: string;
  files: string[];
}

/**
 * Safe JSON parse that returns Option instead of throwing.
 */
const parseJsonOption = <T>(str: string): Option.Option<T> => {
  try {
    return Option.some(JSON.parse(str) as T);
  } catch {
    return Option.none();
  }
};

/**
 * Create a tar archive with optional compression.
 * Uses Bun.Archive constructor directly - no temp files needed.
 */
export const createArchive = (
  files: Record<string, string | Uint8Array | Blob>,
  options?: { compress?: "gzip" | "zstd"; metadata?: ArchiveMetadata }
): Effect.Effect<Uint8Array, never> =>
  Effect.promise(async () => {
    // Convert all file contents to string or Uint8Array using Promise.all
    const processedEntries = await Promise.all(
      Object.entries(files).map(
        async ([name, content]): Promise<readonly [string, string | Uint8Array]> => {
          const processed =
            content instanceof Blob ? new Uint8Array(await content.arrayBuffer()) : content;
          return [name, processed] as const;
        }
      )
    );

    const archiveFiles: Record<string, string | Uint8Array> = {
      ...(options?.metadata ? { "metadata.json": JSON.stringify(options.metadata, null, 2) } : {}),
      ...Object.fromEntries(processedEntries),
    };

    // Create archive with optional gzip compression using Bun.Archive constructor
    // Note: Bun.Archive only supports "gzip" compression natively
    if (options?.compress === "gzip") {
      const archive = new Bun.Archive(archiveFiles, { compress: "gzip" });
      return archive.bytes();
    }

    // For zstd or no compression, create uncompressed archive first
    const archive = new Bun.Archive(archiveFiles);
    const tarData = await archive.bytes();

    // Apply zstd compression manually if requested
    if (options?.compress === "zstd") {
      return Bun.zstdCompressSync(tarData);
    }

    return tarData;
  });

/**
 * Extract a tar archive with optional decompression.
 * This MUST be used instead of subprocess tar commands.
 */
export const extractArchive = (
  data: Uint8Array,
  options?: { decompress?: "gzip" | "zstd" }
): Effect.Effect<Map<string, Uint8Array>, never> =>
  Effect.promise(async () => {
    // biome-ignore lint/suspicious/noExplicitAny: Bun type definitions don't perfectly match runtime
    let archiveData: any = data;
    if (options?.decompress === "gzip") {
      archiveData = Bun.gunzipSync(data as Uint8Array<ArrayBuffer>);
    } else if (options?.decompress === "zstd") {
      archiveData = Bun.zstdDecompressSync(data as Uint8Array<ArrayBuffer>);
    }

    const archive = new Bun.Archive(archiveData);
    const filesMap = await archive.files();

    const entries = await Promise.all(
      [...filesMap].map(
        async ([name, file]): Promise<readonly [string, Uint8Array]> =>
          [name, await file.bytes()] as const
      )
    );
    return new Map(entries);
  });

/**
 * List contents of a tar archive without extracting.
 */
export const listArchive = (
  data: Uint8Array,
  options?: { decompress?: "gzip" | "zstd" }
): Effect.Effect<string[], never> =>
  Effect.promise(async () => {
    // biome-ignore lint/suspicious/noExplicitAny: Bun type definitions don't perfectly match runtime
    let archiveData: any = data;
    if (options?.decompress === "gzip") {
      archiveData = Bun.gunzipSync(data as Uint8Array<ArrayBuffer>);
    } else if (options?.decompress === "zstd") {
      archiveData = Bun.zstdDecompressSync(data as Uint8Array<ArrayBuffer>);
    }

    const archive = new Bun.Archive(archiveData);
    const filesMap = await archive.files();

    return Array.from(filesMap.keys());
  });

/**
 * Read metadata from an archive.
 * Returns None if metadata.json is missing OR contains invalid JSON.
 */
export const readArchiveMetadata = (
  data: Uint8Array,
  options?: { decompress?: "gzip" | "zstd" }
): Effect.Effect<Option.Option<ArchiveMetadata>, never> =>
  Effect.gen(function* () {
    const files = yield* extractArchive(data, options);
    const metadataBytes = files.get("metadata.json");

    if (metadataBytes === undefined) {
      return Option.none();
    }

    return parseJsonOption<ArchiveMetadata>(new TextDecoder().decode(metadataBytes));
  });

/**
 * Create an archive from a directory.
 * Reads all files from the directory and adds them to the archive.
 */
export const createArchiveFromDirectory = (
  directory: AbsolutePath,
  options?: {
    compress?: "gzip" | "zstd";
    metadata?: ArchiveMetadata;
    exclude?: string[];
  }
): Effect.Effect<Uint8Array, never> =>
  Effect.promise(async () => {
    const glob = new Bun.Glob("**/*");
    const allPaths = await Array.fromAsync(glob.scan({ cwd: directory, onlyFiles: true }));

    // Pure filter using Arr.filter
    const includedPaths = pipe(
      allPaths,
      Arr.filter(
        (path) => !options?.exclude?.some((pattern) => path.startsWith(pattern) || path === pattern)
      )
    );

    // Parallel file reading
    const fileEntries = await Promise.all(
      includedPaths.map(
        async (path): Promise<readonly [string, Uint8Array]> => [
          path,
          await Bun.file(`${directory}/${path}`).bytes(),
        ]
      )
    );
    const files: Record<string, Uint8Array> = Object.fromEntries(fileEntries);

    // Prepare files object with metadata
    const archiveFiles: Record<string, string | Uint8Array> = {
      ...files,
      ...(options?.metadata ? { "metadata.json": JSON.stringify(options.metadata, null, 2) } : {}),
    };

    // Create archive with optional compression
    if (options?.compress === "gzip") {
      const archive = new Bun.Archive(archiveFiles, { compress: "gzip" });
      return archive.bytes();
    }

    const archive = new Bun.Archive(archiveFiles);
    const tarData = await archive.bytes();

    if (options?.compress === "zstd") {
      return Bun.zstdCompressSync(tarData);
    }

    return tarData;
  });

/**
 * Extract an archive to a directory.
 * Uses Bun.Archive.extract() for native extraction.
 * Returns the number of entries extracted (files, directories, symlinks).
 */
export const extractArchiveToDirectory = (
  data: Uint8Array,
  directory: AbsolutePath,
  options?: { decompress?: "gzip" | "zstd" }
): Effect.Effect<number, never> =>
  Effect.promise(async () => {
    let archiveData: Uint8Array = data;
    if (options?.decompress === "gzip") {
      archiveData = Bun.gunzipSync(data as Uint8Array<ArrayBuffer>);
    } else if (options?.decompress === "zstd") {
      archiveData = Bun.zstdDecompressSync(data as Uint8Array<ArrayBuffer>);
    }

    const archive = new Bun.Archive(archiveData);
    return await archive.extract(directory);
  });
