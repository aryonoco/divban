// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

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
  // Decoders for untrusted input in Effect pipelines
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
  joinPath,
  parseErrorToGeneralError,
  path,
  pathJoin,
  pathWithSuffix,
  userIdToGroupId,
  // Literal constructors
  containerImage,
  containerName,
  networkName,
  serviceName,
  serviceNameToContainerName,
  username,
  volumeName,
} from "./types";
export { databaseName, databaseUser } from "./db-backup/types";
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

export { Option } from "effect";
export {
  expectOptionEffect,
  mapOr,
  mapOrElse,
  nonEmpty,
  optionalProp,
  buildObject,
  xorOption,
} from "./option-helpers";

export {
  BackupError,
  ConfigError,
  ContainerError,
  ErrorCode,
  errorMessage,
  GeneralError,
  getErrorCodeName,
  isDivbanError,
  ServiceError,
  SystemError,
  toExitCode,
} from "./errors";
export type { DivbanEffectError, ErrorCodeValue } from "./errors";

export {
  createLogger,
  getLogger,
  getLoggerEffect,
  LoggerFiberRef,
  setDefaultLogger,
  withLogger,
} from "./logger";
export type { Logger, LoggerOptions, LogLevel } from "./logger";

export {
  assertEffect,
  assertNonEmptyEffect,
  toNonEmpty,
  hasKeys,
  isNonEmptyArray,
  isNonEmptyString,
  isNonNegativeInteger,
  isOneOf,
  isPlainObject,
  isPositiveInteger,
} from "./assert";
export type { NonEmptyArray } from "./assert";

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

export { createStopwatchEffect } from "./timing";
export type { EffectStopwatch } from "./timing";

export {
  buildServicePaths,
  configFilePath,
  lingerFile,
  lookupUserHomeFromPasswd,
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
