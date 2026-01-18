/**
 * Compression utilities using Bun's native compression APIs.
 * Provides gzip, deflate, and zstd compression without external dependencies.
 */

import type { ZlibCompressionOptions } from "bun";

/**
 * Compression levels for gzip/deflate.
 * Higher levels = better compression but slower.
 */
export type CompressionLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/**
 * Zstandard compression levels.
 * Range: 1-22, with 3 being the default balance of speed/ratio.
 */
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
  /** Compression level (0-9, default 6) */
  level?: CompressionLevel;
}

export interface ZstdOptions {
  /** Compression level (1-22, default 3) */
  level?: ZstdLevel;
}

// ============================================================================
// GZIP Compression (RFC 1952)
// ============================================================================

/**
 * Compress data using gzip (synchronous).
 * Best for general-purpose compression with wide compatibility.
 */
export const gzipSync = (data: Uint8Array<ArrayBuffer>, options: GzipOptions = {}): Uint8Array => {
  const zlibOptions: ZlibCompressionOptions = {
    level: options.level ?? 6,
  };
  return Bun.gzipSync(data, zlibOptions);
};

/**
 * Decompress gzip data (synchronous).
 */
export const gunzipSync = (data: Uint8Array<ArrayBuffer>): Uint8Array => {
  return Bun.gunzipSync(data);
};

/**
 * Compress a string using gzip and return as Uint8Array.
 */
export const gzipString = (text: string, options: GzipOptions = {}): Uint8Array => {
  return gzipSync(Buffer.from(text) as Uint8Array<ArrayBuffer>, options);
};

/**
 * Decompress gzip data and return as string.
 */
export const gunzipString = (data: Uint8Array<ArrayBuffer>): string => {
  const decompressed = gunzipSync(data);
  return Buffer.from(decompressed).toString("utf-8");
};

// ============================================================================
// DEFLATE Compression (RFC 1951)
// ============================================================================

/**
 * Compress data using deflate (synchronous).
 * Raw deflate without gzip headers - smaller output but less metadata.
 */
export const deflateSync = (
  data: Uint8Array<ArrayBuffer>,
  options: GzipOptions = {}
): Uint8Array => {
  const zlibOptions: ZlibCompressionOptions = {
    level: options.level ?? 6,
  };
  return Bun.deflateSync(data, zlibOptions);
};

/**
 * Decompress deflate data (synchronous).
 */
export const inflateSync = (data: Uint8Array<ArrayBuffer>): Uint8Array => {
  return Bun.inflateSync(data);
};

// ============================================================================
// Zstandard Compression (RFC 8878)
// ============================================================================

/**
 * Compress data using Zstandard (async).
 * Best balance of speed and compression ratio for modern applications.
 */
export const zstdCompress = (
  data: Uint8Array<ArrayBuffer>,
  options: ZstdOptions = {}
): Promise<Uint8Array> => {
  return Bun.zstdCompress(data, { level: options.level ?? 3 });
};

/**
 * Compress data using Zstandard (synchronous).
 */
export const zstdCompressSync = (
  data: Uint8Array<ArrayBuffer>,
  options: ZstdOptions = {}
): Uint8Array => {
  return Bun.zstdCompressSync(data, { level: options.level ?? 3 });
};

/**
 * Decompress Zstandard data (async).
 */
export const zstdDecompress = (data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> => {
  return Bun.zstdDecompress(data);
};

/**
 * Decompress Zstandard data (synchronous).
 */
export const zstdDecompressSync = (data: Uint8Array<ArrayBuffer>): Uint8Array => {
  return Bun.zstdDecompressSync(data);
};

/**
 * Compress a string using Zstandard and return as Uint8Array.
 */
export const zstdCompressString = (
  text: string,
  options: ZstdOptions = {}
): Promise<Uint8Array> => {
  return zstdCompress(Buffer.from(text) as Uint8Array<ArrayBuffer>, options);
};

/**
 * Decompress Zstandard data and return as string.
 */
export const zstdDecompressString = async (data: Uint8Array<ArrayBuffer>): Promise<string> => {
  const decompressed = await zstdDecompress(data);
  return Buffer.from(decompressed).toString("utf-8");
};

// ============================================================================
// File Compression Utilities
// ============================================================================

/**
 * Compress a file using gzip and write to destination.
 */
export const compressFile = async (
  sourcePath: string,
  destPath: string,
  options: GzipOptions = {}
): Promise<void> => {
  const sourceFile = Bun.file(sourcePath);
  const data = new Uint8Array(await sourceFile.arrayBuffer());
  const compressed = gzipSync(data, options);
  await Bun.write(destPath, compressed);
};

/**
 * Decompress a gzip file and write to destination.
 */
export const decompressFile = async (sourcePath: string, destPath: string): Promise<void> => {
  const sourceFile = Bun.file(sourcePath);
  const data = new Uint8Array(await sourceFile.arrayBuffer());
  const decompressed = gunzipSync(data);
  await Bun.write(destPath, decompressed);
};

/**
 * Compress a file using Zstandard and write to destination.
 * Zstd offers better compression ratios and speed than gzip.
 */
export const compressFileZstd = async (
  sourcePath: string,
  destPath: string,
  options: ZstdOptions = {}
): Promise<void> => {
  const sourceFile = Bun.file(sourcePath);
  const data = new Uint8Array(await sourceFile.arrayBuffer());
  const compressed = await zstdCompress(data, options);
  await Bun.write(destPath, compressed);
};

/**
 * Decompress a Zstandard file and write to destination.
 */
export const decompressFileZstd = async (sourcePath: string, destPath: string): Promise<void> => {
  const sourceFile = Bun.file(sourcePath);
  const data = new Uint8Array(await sourceFile.arrayBuffer());
  const decompressed = await zstdDecompress(data);
  await Bun.write(destPath, decompressed);
};

// ============================================================================
// Compression Ratio Utilities
// ============================================================================

/**
 * Calculate compression ratio (compressed size / original size).
 * Returns a value between 0 and 1, where lower is better compression.
 */
export const compressionRatio = (original: Uint8Array, compressed: Uint8Array): number => {
  return compressed.length / original.length;
};

/**
 * Calculate space savings percentage.
 * Returns percentage of space saved (0-100).
 */
export const spaceSavings = (original: Uint8Array, compressed: Uint8Array): number => {
  return (1 - compressed.length / original.length) * 100;
};
