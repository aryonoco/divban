// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Retry utilities using Effect Schedule for transient failure handling.
 */

import { Array as Arr, Duration, type Duration as EffectDuration, Schedule, pipe } from "effect";
import type { GeneralError, ServiceError, SystemError } from "./errors";

// ============================================================================
// Retry Schedules
// ============================================================================

/**
 * Quick operations: status checks, file reads, short commands.
 * - 100ms fixed interval
 * - 3 retries (4 total attempts)
 *
 * Uses Schedule.intersect to combine timing with retry limit.
 */
export const quickRetrySchedule: Schedule.Schedule<[number, number], unknown, never> = pipe(
  Schedule.spaced(Duration.millis(100)),
  Schedule.intersect(Schedule.recurs(3))
);

/**
 * System operations: systemctl, loginctl, podman.
 * - Exponential backoff starting at 200ms
 * - Jittered to prevent thundering herd (AWS best practice)
 * - 4 retries (5 total attempts)
 */
export const systemRetrySchedule: Schedule.Schedule<
  [EffectDuration.Duration, number],
  unknown,
  never
> = pipe(
  Schedule.exponential(Duration.millis(200)),
  Schedule.jittered,
  Schedule.intersect(Schedule.recurs(4))
);

/**
 * Heavy operations: daemon-reload, service start, database operations.
 * - Exponential backoff starting at 500ms
 * - Jittered to prevent thundering herd
 * - 3 retries (4 total attempts)
 */
export const heavyRetrySchedule: Schedule.Schedule<
  [EffectDuration.Duration, number],
  unknown,
  never
> = pipe(
  Schedule.exponential(Duration.millis(500)),
  Schedule.jittered,
  Schedule.intersect(Schedule.recurs(3))
);

/**
 * Polling schedule for waiting on state changes.
 * - Fixed interval polling
 * - Configurable max wait time and interval
 */
export const pollingSchedule = (
  maxWaitMs: number,
  intervalMs = 100
): Schedule.Schedule<[number, number], unknown, never> =>
  pipe(
    Schedule.spaced(Duration.millis(intervalMs)),
    Schedule.intersect(Schedule.recurs(Math.ceil(maxWaitMs / intervalMs) - 1))
  );

// ============================================================================
// Error Classification
// ============================================================================

/**
 * Transient error patterns in stderr/message that indicate retry is appropriate.
 * These are substrings that appear in error messages for retryable conditions.
 */
const TRANSIENT_ERROR_PATTERNS: readonly string[] = [
  "connection refused",
  "connection reset",
  "connection timed out",
  "temporarily unavailable",
  "resource temporarily unavailable",
  "device or resource busy",
  "text file busy",
  "eagain",
  "ebusy",
  "etimedout",
  "econnrefused",
  "econnreset",
  "no route to host",
  "network is unreachable",
  "dbus",
  "bus connection",
  "failed to connect",
  "socket not found",
  "operation timed out",
];

/**
 * Permanent error patterns that should NOT be retried.
 * If any of these appear, fail immediately.
 */
const PERMANENT_ERROR_PATTERNS: readonly string[] = [
  "no such file or directory",
  "permission denied",
  "operation not permitted",
  "invalid argument",
  "not found",
  "does not exist",
  "unknown unit",
  "unit not found",
  "no such user",
  "user does not exist",
];

/**
 * Additional patterns specific to service errors that indicate transient failures.
 */
const SERVICE_TRANSIENT_PATTERNS: readonly string[] = ["exit code", "not active", "failed to"];

/** Checks if message contains any pattern from the array */
const containsAnyPattern = (msg: string, patterns: readonly string[]): boolean =>
  Arr.some(patterns, (pattern) => msg.includes(pattern));

/**
 * Check if an error represents a transient failure that should be retried.
 * Returns true if error message matches transient patterns AND does not match permanent patterns.
 * Accepts SystemError | GeneralError union to work with Effect's error types.
 */
export const isTransientSystemError = (error: SystemError | GeneralError): boolean => {
  const msg = error.message.toLowerCase();

  // Permanent errors take precedence - fail fast
  if (containsAnyPattern(msg, PERMANENT_ERROR_PATTERNS)) {
    return false;
  }

  // Check for transient patterns
  return containsAnyPattern(msg, TRANSIENT_ERROR_PATTERNS);
};

/**
 * Check if a ServiceError represents a transient failure that should be retried.
 * Service errors (start/stop/restart failures) are often transient.
 */
export const isTransientServiceError = (error: ServiceError): boolean => {
  const msg = error.message.toLowerCase();

  // Permanent errors take precedence
  if (containsAnyPattern(msg, PERMANENT_ERROR_PATTERNS)) {
    return false;
  }

  // Check transient patterns (general + service-specific)
  return (
    containsAnyPattern(msg, TRANSIENT_ERROR_PATTERNS) ||
    containsAnyPattern(msg, SERVICE_TRANSIENT_PATTERNS)
  );
};

/**
 * Check if error message indicates a D-Bus session issue (common transient failure).
 */
export const isDbusSessionError = (message: string): boolean =>
  containsAnyPattern(message.toLowerCase(), [
    "dbus",
    "bus connection",
    "socket not found",
    "/run/user/",
  ]);
