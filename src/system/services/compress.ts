// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Compress service using Context.Tag pattern.
 * Wraps all functions from src/system/compress.ts for dependency injection.
 * Works with isolatedDeclarations: true.
 */

import { Context, Layer } from "effect";
import {
  compressFile,
  compressFileZstd,
  compressionRatio,
  decompressFile,
  decompressFileZstd,
  deflateSync,
  gunzipString,
  gunzipSync,
  gzipString,
  gzipSync,
  inflateSync,
  spaceSavings,
  zstdCompress,
  zstdCompressString,
  zstdCompressSync,
  zstdDecompress,
  zstdDecompressString,
  zstdDecompressSync,
} from "../compress";

/**
 * Compress service interface - provides compression utilities via Effect DI.
 * Uses Bun's native compression APIs (gzip, deflate, zstd).
 */
export interface CompressService {
  // Gzip
  readonly gzipSync: typeof gzipSync;
  readonly gunzipSync: typeof gunzipSync;
  readonly gzipString: typeof gzipString;
  readonly gunzipString: typeof gunzipString;
  readonly compressFile: typeof compressFile;
  readonly decompressFile: typeof decompressFile;

  // Deflate
  readonly deflateSync: typeof deflateSync;
  readonly inflateSync: typeof inflateSync;

  // Zstd
  readonly zstdCompressSync: typeof zstdCompressSync;
  readonly zstdDecompressSync: typeof zstdDecompressSync;
  readonly zstdCompress: typeof zstdCompress;
  readonly zstdDecompress: typeof zstdDecompress;
  readonly zstdCompressString: typeof zstdCompressString;
  readonly zstdDecompressString: typeof zstdDecompressString;
  readonly compressFileZstd: typeof compressFileZstd;
  readonly decompressFileZstd: typeof decompressFileZstd;

  // Utilities
  readonly compressionRatio: typeof compressionRatio;
  readonly spaceSavings: typeof spaceSavings;
}

/**
 * Compress tag identifier type.
 * Used in Effect's R type parameter to track this dependency.
 */
export interface Compress {
  readonly _tag: "Compress";
}

/**
 * Compress context tag.
 * Use with `yield* Compress` to access the service in Effect generators.
 */
export const Compress: Context.Tag<Compress, CompressService> = Context.GenericTag<
  Compress,
  CompressService
>("divban/Compress");

/**
 * Compress live layer with all implementations.
 */
export const CompressLive: Layer.Layer<Compress> = Layer.succeed(Compress, {
  // Gzip
  gzipSync,
  gunzipSync,
  gzipString,
  gunzipString,
  compressFile,
  decompressFile,

  // Deflate
  deflateSync,
  inflateSync,

  // Zstd
  zstdCompressSync,
  zstdDecompressSync,
  zstdCompress,
  zstdDecompress,
  zstdCompressString,
  zstdDecompressString,
  compressFileZstd,
  decompressFileZstd,

  // Utilities
  compressionRatio,
  spaceSavings,
});
