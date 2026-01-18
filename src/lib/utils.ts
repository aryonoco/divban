/**
 * Utility functions using Bun standard library.
 */

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
 * Sleep for the specified number of milliseconds.
 * Uses Bun.sleep() for optimal performance.
 */
export const sleep = (ms: number): Promise<void> => Bun.sleep(ms);

/**
 * Generate a random UUID v4 (standard random UUID).
 */
export const generateUUID = (): string => crypto.randomUUID();
