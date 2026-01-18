// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Error handling infrastructure for divban.
 * Uses typed error codes that map to exit codes.
 */

/**
 * Error code interface for isolatedDeclarations compatibility.
 */
interface ErrorCodeMap {
  // General (0-9)
  readonly SUCCESS: 0;
  readonly GENERAL_ERROR: 1;
  readonly INVALID_ARGS: 2;
  readonly ROOT_REQUIRED: 3;
  readonly DEPENDENCY_MISSING: 4;

  // Config (10-19)
  readonly CONFIG_NOT_FOUND: 10;
  readonly CONFIG_PARSE_ERROR: 11;
  readonly CONFIG_VALIDATION_ERROR: 12;
  readonly CONFIG_MERGE_ERROR: 13;

  // System (20-29)
  readonly USER_CREATE_FAILED: 20;
  readonly SUBUID_CONFIG_FAILED: 21;
  readonly DIRECTORY_CREATE_FAILED: 22;
  readonly LINGER_ENABLE_FAILED: 23;
  readonly UID_RANGE_EXHAUSTED: 24;
  readonly SUBUID_RANGE_EXHAUSTED: 25;
  readonly EXEC_FAILED: 26;
  readonly FILE_READ_FAILED: 27;
  readonly FILE_WRITE_FAILED: 28;

  // Service (30-39)
  readonly SERVICE_NOT_FOUND: 30;
  readonly SERVICE_START_FAILED: 31;
  readonly SERVICE_STOP_FAILED: 32;
  readonly SERVICE_ALREADY_RUNNING: 33;
  readonly SERVICE_NOT_RUNNING: 34;
  readonly SERVICE_RELOAD_FAILED: 35;

  // Container (40-49)
  readonly CONTAINER_BUILD_FAILED: 40;
  readonly QUADLET_INSTALL_FAILED: 41;
  readonly NETWORK_CREATE_FAILED: 42;
  readonly VOLUME_CREATE_FAILED: 43;
  readonly CONTAINER_NOT_FOUND: 44;

  // Backup/Restore (50-59)
  readonly BACKUP_FAILED: 50;
  readonly RESTORE_FAILED: 51;
  readonly BACKUP_NOT_FOUND: 52;
}

/**
 * Error codes for all divban operations.
 * Organized by category for easy identification.
 */
export const ErrorCode: ErrorCodeMap = {
  // General (0-9)
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  INVALID_ARGS: 2,
  ROOT_REQUIRED: 3,
  DEPENDENCY_MISSING: 4,

  // Config (10-19)
  CONFIG_NOT_FOUND: 10,
  CONFIG_PARSE_ERROR: 11,
  CONFIG_VALIDATION_ERROR: 12,
  CONFIG_MERGE_ERROR: 13,

  // System (20-29)
  USER_CREATE_FAILED: 20,
  SUBUID_CONFIG_FAILED: 21,
  DIRECTORY_CREATE_FAILED: 22,
  LINGER_ENABLE_FAILED: 23,
  UID_RANGE_EXHAUSTED: 24,
  SUBUID_RANGE_EXHAUSTED: 25,
  EXEC_FAILED: 26,
  FILE_READ_FAILED: 27,
  FILE_WRITE_FAILED: 28,

  // Service (30-39)
  SERVICE_NOT_FOUND: 30,
  SERVICE_START_FAILED: 31,
  SERVICE_STOP_FAILED: 32,
  SERVICE_ALREADY_RUNNING: 33,
  SERVICE_NOT_RUNNING: 34,
  SERVICE_RELOAD_FAILED: 35,

  // Container (40-49)
  CONTAINER_BUILD_FAILED: 40,
  QUADLET_INSTALL_FAILED: 41,
  NETWORK_CREATE_FAILED: 42,
  VOLUME_CREATE_FAILED: 43,
  CONTAINER_NOT_FOUND: 44,

  // Backup/Restore (50-59)
  BACKUP_FAILED: 50,
  RESTORE_FAILED: 51,
  BACKUP_NOT_FOUND: 52,
};

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Main error class for divban operations.
 * Contains a typed error code and optional cause for error chaining.
 */
export class DivbanError extends Error {
  readonly code: ErrorCodeValue;
  override readonly cause?: Error;

  constructor(code: ErrorCodeValue, message: string, cause?: Error) {
    super(message);
    this.name = "DivbanError";
    this.code = code;
    if (cause !== undefined) {
      this.cause = cause;
    }

    // Capture stack trace, excluding the constructor
    Error.captureStackTrace?.(this, DivbanError);
  }

  /**
   * Create error with formatted message including context.
   */
  static withContext(
    code: ErrorCodeValue,
    message: string,
    context: Record<string, unknown>
  ): DivbanError {
    const contextStr = Object.entries(context)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(", ");
    return new DivbanError(code, `${message} [${contextStr}]`);
  }

  /**
   * Get the full error chain as an array.
   */
  getChain(): Error[] {
    const chain: Error[] = [this];
    let current: Error | undefined = this.cause;
    while (current) {
      chain.push(current);
      current = current instanceof DivbanError ? current.cause : undefined;
    }
    return chain;
  }

  /**
   * Format error for display, including cause chain.
   */
  format(): string {
    const chain = this.getChain();
    if (chain.length === 1) {
      return `Error [${this.code}]: ${this.message}`;
    }
    return chain
      .map((e, i) => {
        const prefix = i === 0 ? "Error" : "Caused by";
        const code = e instanceof DivbanError ? ` [${e.code}]` : "";
        return `${prefix}${code}: ${e.message}`;
      })
      .join("\n  ");
  }
}

/**
 * Convert error code to process exit code.
 * Exit codes are capped at 125 (POSIX convention).
 */
export const toExitCode = (code: ErrorCodeValue): number => Math.min(code, 125);

/**
 * Get human-readable error code name.
 */
export const getErrorCodeName = (code: ErrorCodeValue): string => {
  const entry = Object.entries(ErrorCode).find(([, v]) => v === code);
  return entry?.[0] ?? "UNKNOWN";
};

/**
 * Wrap an unknown caught value into a DivbanError.
 */
export const wrapError = (e: unknown, code: ErrorCodeValue, context?: string): DivbanError => {
  const message = context ? `${context}: ${errorMessage(e)}` : errorMessage(e);
  const cause = e instanceof Error ? e : undefined;
  return new DivbanError(code, message, cause);
};

/**
 * Extract error message from unknown value.
 */
export const errorMessage = (e: unknown): string => {
  if (e instanceof Error) {
    return e.message;
  }
  if (typeof e === "string") {
    return e;
  }
  return String(e);
};
