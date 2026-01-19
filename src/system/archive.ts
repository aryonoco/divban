// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Archive utilities using Bun's native Archive API.
 * MUST be used for ALL archive operations - no external tar commands.
 */

import { None, type Option, Some, fromUndefined, isNone } from "../lib/option";
import type { AbsolutePath } from "../lib/types";

export interface ArchiveMetadata {
  version: string;
  service: string;
  timestamp: string;
  files: string[];
}

/**
 * Create a tar archive with optional compression.
 * Uses Bun.Archive constructor directly - no temp files needed.
 */
export const createArchive = async (
  files: Record<string, string | Uint8Array | Blob>,
  options?: { compress?: "gzip" | "zstd"; metadata?: ArchiveMetadata }
): Promise<Uint8Array> => {
  // Prepare files object with proper content types
  const archiveFiles: Record<string, string | Uint8Array> = {};

  // Always include metadata if provided
  if (options?.metadata) {
    archiveFiles["metadata.json"] = JSON.stringify(options.metadata, null, 2);
  }

  // Convert all file contents to string or Uint8Array
  for (const [name, content] of Object.entries(files)) {
    if (typeof content === "string") {
      archiveFiles[name] = content;
    } else if (content instanceof Blob) {
      archiveFiles[name] = new Uint8Array(await content.arrayBuffer());
    } else {
      archiveFiles[name] = content;
    }
  }

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
};

/**
 * Extract a tar archive with optional decompression.
 * This MUST be used instead of subprocess tar commands.
 */
export const extractArchive = async (
  data: Uint8Array,
  options?: { decompress?: "gzip" | "zstd" }
): Promise<Map<string, Uint8Array>> => {
  // biome-ignore lint/suspicious/noExplicitAny: Bun type definitions don't perfectly match runtime
  let archiveData: any = data;
  if (options?.decompress === "gzip") {
    archiveData = Bun.gunzipSync(data as Uint8Array<ArrayBuffer>);
  } else if (options?.decompress === "zstd") {
    archiveData = Bun.zstdDecompressSync(data as Uint8Array<ArrayBuffer>);
  }

  const archive = new Bun.Archive(archiveData);
  const filesMap = await archive.files();

  const result = new Map<string, Uint8Array>();
  for (const [name, file] of filesMap) {
    result.set(name, await file.bytes());
  }
  return result;
};

/**
 * List contents of a tar archive without extracting.
 */
export const listArchive = async (
  data: Uint8Array,
  options?: { decompress?: "gzip" | "zstd" }
): Promise<string[]> => {
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
};

/**
 * Read metadata from an archive.
 */
export const readArchiveMetadata = async (
  data: Uint8Array,
  options?: { decompress?: "gzip" | "zstd" }
): Promise<Option<ArchiveMetadata>> => {
  const files = await extractArchive(data, options);
  const metadataBytes = fromUndefined(files.get("metadata.json"));
  if (isNone(metadataBytes)) {
    return None;
  }
  return Some(JSON.parse(new TextDecoder().decode(metadataBytes.value)));
};

/**
 * Create an archive from a directory.
 * Reads all files from the directory and adds them to the archive.
 */
export const createArchiveFromDirectory = async (
  directory: AbsolutePath,
  options?: {
    compress?: "gzip" | "zstd";
    metadata?: ArchiveMetadata;
    exclude?: string[];
  }
): Promise<Uint8Array> => {
  const glob = new Bun.Glob("**/*");
  const files: Record<string, Uint8Array> = {};

  for await (const path of glob.scan({ cwd: directory, onlyFiles: true })) {
    // Skip excluded paths
    if (options?.exclude?.some((pattern) => path.startsWith(pattern) || path === pattern)) {
      continue;
    }

    const fullPath = `${directory}/${path}`;
    files[path] = await Bun.file(fullPath).bytes();
  }

  return createArchive(files, options);
};

/**
 * Extract an archive to a directory.
 * Uses Bun.Archive.extract() for native extraction.
 * Returns the number of entries extracted (files, directories, symlinks).
 */
export const extractArchiveToDirectory = async (
  data: Uint8Array,
  directory: AbsolutePath,
  options?: { decompress?: "gzip" | "zstd" }
): Promise<number> => {
  let archiveData: Uint8Array = data;
  if (options?.decompress === "gzip") {
    archiveData = Bun.gunzipSync(data as Uint8Array<ArrayBuffer>);
  } else if (options?.decompress === "zstd") {
    archiveData = Bun.zstdDecompressSync(data as Uint8Array<ArrayBuffer>);
  }

  const archive = new Bun.Archive(archiveData);
  return await archive.extract(directory);
};
