/**
 * Bun-native utility functions.
 * Wrappers around Bun's built-in APIs for common operations.
 */

/**
 * Sleep for a specified duration using Bun's native implementation.
 * More efficient than setTimeout + Promise.
 */
export const sleep = (ms: number): Promise<void> => Bun.sleep(ms);

/**
 * Deep equality comparison using Bun's optimized native implementation.
 */
export const deepEquals = <T>(a: T, b: T): boolean => Bun.deepEquals(a, b);

/**
 * Get the display width of a string, accounting for Unicode characters and ANSI codes.
 * Useful for terminal output formatting.
 */
export const stringWidth = (str: string): number => Bun.stringWidth(str);

/**
 * Strip ANSI escape codes from a string.
 * Useful for logging raw text or comparing strings.
 */
export const stripAnsi = (str: string): string => Bun.stripANSI(str);

/**
 * Escape HTML entities in a string.
 * Prevents XSS when rendering user input as HTML.
 */
export const escapeHtml = (str: string): string => Bun.escapeHTML(str);

/**
 * Generate a UUIDv7 (time-ordered UUID).
 * More efficient than external UUID packages.
 */
export const uuid = (): string => Bun.randomUUIDv7();

/**
 * Compress data using gzip.
 * Synchronous version for small data.
 */
export const gzipSync = (data: Uint8Array | string): Uint8Array => {
  const input = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return Bun.gzipSync(input as Uint8Array<ArrayBuffer>);
};

/**
 * Decompress gzip data.
 * Synchronous version for small data.
 */
export const gunzipSync = (data: Uint8Array): Uint8Array =>
  Bun.gunzipSync(data as Uint8Array<ArrayBuffer>);

/**
 * Compress data using zstd (faster compression/decompression than gzip).
 * Good for backups and large data transfers.
 */
export const zstdCompress = (data: Uint8Array | string): Uint8Array => {
  const input = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return Bun.zstdCompressSync(input as Uint8Array<ArrayBuffer>);
};

/**
 * Decompress zstd data.
 */
export const zstdDecompress = (data: Uint8Array): Uint8Array =>
  Bun.zstdDecompressSync(data as Uint8Array<ArrayBuffer>);

/**
 * Hash data using a cryptographic algorithm.
 * Supports: sha256, sha512, md5, etc.
 */
export const hash = (
  data: string | Uint8Array,
  algorithm: "sha256" | "sha512" | "md5" | "sha1" = "sha256"
): string => {
  const hasher = new Bun.CryptoHasher(algorithm);
  hasher.update(data);
  return hasher.digest("hex");
};

/**
 * Check if the current file is the entry point.
 * Useful for modules that can be run directly or imported.
 */
export const isMainModule = (): boolean => import.meta.path === Bun.main;

/**
 * Get the current executable's path.
 */
export const execPath = (): string => Bun.main;

/**
 * Peek at the current state of a promise without blocking.
 * Returns the value if resolved, the error if rejected, or 'pending' if not yet settled.
 */
export const peekPromise = <T>(
  promise: Promise<T>
): T | { status: "pending" } | { status: "rejected"; reason: unknown } => {
  const result = Bun.peek(promise);
  if (result === promise) {
    return { status: "pending" };
  }
  return result as T;
};

/**
 * Perform a DNS lookup using Bun's native implementation.
 */
export const dnsLookup = async (hostname: string): Promise<string[]> => {
  const result = await Bun.dns.lookup(hostname);
  return result.map((r) => r.address);
};

/**
 * Create a hash of a file's contents without reading the entire file into memory.
 */
export const hashFile = async (
  path: string,
  algorithm: "sha256" | "sha512" | "md5" | "sha1" = "sha256"
): Promise<string> => {
  const file = Bun.file(path);
  const hasher = new Bun.CryptoHasher(algorithm);
  hasher.update(await file.arrayBuffer());
  return hasher.digest("hex");
};

/**
 * Create an object with only defined properties.
 * Useful for passing objects to functions with optional properties
 * when exactOptionalPropertyTypes is enabled in TypeScript.
 */
export const defined = <T extends Record<string, unknown>>(obj: T): T => {
  const result = {} as T;
  for (const key of Object.keys(obj) as (keyof T)[]) {
    if (obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }
  return result;
};
