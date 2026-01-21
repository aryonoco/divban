// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Core library exports for divban.
 * This module provides the foundation types and utilities used throughout the application.
 */

// Types - Branded types for type-safe identifiers
export {
  // Schemas (use .make() for trusted literals, Schema.decode() for untrusted input)
  AbsolutePathSchema,
  ContainerNameSchema,
  GroupIdSchema,
  NetworkNameSchema,
  PrivateIPSchema,
  ServiceNameSchema,
  SubordinateIdSchema,
  UserIdSchema,
  UsernameSchema,
  VolumeNameSchema,
  // Effect-based decoders (for use in Effect pipelines with untrusted input)
  decodeAbsolutePath,
  decodeContainerName,
  decodeGroupId,
  decodeNetworkName,
  decodePrivateIP,
  decodeServiceName,
  decodeSubordinateId,
  decodeUserId,
  decodeUsername,
  decodeVolumeName,
  // Type guards (derived from schemas via Schema.is)
  isAbsolutePath,
  isContainerName,
  isGroupId,
  isNetworkName,
  isPrivateIP,
  isServiceName,
  isSubordinateId,
  isUserId,
  isUsername,
  isVolumeName,
  // Path utilities
  assertNever,
  joinPath,
  parseErrorToGeneralError,
  path,
  pathJoin,
  pathWithSuffix,
  userIdToGroupId,
} from "./types";
export type {
  AbsolutePath as AbsolutePathType,
  ContainerName as ContainerNameType,
  GroupId as GroupIdType,
  NetworkName as NetworkNameType,
  PrivateIP as PrivateIPType,
  ServiceName as ServiceNameType,
  SubordinateId as SubordinateIdType,
  UserId as UserIdType,
  Username as UsernameType,
  VolumeName as VolumeNameType,
} from "./types";

// Option - Re-exported from Effect with helpers
export { Option } from "effect";
export {
  expectOption,
  mapOr,
  mapOrElse,
  nonEmpty,
  xorOption,
} from "./option-helpers";

// Errors - Tagged error classes for Effect-based error handling
export {
  BackupError,
  ConfigError,
  ContainerError,
  ErrorCode,
  errorMessage,
  GeneralError,
  getErrorCodeName,
  ServiceError,
  SystemError,
  toExitCode,
} from "./errors";
export type { DivbanEffectError, ErrorCodeValue } from "./errors";

// Logger - Structured logging
export { createLogger, getLogger, setDefaultLogger } from "./logger";
export type { Logger, LoggerOptions, LogLevel } from "./logger";

// Assert - Runtime assertions and type guards
export {
  assert,
  assertNonEmpty,
  hasKeys,
  isNonEmptyArray,
  isNonEmptyString,
  isNonNegativeInteger,
  isOneOf,
  isPositiveInteger,
} from "./assert";
export type { NonEmptyArray } from "./assert";

// Utils - Bun standard library utilities
export {
  base64Decode,
  base64DecodeBytes,
  base64Encode,
  base64EncodeBytes,
  base64UrlEncode,
  bunRevision,
  bunVersion,
  center,
  colorize,
  createBufferBuilder,
  escapeHTML,
  fileURLToPath,
  generateId,
  generateIdBase64,
  generateIdBuffer,
  generateUUID,
  getAnsiColor,
  isFulfilled,
  isMain,
  isPending,
  isRejected,
  mainPath,
  padEnd,
  padStart,
  pathToFileURL,
  peekPromise,
  promiseStatus,
  resolveModule,
  sleep,
  sleepSync,
  streamToArray,
  streamToBlob,
  streamToBytes,
  streamToJSON,
  streamToText,
  stringWidth,
  supportsColor,
  truncate,
} from "./utils";
export type { BufferBuilderOptions, StringWidthOptions } from "./utils";

// Semver - Version comparison (20x faster than node-semver)
export {
  compare as semverCompare,
  eq as semverEq,
  filterSatisfying,
  gt as semverGt,
  gte as semverGte,
  isValid as semverIsValid,
  lt as semverLt,
  lte as semverLte,
  maxSatisfying,
  maxVersion,
  minSatisfying,
  minVersion,
  neq as semverNeq,
  satisfies,
  sortVersions,
  sortVersionsDesc,
} from "./semver";

// Timing - High-precision timing utilities
export {
  debounce,
  delay,
  formatDuration,
  measure,
  measureSync,
  microseconds,
  milliseconds,
  nanoseconds,
  stopwatch,
  throttle,
  withDeadline,
} from "./timing";
export type { Stopwatch, TimedResult } from "./timing";

// Paths - Centralized path construction
export {
  buildServicePaths,
  configFilePath,
  lingerFile,
  outputConfigDir,
  outputQuadletDir,
  quadletFilePath,
  SYSTEM_PATHS,
  TEMP_PATHS,
  toAbsolutePathEffect,
  toAbsolutePathUnsafe,
  userConfigDir,
  userDataDir,
  userHomeDir,
  userQuadletDir,
} from "./paths";
export type { ServicePaths } from "./paths";
