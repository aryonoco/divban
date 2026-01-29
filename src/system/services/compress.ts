// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Compression service for Effect dependency injection.
 *
 * Wraps primitives from ../compress.ts for testable, mockable compression.
 * Use this service in Effect.gen chains where DI is needed. For one-off
 * compression outside Effect context, import ../compress.ts directly.
 */

import { Context, Layer } from "effect";
import {
  compressFile,
  compressFileEffect,
  compressFileZstd,
  compressFileZstdEffect,
  compressionRatio,
  decompressFile,
  decompressFileEffect,
  decompressFileZstd,
  decompressFileZstdEffect,
  deflateEffect,
  deflateSync,
  gunzipEffect,
  gunzipString,
  gunzipStringEffect,
  gunzipSync,
  gzipEffect,
  gzipString,
  gzipStringEffect,
  gzipSync,
  inflateEffect,
  inflateSync,
  spaceSavings,
  zstdCompress,
  zstdCompressEffect,
  zstdCompressString,
  zstdCompressStringEffect,
  zstdCompressSync,
  zstdDecompress,
  zstdDecompressEffect,
  zstdDecompressString,
  zstdDecompressStringEffect,
  zstdDecompressSync,
} from "../compress";

export interface CompressService {
  // Gzip/Deflate: wide compatibility, use for external tool interop
  readonly gzipSync: typeof gzipSync;
  readonly gunzipSync: typeof gunzipSync;
  readonly gzipString: typeof gzipString;
  readonly gunzipString: typeof gunzipString;
  readonly compressFile: typeof compressFile;
  readonly decompressFile: typeof decompressFile;
  readonly gzipEffect: typeof gzipEffect;
  readonly gunzipEffect: typeof gunzipEffect;
  readonly gzipStringEffect: typeof gzipStringEffect;
  readonly gunzipStringEffect: typeof gunzipStringEffect;
  readonly compressFileEffect: typeof compressFileEffect;
  readonly decompressFileEffect: typeof decompressFileEffect;
  readonly deflateSync: typeof deflateSync;
  readonly inflateSync: typeof inflateSync;
  readonly deflateEffect: typeof deflateEffect;
  readonly inflateEffect: typeof inflateEffect;

  // Zstd: better ratio and speed, preferred for backups
  readonly zstdCompressSync: typeof zstdCompressSync;
  readonly zstdDecompressSync: typeof zstdDecompressSync;
  readonly zstdCompress: typeof zstdCompress;
  readonly zstdDecompress: typeof zstdDecompress;
  readonly zstdCompressString: typeof zstdCompressString;
  readonly zstdDecompressString: typeof zstdDecompressString;
  readonly compressFileZstd: typeof compressFileZstd;
  readonly decompressFileZstd: typeof decompressFileZstd;
  readonly zstdCompressEffect: typeof zstdCompressEffect;
  readonly zstdDecompressEffect: typeof zstdDecompressEffect;
  readonly zstdCompressStringEffect: typeof zstdCompressStringEffect;
  readonly zstdDecompressStringEffect: typeof zstdDecompressStringEffect;
  readonly compressFileZstdEffect: typeof compressFileZstdEffect;
  readonly decompressFileZstdEffect: typeof decompressFileZstdEffect;

  readonly compressionRatio: typeof compressionRatio;
  readonly spaceSavings: typeof spaceSavings;
}

/** Phantom type for compile-time service distinction. */
export interface Compress {
  readonly _tag: "Compress";
}

/** Access via `yield* Compress` in Effect.gen blocks. */
export const Compress: Context.Tag<Compress, CompressService> = Context.GenericTag<
  Compress,
  CompressService
>("divban/Compress");

export const CompressLive: Layer.Layer<Compress> = Layer.succeed(Compress, {
  gzipSync,
  gunzipSync,
  gzipString,
  gunzipString,
  compressFile,
  decompressFile,
  gzipEffect,
  gunzipEffect,
  gzipStringEffect,
  gunzipStringEffect,
  compressFileEffect,
  decompressFileEffect,
  deflateSync,
  inflateSync,
  deflateEffect,
  inflateEffect,
  zstdCompressSync,
  zstdDecompressSync,
  zstdCompress,
  zstdDecompress,
  zstdCompressString,
  zstdDecompressString,
  compressFileZstd,
  decompressFileZstd,
  zstdCompressEffect,
  zstdDecompressEffect,
  zstdCompressStringEffect,
  zstdDecompressStringEffect,
  compressFileZstdEffect,
  decompressFileZstdEffect,
  compressionRatio,
  spaceSavings,
});
