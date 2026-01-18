// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * High-precision timing utilities using Bun.nanoseconds().
 * Provides nanosecond-precision timing for performance measurement.
 */

/**
 * Get the current time in nanoseconds since process start.
 * More precise than Date.now() for benchmarking.
 */
export const nanoseconds = (): number => Bun.nanoseconds();

/**
 * Get the current time in microseconds since process start.
 */
export const microseconds = (): number => Bun.nanoseconds() / 1_000;

/**
 * Get the current time in milliseconds since process start.
 * Higher precision than Date.now() for short operations.
 */
export const milliseconds = (): number => Bun.nanoseconds() / 1_000_000;

/**
 * Result of a timed operation.
 */
export interface TimedResult<T> {
  /** The result of the operation */
  result: T;
  /** Duration in nanoseconds */
  durationNs: number;
  /** Duration in microseconds */
  durationUs: number;
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Measure the duration of an async operation.
 *
 * @example
 * const { result, durationMs } = await measure(async () => {
 *   return await fetch("https://example.com");
 * });
 * console.log(`Fetch took ${durationMs.toFixed(2)}ms`);
 */
export const measure = async <T>(fn: () => Promise<T>): Promise<TimedResult<T>> => {
  const start = Bun.nanoseconds();
  const result = await fn();
  const durationNs = Bun.nanoseconds() - start;

  return {
    result,
    durationNs,
    durationUs: durationNs / 1_000,
    durationMs: durationNs / 1_000_000,
  };
};

/**
 * Measure the duration of a sync operation.
 *
 * @example
 * const { result, durationMs } = measureSync(() => {
 *   return heavyComputation();
 * });
 */
export const measureSync = <T>(fn: () => T): TimedResult<T> => {
  const start = Bun.nanoseconds();
  const result = fn();
  const durationNs = Bun.nanoseconds() - start;

  return {
    result,
    durationNs,
    durationUs: durationNs / 1_000,
    durationMs: durationNs / 1_000_000,
  };
};

/**
 * Create a stopwatch for measuring multiple intervals.
 *
 * @example
 * const sw = stopwatch();
 * await operation1();
 * console.log(`op1: ${sw.lapMs()}ms`);
 * await operation2();
 * console.log(`op2: ${sw.lapMs()}ms`);
 * console.log(`total: ${sw.elapsedMs()}ms`);
 */
export interface Stopwatch {
  elapsedNs: () => number;
  elapsedUs: () => number;
  elapsedMs: () => number;
  lapNs: () => number;
  lapUs: () => number;
  lapMs: () => number;
  reset: () => void;
}

export const stopwatch = (): Stopwatch => {
  const startNs = Bun.nanoseconds();
  let lastLapNs = startNs;

  return {
    /** Get elapsed nanoseconds since start */
    elapsedNs: (): number => Bun.nanoseconds() - startNs,

    /** Get elapsed microseconds since start */
    elapsedUs: (): number => (Bun.nanoseconds() - startNs) / 1_000,

    /** Get elapsed milliseconds since start */
    elapsedMs: (): number => (Bun.nanoseconds() - startNs) / 1_000_000,

    /** Get nanoseconds since last lap (or start) and record new lap */
    lapNs: (): number => {
      const now = Bun.nanoseconds();
      const lap = now - lastLapNs;
      lastLapNs = now;
      return lap;
    },

    /** Get microseconds since last lap (or start) and record new lap */
    lapUs: (): number => {
      const now = Bun.nanoseconds();
      const lap = now - lastLapNs;
      lastLapNs = now;
      return lap / 1_000;
    },

    /** Get milliseconds since last lap (or start) and record new lap */
    lapMs: (): number => {
      const now = Bun.nanoseconds();
      const lap = now - lastLapNs;
      lastLapNs = now;
      return lap / 1_000_000;
    },

    /** Reset the stopwatch */
    reset: (): void => {
      lastLapNs = Bun.nanoseconds();
    },
  };
};

/**
 * Format a duration in nanoseconds to a human-readable string.
 *
 * @example
 * formatDuration(1_500_000) // "1.50ms"
 * formatDuration(1_500_000_000) // "1.50s"
 * formatDuration(500) // "500ns"
 */
export const formatDuration = (ns: number): string => {
  if (ns >= 1_000_000_000) {
    return `${(ns / 1_000_000_000).toFixed(2)}s`;
  }
  if (ns >= 1_000_000) {
    return `${(ns / 1_000_000).toFixed(2)}ms`;
  }
  if (ns >= 1_000) {
    return `${(ns / 1_000).toFixed(2)}us`;
  }
  return `${ns.toFixed(0)}ns`;
};

/**
 * Create a simple timer that can be awaited.
 * More precise than setTimeout for short durations.
 *
 * @example
 * await delay(100); // Wait ~100ms
 */
export const delay = (ms: number): Promise<void> => Bun.sleep(ms);

/**
 * Create a deadline timer that throws if operation takes too long.
 *
 * @example
 * const result = await withDeadline(
 *   fetchData(),
 *   5000,
 *   "Data fetch timed out"
 * );
 */
export const withDeadline = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  message = "Operation timed out"
): Promise<T> => {
  const controller = new AbortController();

  const timeoutPromise = new Promise<never>((_, reject) => {
    const timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(message));
    }, timeoutMs);

    // Clean up timeout if promise resolves first
    promise.finally(() => clearTimeout(timeoutId));
  });

  return Promise.race([promise, timeoutPromise]);
};

/**
 * Debounce a function - only execute after delay since last call.
 */
export const debounce = <T extends (...args: unknown[]) => unknown>(
  fn: T,
  delayMs: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const debouncedFn = (...args: Parameters<T>): void => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delayMs);
  };
  return debouncedFn;
};

/**
 * Throttle a function - execute at most once per interval.
 */
export const throttle = <T extends (...args: unknown[]) => unknown>(
  fn: T,
  intervalMs: number
): ((...args: Parameters<T>) => void) => {
  let lastCall = 0;

  const throttledFn = (...args: Parameters<T>): void => {
    const now = Date.now();
    if (now - lastCall >= intervalMs) {
      lastCall = now;
      fn(...args);
    }
  };
  return throttledFn;
};
