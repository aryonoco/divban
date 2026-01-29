// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Compression using Bun's native APIs (gzip, deflate, zstd).
 *
 * Algorithm choice: Zstd for backups (better ratio at comparable speed),
 * gzip for external tool compatibility. Deflate when headers are unwanted.
 *
 * Sync vs async: Sync functions block the event loop; acceptable for small
 * data or cold paths. Use async variants for large files in latency-sensitive code.
 */

import type { ZlibCompressionOptions } from "bun";
import { Effect } from "effect";
import type { AbsolutePath } from "../lib/types";

/** 0 = no compression, 9 = maximum. Default 6 balances speed and ratio. */
export type CompressionLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** 1-22 range. Default 3 balances speed and ratio; 19+ for archival. */
export type ZstdLevel =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20
  | 21
  | 22;

export interface GzipOptions {
  level?: CompressionLevel;
}

export interface ZstdOptions {
  level?: ZstdLevel;
}

// ============================================================================
// GZIP Compression (RFC 1952) - wide compatibility with external tools
// ============================================================================

export const gzipSync = (data: Uint8Array<ArrayBuffer>, options: GzipOptions = {}): Uint8Array => {
  const zlibOptions: ZlibCompressionOptions = {
    level: options.level ?? 6,
  };
  return Bun.gzipSync(data, zlibOptions);
};

export const gunzipSync = (data: Uint8Array<ArrayBuffer>): Uint8Array => {
  return Bun.gunzipSync(data);
};

export const gzipString = (text: string, options: GzipOptions = {}): Uint8Array => {
  return gzipSync(Buffer.from(text) as Uint8Array<ArrayBuffer>, options);
};

export const gunzipString = (data: Uint8Array<ArrayBuffer>): string => {
  const decompressed = gunzipSync(data);
  return Buffer.from(decompressed).toString("utf-8");
};

// ============================================================================
// DEFLATE Compression (RFC 1951) - raw format without gzip headers/metadata
// ============================================================================

export const deflateSync = (
  data: Uint8Array<ArrayBuffer>,
  options: GzipOptions = {}
): Uint8Array => {
  const zlibOptions: ZlibCompressionOptions = {
    level: options.level ?? 6,
  };
  return Bun.deflateSync(data, zlibOptions);
};

export const inflateSync = (data: Uint8Array<ArrayBuffer>): Uint8Array => {
  return Bun.inflateSync(data);
};

// ============================================================================
// Zstandard Compression (RFC 8878) - preferred for backups
// ============================================================================

export const zstdCompress = (
  data: Uint8Array<ArrayBuffer>,
  options: ZstdOptions = {}
): Promise<Uint8Array> => {
  return Bun.zstdCompress(data, { level: options.level ?? 3 });
};

export const zstdCompressSync = (
  data: Uint8Array<ArrayBuffer>,
  options: ZstdOptions = {}
): Uint8Array => {
  return Bun.zstdCompressSync(data, { level: options.level ?? 3 });
};

export const zstdDecompress = (data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> => {
  return Bun.zstdDecompress(data);
};

export const zstdDecompressSync = (data: Uint8Array<ArrayBuffer>): Uint8Array => {
  return Bun.zstdDecompressSync(data);
};

export const zstdCompressString = (
  text: string,
  options: ZstdOptions = {}
): Promise<Uint8Array> => {
  return zstdCompress(Buffer.from(text) as Uint8Array<ArrayBuffer>, options);
};

export const zstdDecompressString = async (data: Uint8Array<ArrayBuffer>): Promise<string> => {
  const decompressed = await zstdDecompress(data);
  return Buffer.from(decompressed).toString("utf-8");
};

// ============================================================================
// File Compression Utilities
// ============================================================================

export const compressFile = async (
  sourcePath: string,
  destPath: string,
  options: GzipOptions = {}
): Promise<void> => {
  const data = await Bun.file(sourcePath).bytes();
  const compressed = gzipSync(data, options);
  await Bun.write(destPath, compressed);
};

export const decompressFile = async (sourcePath: string, destPath: string): Promise<void> => {
  const data = await Bun.file(sourcePath).bytes();
  const decompressed = gunzipSync(data);
  await Bun.write(destPath, decompressed);
};

export const compressFileZstd = async (
  sourcePath: string,
  destPath: string,
  options: ZstdOptions = {}
): Promise<void> => {
  const data = await Bun.file(sourcePath).bytes();
  const compressed = await zstdCompress(data, options);
  await Bun.write(destPath, compressed);
};

export const decompressFileZstd = async (sourcePath: string, destPath: string): Promise<void> => {
  const data = await Bun.file(sourcePath).bytes();
  const decompressed = await zstdDecompress(data);
  await Bun.write(destPath, decompressed);
};

// ============================================================================
// Compression Ratio Utilities
// ============================================================================

/** Returns 0-1 where lower is better. E.g., 0.3 means 70% size reduction. */
export const compressionRatio = (original: Uint8Array, compressed: Uint8Array): number => {
  return compressed.length / original.length;
};

/** Returns 0-100 percentage. E.g., 70 means 70% space saved. */
export const spaceSavings = (original: Uint8Array, compressed: Uint8Array): number => {
  return (1 - compressed.length / original.length) * 100;
};

// ============================================================================
// Effect-Wrapped Compression Functions
// ============================================================================
// Wrap sync functions with Effect.sync, async with Effect.promise.
// Use these in Effect.gen chains for composition with other effects.

export const gzipEffect = (
  data: Uint8Array<ArrayBuffer>,
  options: GzipOptions = {}
): Effect.Effect<Uint8Array> => Effect.sync(() => gzipSync(data, options));

export const gunzipEffect = (data: Uint8Array<ArrayBuffer>): Effect.Effect<Uint8Array> =>
  Effect.sync(() => gunzipSync(data));

export const gzipStringEffect = (
  text: string,
  options: GzipOptions = {}
): Effect.Effect<Uint8Array> => Effect.sync(() => gzipString(text, options));

export const gunzipStringEffect = (data: Uint8Array<ArrayBuffer>): Effect.Effect<string> =>
  Effect.sync(() => gunzipString(data));

export const deflateEffect = (
  data: Uint8Array<ArrayBuffer>,
  options: GzipOptions = {}
): Effect.Effect<Uint8Array> => Effect.sync(() => deflateSync(data, options));

export const inflateEffect = (data: Uint8Array<ArrayBuffer>): Effect.Effect<Uint8Array> =>
  Effect.sync(() => inflateSync(data));

export const zstdCompressEffect = (
  data: Uint8Array<ArrayBuffer>,
  options: ZstdOptions = {}
): Effect.Effect<Uint8Array> => Effect.promise(() => zstdCompress(data, options));

export const zstdDecompressEffect = (data: Uint8Array<ArrayBuffer>): Effect.Effect<Uint8Array> =>
  Effect.promise(() => zstdDecompress(data));

export const zstdCompressStringEffect = (
  text: string,
  options: ZstdOptions = {}
): Effect.Effect<Uint8Array> => Effect.promise(() => zstdCompressString(text, options));

export const zstdDecompressStringEffect = (data: Uint8Array<ArrayBuffer>): Effect.Effect<string> =>
  Effect.promise(() => zstdDecompressString(data));

export const compressFileEffect = (
  src: AbsolutePath,
  dest: AbsolutePath,
  options: GzipOptions = {}
): Effect.Effect<void> => Effect.promise(() => compressFile(src, dest, options));

export const decompressFileEffect = (src: AbsolutePath, dest: AbsolutePath): Effect.Effect<void> =>
  Effect.promise(() => decompressFile(src, dest));

export const compressFileZstdEffect = (
  src: AbsolutePath,
  dest: AbsolutePath,
  options: ZstdOptions = {}
): Effect.Effect<void> => Effect.promise(() => compressFileZstd(src, dest, options));

export const decompressFileZstdEffect = (
  src: AbsolutePath,
  dest: AbsolutePath
): Effect.Effect<void> => Effect.promise(() => decompressFileZstd(src, dest));
