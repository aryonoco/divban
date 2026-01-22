// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Error handling infrastructure for divban.
 * Uses typed error codes that map to exit codes.
 *
 * Error classes are tagged (with _tag property) for use with Effect.ts
 */

import { Option, pipe } from "effect";
import { optionalProp } from "./option-helpers";

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
  readonly SECRET_ERROR: 45;
  readonly SECRET_NOT_FOUND: 46;

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
  SECRET_ERROR: 45,
  SECRET_NOT_FOUND: 46,

  // Backup/Restore (50-59)
  BACKUP_FAILED: 50,
  RESTORE_FAILED: 51,
  BACKUP_NOT_FOUND: 52,
};

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

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
  return pipe(
    Option.fromNullable(entry),
    Option.map((e) => e[0]),
    Option.getOrElse(() => "UNKNOWN")
  );
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

// ============================================================================
// Effect-Style Tagged Error Classes
// ============================================================================

/** General error code values (1-4) */
export type GeneralErrorCode = 1 | 2 | 3 | 4;

/** Config error code values (10-13) */
export type ConfigErrorCode = 10 | 11 | 12 | 13;

/** System error code values (20-28) */
export type SystemErrorCode = 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28;

/** Service error code values (30-35) */
export type ServiceErrorCode = 30 | 31 | 32 | 33 | 34 | 35;

/** Container error code values (40-46) */
export type ContainerErrorCode = 40 | 41 | 42 | 43 | 44 | 45 | 46;

/** Backup error code values (50-52) */
export type BackupErrorCode = 50 | 51 | 52;

/** Props for GeneralError */
export interface GeneralErrorProps {
  readonly code: GeneralErrorCode;
  readonly message: string;
  readonly cause?: Error;
}

/** Props for ConfigError */
export interface ConfigErrorProps {
  readonly code: ConfigErrorCode;
  readonly message: string;
  readonly path?: string;
  readonly cause?: Error;
}

/** Props for SystemError */
export interface SystemErrorProps {
  readonly code: SystemErrorCode;
  readonly message: string;
  readonly cause?: Error;
}

/** Props for ServiceError */
export interface ServiceErrorProps {
  readonly code: ServiceErrorCode;
  readonly message: string;
  readonly service?: string;
  readonly cause?: Error;
}

/** Props for ContainerError */
export interface ContainerErrorProps {
  readonly code: ContainerErrorCode;
  readonly message: string;
  readonly container?: string;
  readonly cause?: Error;
}

/** Props for BackupError */
export interface BackupErrorProps {
  readonly code: BackupErrorCode;
  readonly message: string;
  readonly path?: string;
  readonly cause?: Error;
}

/**
 * General errors (codes 1-4)
 * GENERAL_ERROR, INVALID_ARGS, ROOT_REQUIRED, DEPENDENCY_MISSING
 */
export class GeneralError extends Error {
  readonly _tag = "GeneralError" as const;
  readonly code: GeneralErrorCode;
  override readonly cause?: Error;

  constructor(props: GeneralErrorProps) {
    super(props.message);
    this.name = "GeneralError";
    this.code = props.code;
    if (props.cause !== undefined) {
      this.cause = props.cause;
    }
    Error.captureStackTrace?.(this, GeneralError);
  }

  get exitCode(): number {
    return Math.min(this.code, 125);
  }
}

/**
 * Config errors (codes 10-13)
 * CONFIG_NOT_FOUND, CONFIG_PARSE_ERROR, CONFIG_VALIDATION_ERROR, CONFIG_MERGE_ERROR
 */
export class ConfigError extends Error {
  readonly _tag = "ConfigError" as const;
  readonly code: ConfigErrorCode;
  readonly path?: string;
  override readonly cause?: Error;

  constructor(props: ConfigErrorProps) {
    super(props.message);
    this.name = "ConfigError";
    this.code = props.code;
    if (props.path !== undefined) {
      this.path = props.path;
    }
    if (props.cause !== undefined) {
      this.cause = props.cause;
    }
    Error.captureStackTrace?.(this, ConfigError);
  }

  get exitCode(): number {
    return Math.min(this.code, 125);
  }
}

/**
 * System errors (codes 20-28)
 */
export class SystemError extends Error {
  readonly _tag = "SystemError" as const;
  readonly code: SystemErrorCode;
  override readonly cause?: Error;

  constructor(props: SystemErrorProps) {
    super(props.message);
    this.name = "SystemError";
    this.code = props.code;
    if (props.cause !== undefined) {
      this.cause = props.cause;
    }
    Error.captureStackTrace?.(this, SystemError);
  }

  get exitCode(): number {
    return Math.min(this.code, 125);
  }
}

/**
 * Service errors (codes 30-35)
 */
export class ServiceError extends Error {
  readonly _tag = "ServiceError" as const;
  readonly code: ServiceErrorCode;
  readonly service?: string;
  override readonly cause?: Error;

  constructor(props: ServiceErrorProps) {
    super(props.message);
    this.name = "ServiceError";
    this.code = props.code;
    if (props.service !== undefined) {
      this.service = props.service;
    }
    if (props.cause !== undefined) {
      this.cause = props.cause;
    }
    Error.captureStackTrace?.(this, ServiceError);
  }

  get exitCode(): number {
    return Math.min(this.code, 125);
  }
}

/**
 * Container errors (codes 40-46)
 */
export class ContainerError extends Error {
  readonly _tag = "ContainerError" as const;
  readonly code: ContainerErrorCode;
  readonly container?: string;
  override readonly cause?: Error;

  constructor(props: ContainerErrorProps) {
    super(props.message);
    this.name = "ContainerError";
    this.code = props.code;
    if (props.container !== undefined) {
      this.container = props.container;
    }
    if (props.cause !== undefined) {
      this.cause = props.cause;
    }
    Error.captureStackTrace?.(this, ContainerError);
  }

  get exitCode(): number {
    return Math.min(this.code, 125);
  }
}

/**
 * Backup errors (codes 50-52)
 */
export class BackupError extends Error {
  readonly _tag = "BackupError" as const;
  readonly code: BackupErrorCode;
  readonly path?: string;
  override readonly cause?: Error;

  constructor(props: BackupErrorProps) {
    super(props.message);
    this.name = "BackupError";
    this.code = props.code;
    if (props.path !== undefined) {
      this.path = props.path;
    }
    if (props.cause !== undefined) {
      this.cause = props.cause;
    }
    Error.captureStackTrace?.(this, BackupError);
  }

  get exitCode(): number {
    return Math.min(this.code, 125);
  }
}

/**
 * Union type for Effect error channel.
 * This is the complete set of errors that can occur in the application.
 */
export type DivbanEffectError =
  | GeneralError
  | ConfigError
  | SystemError
  | ServiceError
  | ContainerError
  | BackupError;

/**
 * Helper to get exit code from any Effect error.
 */
export const getExitCode = (error: DivbanEffectError): number => error.exitCode;

// ============================================================================
// Error Factory Functions
// ============================================================================

/**
 * Create a GeneralError from an ErrorCode constant and message.
 */
export const makeGeneralError = (
  code: GeneralErrorCode,
  message: string,
  cause?: Error
): GeneralError =>
  cause !== undefined
    ? new GeneralError({ code, message, cause })
    : new GeneralError({ code, message });

/**
 * Create a ConfigError with exactOptionalPropertyTypes compliance.
 */
export const makeConfigError = (
  code: ConfigErrorCode,
  message: string,
  path?: string,
  cause?: Error
): ConfigError =>
  new ConfigError({
    code,
    message,
    ...optionalProp("path", path),
    ...optionalProp("cause", cause),
  });

/**
 * Create a SystemError from an ErrorCode constant and message.
 */
export const makeSystemError = (
  code: SystemErrorCode,
  message: string,
  cause?: Error
): SystemError =>
  cause !== undefined
    ? new SystemError({ code, message, cause })
    : new SystemError({ code, message });

/**
 * Create a ServiceError with exactOptionalPropertyTypes compliance.
 */
export const makeServiceError = (
  code: ServiceErrorCode,
  message: string,
  service?: string,
  cause?: Error
): ServiceError =>
  new ServiceError({
    code,
    message,
    ...optionalProp("service", service),
    ...optionalProp("cause", cause),
  });

/**
 * Create a ContainerError with exactOptionalPropertyTypes compliance.
 */
export const makeContainerError = (
  code: ContainerErrorCode,
  message: string,
  container?: string,
  cause?: Error
): ContainerError =>
  new ContainerError({
    code,
    message,
    ...optionalProp("container", container),
    ...optionalProp("cause", cause),
  });

/**
 * Create a BackupError with exactOptionalPropertyTypes compliance.
 */
export const makeBackupError = (
  code: BackupErrorCode,
  message: string,
  path?: string,
  cause?: Error
): BackupError =>
  new BackupError({
    code,
    message,
    ...optionalProp("path", path),
    ...optionalProp("cause", cause),
  });
