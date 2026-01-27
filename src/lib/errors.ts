// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** Typed error hierarchy with numeric codes that map directly to process exit codes. Each class carries a _tag discriminant for Effect.ts pattern matching. */

import { Data, Match, Option, pipe } from "effect";

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

/** Exit codes above 125 have special meaning in POSIX shells. */
export const toExitCode = (code: ErrorCodeValue): number => Math.min(code, 125);

export const getErrorCodeName = (code: ErrorCodeValue): string => {
  const entry = Object.entries(ErrorCode).find(([, v]) => v === code);
  return pipe(
    Option.fromNullable(entry),
    Option.map((e) => e[0]),
    Option.getOrElse(() => "UNKNOWN")
  );
};

export const errorMessage = (e: unknown): string =>
  pipe(
    Match.value(e),
    Match.when(Match.instanceOf(Error), (err) => err.message),
    Match.when(Match.string, (s) => s),
    Match.orElse((v) => String(v))
  );

export type GeneralErrorCode = 1 | 2 | 3 | 4;
export type ConfigErrorCode = 10 | 11 | 12 | 13;
export type SystemErrorCode = 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28;
export type ServiceErrorCode = 30 | 31 | 32 | 33 | 34 | 35;
export type ContainerErrorCode = 40 | 41 | 42 | 43 | 44 | 45 | 46;
export type BackupErrorCode = 50 | 51 | 52;

type TaggedErrorBase<Tag extends string> = ReturnType<typeof Data.TaggedError<Tag>>;

const GeneralErrorBase: TaggedErrorBase<"GeneralError"> = Data.TaggedError("GeneralError");
const ConfigErrorBase: TaggedErrorBase<"ConfigError"> = Data.TaggedError("ConfigError");
const SystemErrorBase: TaggedErrorBase<"SystemError"> = Data.TaggedError("SystemError");
const ServiceErrorBase: TaggedErrorBase<"ServiceError"> = Data.TaggedError("ServiceError");
const ContainerErrorBase: TaggedErrorBase<"ContainerError"> = Data.TaggedError("ContainerError");
const BackupErrorBase: TaggedErrorBase<"BackupError"> = Data.TaggedError("BackupError");

export class GeneralError extends GeneralErrorBase<{
  readonly code: GeneralErrorCode;
  readonly message: string;
  readonly cause?: Error;
}> {
  get exitCode(): number {
    return Math.min(this.code, 125);
  }
}

export class ConfigError extends ConfigErrorBase<{
  readonly code: ConfigErrorCode;
  readonly message: string;
  readonly path?: string;
  readonly cause?: Error;
}> {
  get exitCode(): number {
    return Math.min(this.code, 125);
  }
}

export class SystemError extends SystemErrorBase<{
  readonly code: SystemErrorCode;
  readonly message: string;
  readonly cause?: Error;
}> {
  get exitCode(): number {
    return Math.min(this.code, 125);
  }
}

export class ServiceError extends ServiceErrorBase<{
  readonly code: ServiceErrorCode;
  readonly message: string;
  readonly service?: string;
  readonly cause?: Error;
}> {
  get exitCode(): number {
    return Math.min(this.code, 125);
  }
}

export class ContainerError extends ContainerErrorBase<{
  readonly code: ContainerErrorCode;
  readonly message: string;
  readonly container?: string;
  readonly cause?: Error;
}> {
  get exitCode(): number {
    return Math.min(this.code, 125);
  }
}

export class BackupError extends BackupErrorBase<{
  readonly code: BackupErrorCode;
  readonly message: string;
  readonly path?: string;
  readonly cause?: Error;
}> {
  get exitCode(): number {
    return Math.min(this.code, 125);
  }
}

export type DivbanEffectError =
  | GeneralError
  | ConfigError
  | SystemError
  | ServiceError
  | ContainerError
  | BackupError;
