/**
 * Core library exports for divban.
 * This module provides the foundation types and utilities used throughout the application.
 */

// Types - Branded types for type-safe identifiers
export {
  AbsolutePath,
  ContainerName,
  GroupId,
  isAbsolutePath,
  isServiceName,
  isUsername,
  NetworkName,
  ServiceName,
  SubordinateId,
  UserId,
  Username,
  VolumeName,
} from "./types";
export type {
  AbsolutePath as AbsolutePathType,
  ContainerName as ContainerNameType,
  GroupId as GroupIdType,
  NetworkName as NetworkNameType,
  ServiceName as ServiceNameType,
  SubordinateId as SubordinateIdType,
  UserId as UserIdType,
  Username as UsernameType,
  VolumeName as VolumeNameType,
} from "./types";

// Result - Functional error handling
export {
  collectResults,
  Err,
  flatMapResult,
  isErr,
  isOk,
  mapErr,
  mapResult,
  Ok,
  parallel,
  sequence,
  tryCatch,
  tryCatchSync,
  unwrap,
  unwrapOr,
} from "./result";
export type { Result } from "./result";

// Errors - Error codes and DivbanError class
export {
  DivbanError,
  ErrorCode,
  errorMessage,
  getErrorCodeName,
  toExitCode,
  wrapError,
} from "./errors";
export type { ErrorCodeValue } from "./errors";

// Logger - Structured logging
export { createLogger, getLogger, setDefaultLogger } from "./logger";
export type { Logger, LoggerOptions, LogLevel } from "./logger";

// Assert - Runtime assertions and type guards
export {
  assert,
  assertDefined,
  assertNever,
  assertNonEmpty,
  ensureDefined,
  hasKeys,
  isNonEmptyArray,
  isNonEmptyString,
  isNonNegativeInteger,
  isOneOf,
  isPositiveInteger,
} from "./assert";
export type { NonEmptyArray } from "./assert";
