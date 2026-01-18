// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Utility functions using Bun standard library.
 */

import { peek } from "bun";

// ============================================================================
// UUID Generation
// ============================================================================

/**
 * Generate a sortable UUID v7.
 * UUIDv7 is time-sortable, making it ideal for database keys and log correlation.
 */
export const generateId = (): string => Bun.randomUUIDv7();

/**
 * Generate a UUID v7 as a Buffer.
 */
export const generateIdBuffer = (): Buffer => Bun.randomUUIDv7("buffer");

/**
 * Generate a UUID v7 with base64url encoding (shorter string).
 */
export const generateIdBase64 = (): string => Bun.randomUUIDv7("base64url");

/**
 * Generate a random UUID v4 (standard random UUID).
 * Uses Bun.randomUUIDv7() for time-sortable UUIDs with better performance.
 */
export const generateUUID = (): string => Bun.randomUUIDv7();

// ============================================================================
// Timing
// ============================================================================

/**
 * Sleep for the specified number of milliseconds.
 * Uses Bun.sleep() for optimal performance.
 */
export const sleep = (ms: number): Promise<void> => Bun.sleep(ms);

/**
 * Blocking sleep (use sparingly, blocks event loop).
 */
export const sleepSync = (ms: number): void => Bun.sleepSync(ms);

// ============================================================================
// Terminal String Width (6,756x faster than string-width package)
// ============================================================================

export interface StringWidthOptions {
  /** Count ANSI escape codes as part of width (default: false) */
  countAnsiEscapeCodes?: boolean;
  /** Treat ambiguous-width characters as narrow (default: true) */
  ambiguousIsNarrow?: boolean;
}

/**
 * Get the display width of a string in terminal columns.
 * Properly handles Unicode, emoji, and ANSI escape codes.
 *
 * @example
 * stringWidth("hello") // 5
 * stringWidth("\u001b[31mhello\u001b[0m") // 5 (ANSI codes not counted)
 * stringWidth("👋") // 2 (emoji is wide)
 */
export const stringWidth = (text: string, options: StringWidthOptions = {}): number => {
  return Bun.stringWidth(text, options);
};

/**
 * Pad a string to a specific display width (right-pad with spaces).
 * Accounts for Unicode and emoji widths.
 *
 * @example
 * padEnd("hello", 10) // "hello     "
 * padEnd("👋", 5) // "👋   "
 */
export const padEnd = (text: string, width: number): string => {
  const currentWidth = Bun.stringWidth(text);
  const padding = Math.max(0, width - currentWidth);
  return text + " ".repeat(padding);
};

/**
 * Pad a string to a specific display width (left-pad with spaces).
 */
export const padStart = (text: string, width: number): string => {
  const currentWidth = Bun.stringWidth(text);
  const padding = Math.max(0, width - currentWidth);
  return " ".repeat(padding) + text;
};

/**
 * Center a string within a specific display width.
 */
export const center = (text: string, width: number): string => {
  const currentWidth = Bun.stringWidth(text);
  const totalPadding = Math.max(0, width - currentWidth);
  const leftPadding = Math.floor(totalPadding / 2);
  const rightPadding = totalPadding - leftPadding;
  return " ".repeat(leftPadding) + text + " ".repeat(rightPadding);
};

/**
 * Truncate a string to fit within a specific display width.
 * Adds ellipsis if truncated.
 */
export const truncate = (text: string, maxWidth: number, ellipsis = "..."): string => {
  const textWidth = Bun.stringWidth(text);
  if (textWidth <= maxWidth) {
    return text;
  }

  const ellipsisWidth = Bun.stringWidth(ellipsis);
  const targetWidth = maxWidth - ellipsisWidth;

  if (targetWidth <= 0) {
    return ellipsis.slice(0, maxWidth);
  }

  // Truncate character by character until we fit
  let result = "";
  let currentWidth = 0;

  for (const char of text) {
    const charWidth = Bun.stringWidth(char);
    if (currentWidth + charWidth > targetWidth) {
      break;
    }
    result += char;
    currentWidth += charWidth;
  }

  return result + ellipsis;
};

// ============================================================================
// Promise Inspection (Debug Utilities)
// ============================================================================

/**
 * Peek at a promise's value without awaiting (if already resolved).
 * Returns the value if resolved, the error if rejected, or the promise if pending.
 *
 * @example
 * const p = Promise.resolve(42);
 * peekPromise(p) // 42 (synchronously!)
 */
export const peekPromise = <T>(promise: Promise<T>): T | Promise<T> => {
  return peek(promise);
};

/**
 * Get the status of a promise without awaiting.
 * Returns "pending", "fulfilled", or "rejected".
 *
 * @example
 * const p = Promise.resolve(42);
 * promiseStatus(p) // "fulfilled"
 */
export const promiseStatus = (promise: Promise<unknown>): "pending" | "fulfilled" | "rejected" => {
  return peek.status(promise);
};

/**
 * Check if a promise is pending.
 */
export const isPending = (promise: Promise<unknown>): boolean => {
  return peek.status(promise) === "pending";
};

/**
 * Check if a promise is fulfilled.
 */
export const isFulfilled = (promise: Promise<unknown>): boolean => {
  return peek.status(promise) === "fulfilled";
};

/**
 * Check if a promise is rejected.
 */
export const isRejected = (promise: Promise<unknown>): boolean => {
  return peek.status(promise) === "rejected";
};

// ============================================================================
// HTML Escaping (480 MB/s - 20 GB/s performance)
// ============================================================================

/**
 * Escape HTML special characters in a string.
 * Optimized for large inputs with SIMD acceleration.
 *
 * Escapes: & < > " '
 *
 * @example
 * escapeHTML('<script>alert("xss")</script>')
 * // "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"
 */
export const escapeHTML = (text: string): string => {
  return Bun.escapeHTML(text);
};

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Convert a file:// URL to an absolute path.
 *
 * @example
 * fileURLToPath(new URL("file:///home/user/file.txt"))
 * // "/home/user/file.txt"
 */
export const fileURLToPath = (url: URL | string): string => {
  return Bun.fileURLToPath(url);
};

/**
 * Convert an absolute path to a file:// URL.
 *
 * @example
 * pathToFileURL("/home/user/file.txt")
 * // URL { href: "file:///home/user/file.txt" }
 */
export const pathToFileURL = (path: string): URL => {
  return Bun.pathToFileURL(path);
};

// ============================================================================
// Environment & Runtime Info
// ============================================================================

/**
 * Get the Bun version string.
 */
export const bunVersion = (): string => Bun.version;

/**
 * Get the git revision of the Bun build.
 */
export const bunRevision = (): string => Bun.revision;

/**
 * Check if this script is the main entry point.
 */
export const isMain = (): boolean => import.meta.main;

/**
 * Get the absolute path of the main entry point.
 */
export const mainPath = (): string => Bun.main;

// ============================================================================
// Module Resolution
// ============================================================================

/**
 * Resolve a module specifier to its absolute path.
 *
 * @example
 * resolveModule("zod", process.cwd())
 * // "/path/to/project/node_modules/zod/index.ts"
 */
export const resolveModule = (specifier: string, from: string): string => {
  return Bun.resolveSync(specifier, from);
};

// ============================================================================
// Stream Utilities
// ============================================================================

/**
 * Convert a ReadableStream to text.
 */
export const streamToText = (stream: ReadableStream<Uint8Array>): Promise<string> => {
  return Bun.readableStreamToText(stream);
};

/**
 * Convert a ReadableStream to a Uint8Array.
 */
export const streamToBytes = async (stream: ReadableStream<Uint8Array>): Promise<Uint8Array> => {
  return await Bun.readableStreamToBytes(stream);
};

/**
 * Convert a ReadableStream to JSON.
 */
export const streamToJSON = <T>(stream: ReadableStream<Uint8Array>): Promise<T> => {
  return Bun.readableStreamToJSON(stream) as Promise<T>;
};

/**
 * Convert a ReadableStream to an array of chunks.
 */
export const streamToArray = async <T>(stream: ReadableStream<T>): Promise<T[]> => {
  return await Bun.readableStreamToArray(stream);
};

/**
 * Convert a ReadableStream to a Blob.
 */
export const streamToBlob = (stream: ReadableStream<Uint8Array>): Promise<Blob> => {
  return Bun.readableStreamToBlob(stream);
};

// ============================================================================
// Base64 Encoding/Decoding (using Web APIs available in Bun)
// ============================================================================

/**
 * Encode a string to base64.
 */
export const base64Encode = (data: string): string => btoa(data);

/**
 * Decode a base64 string.
 */
export const base64Decode = (encoded: string): string => atob(encoded);

/**
 * Encode binary data to base64.
 */
export const base64EncodeBytes = (data: Uint8Array): string => {
  return Buffer.from(data).toString("base64");
};

/**
 * Decode base64 to Uint8Array.
 */
export const base64DecodeBytes = (encoded: string): Uint8Array => {
  return Buffer.from(encoded, "base64");
};

/**
 * URL-safe base64 encoding.
 */
export const base64UrlEncode = (data: string): string => {
  return btoa(data).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
};

// ============================================================================
// ANSI Color Utilities (using Bun.color)
// ============================================================================

/**
 * Get ANSI escape code for a color with automatic terminal detection.
 */
export const getAnsiColor = (
  color: string,
  format: "ansi" | "ansi-16m" | "ansi-256" | "ansi-16" = "ansi"
): string => Bun.color(color, format) ?? "";

/**
 * Check if the terminal supports colors.
 */
export const supportsColor = (): boolean => Bun.color("white", "ansi") !== null;

/**
 * Wrap text in ANSI color codes with automatic reset.
 */
export const colorize = (text: string, color: string): string => {
  const ansi = Bun.color(color, "ansi");
  return ansi ? `${ansi}${text}\x1b[0m` : text;
};

// ============================================================================
// Buffer Building (using ArrayBufferSink)
// ============================================================================

/**
 * Options for creating a buffer builder.
 */
export interface BufferBuilderOptions {
  /** Initial capacity in bytes (default: 16KB) */
  initialCapacity?: number;
  /** Whether to return buffer in stream mode for chunked reading */
  stream?: boolean;
}

/**
 * Create an efficient buffer builder using ArrayBufferSink.
 * Useful for incrementally building binary data.
 *
 * @example
 * const builder = createBufferBuilder();
 * builder.write("hello ");
 * builder.write("world");
 * const result = builder.end(); // Uint8Array
 */
export const createBufferBuilder = (
  options: BufferBuilderOptions = {}
): {
  write: (data: string | Uint8Array | ArrayBuffer) => number;
  flush: () => Uint8Array;
  end: () => Uint8Array;
} => {
  const sink = new Bun.ArrayBufferSink();
  sink.start({
    highWaterMark: options.initialCapacity ?? 16 * 1024,
    stream: options.stream ?? false,
    asUint8Array: true,
  });

  return {
    write: (data: string | Uint8Array | ArrayBuffer): number => {
      return sink.write(data);
    },
    flush: (): Uint8Array => {
      return sink.flush() as Uint8Array;
    },
    end: (): Uint8Array => {
      return sink.end() as Uint8Array;
    },
  };
};
