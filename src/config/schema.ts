// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Configuration schemas as the single source of truth. Input/Output
 * type pairs enable validation-time transformation (e.g., string →
 * AbsolutePath brand). Defaults are embedded in schemas via
 * optionalWith(), ensuring valid output even with minimal TOML.
 * Service configs extend ContainerBaseConfig for shared security
 * and lifecycle settings.
 */

import { Effect, Schema, pipe } from "effect";
import { ErrorCode, GeneralError } from "../lib/errors";
import { isValidIP, isValidPosixUsername } from "../lib/schema-utils";
import {
  path,
  type AbsolutePath,
  AbsolutePathSchema,
  type ContainerImage,
  ContainerImageSchema,
  type DurationString,
  DurationStringSchema,
  type ServiceName,
  type Username,
  UsernameSchema,
  decodeAbsolutePath,
  decodeUsername,
  duration,
  parseErrorToGeneralError,
} from "../lib/types";
import { type DivbanConfigSchemaVersion, DivbanConfigSchemaVersionSchema } from "../lib/versioning";
import {
  AUTO_UPDATE_STRING_VALUES,
  type AutoUpdateString,
  HEALTH_CHECK_ON_FAILURE_VALUES,
  type HealthCheckOnFailure,
  LOG_FORMAT_VALUES,
  LOG_LEVEL_VALUES,
  type LogFormat,
  type LogLevel,
  NETWORK_MODE_GLOBAL_VALUES,
  NETWORK_MODE_VALUES,
  type NetworkMode,
  type NetworkModeGlobal,
  PROTOCOL_VALUES,
  type Protocol,
  SERVICE_RESTART_VALUES,
  type ServiceRestartPolicy,
} from "./field-values";

/**
 * Re-export branded schemas for backwards compatibility.
 * These are the canonical schemas from lib/types.ts.
 */
export const absolutePathSchema: Schema.BrandSchema<AbsolutePath, string, never> =
  AbsolutePathSchema;
export const usernameSchema: Schema.BrandSchema<Username, string, never> = UsernameSchema;
export const containerImageSchema: Schema.BrandSchema<ContainerImage, string, never> =
  ContainerImageSchema;

export interface PortConfig {
  readonly host: number;
  readonly container: number;
  readonly hostIp?: string | undefined;
  readonly protocol: Protocol;
}

export interface PortConfigInput {
  readonly host: number;
  readonly container: number;
  readonly hostIp?: string | undefined;
  readonly protocol?: Protocol | undefined;
}

export const portSchema: Schema.Schema<PortConfig, PortConfigInput> = Schema.Struct({
  host: Schema.Number.pipe(Schema.int(), Schema.between(1, 65535)),
  container: Schema.Number.pipe(Schema.int(), Schema.between(1, 65535)),
  hostIp: Schema.optional(
    Schema.String.pipe(
      Schema.filter((s): s is string => isValidIP(s), {
        message: (): string => "Invalid IP address",
      })
    )
  ),
  protocol: Schema.optionalWith(Schema.Literal(...PROTOCOL_VALUES), {
    default: (): "tcp" => "tcp",
  }),
});

export interface VolumeMountConfig {
  readonly source: string;
  readonly target: AbsolutePath;
  readonly options?: string | undefined;
}

export interface VolumeMountConfigInput {
  readonly source: string;
  readonly target: string;
  readonly options?: string | undefined;
}

export const volumeMountSchema: Schema.Schema<VolumeMountConfig, VolumeMountConfigInput> =
  Schema.Struct({
    source: Schema.String,
    target: absolutePathSchema,
    options: Schema.optional(Schema.String),
  });

export interface HealthCheckConfig {
  readonly cmd: string;
  readonly interval: DurationString;
  readonly timeout: DurationString;
  readonly retries: number;
  readonly startPeriod: DurationString;
  readonly onFailure: HealthCheckOnFailure;
}

export interface HealthCheckConfigInput {
  readonly cmd: string;
  readonly interval?: string | undefined;
  readonly timeout?: string | undefined;
  readonly retries?: number | undefined;
  readonly startPeriod?: string | undefined;
  readonly onFailure?: HealthCheckOnFailure | undefined;
}

export const healthCheckSchema: Schema.Schema<HealthCheckConfig, HealthCheckConfigInput> =
  Schema.Struct({
    cmd: Schema.String,
    interval: Schema.optionalWith(DurationStringSchema, {
      default: (): DurationString => duration("30s"),
    }),
    timeout: Schema.optionalWith(DurationStringSchema, {
      default: (): DurationString => duration("30s"),
    }),
    retries: Schema.optionalWith(Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)), {
      default: (): number => 3,
    }),
    startPeriod: Schema.optionalWith(DurationStringSchema, {
      default: (): DurationString => duration("0s"),
    }),
    onFailure: Schema.optionalWith(Schema.Literal(...HEALTH_CHECK_ON_FAILURE_VALUES), {
      default: (): "none" => "none",
    }),
  });

/** Shared security and lifecycle settings inherited by all service configs. */
export interface ContainerBaseConfig {
  readonly image: ContainerImage;
  readonly imageDigest?: string | undefined;
  readonly networkMode: NetworkMode;
  readonly ports?: readonly PortConfig[] | undefined;
  readonly volumes?: readonly VolumeMountConfig[] | undefined;
  readonly environment?: Readonly<Record<string, string>> | undefined;
  readonly environmentFiles?: readonly AbsolutePath[] | undefined;
  readonly healthCheck?: HealthCheckConfig | undefined;
  readonly readOnlyRootfs: boolean;
  readonly noNewPrivileges: boolean;
  readonly capAdd?: readonly string[] | undefined;
  readonly capDrop?: readonly string[] | undefined;
  readonly seccompProfile?: AbsolutePath | undefined;
  readonly shmSize?: string | undefined;
  readonly devices?: readonly string[] | undefined;
  readonly autoUpdate: AutoUpdateString | false;
  readonly restart: ServiceRestartPolicy;
  readonly restartSec?: number | undefined;
  readonly timeoutStartSec?: number | undefined;
  readonly timeoutStopSec?: number | undefined;
}

export interface ContainerBaseConfigInput {
  readonly image: string;
  readonly imageDigest?: string | undefined;
  readonly networkMode?: NetworkMode | undefined;
  readonly ports?: readonly PortConfigInput[] | undefined;
  readonly volumes?: readonly VolumeMountConfigInput[] | undefined;
  readonly environment?: Readonly<Record<string, string>> | undefined;
  readonly environmentFiles?: readonly string[] | undefined;
  readonly healthCheck?: HealthCheckConfigInput | undefined;
  readonly readOnlyRootfs?: boolean | undefined;
  readonly noNewPrivileges?: boolean | undefined;
  readonly capAdd?: readonly string[] | undefined;
  readonly capDrop?: readonly string[] | undefined;
  readonly seccompProfile?: string | undefined;
  readonly shmSize?: string | undefined;
  readonly devices?: readonly string[] | undefined;
  readonly autoUpdate?: (AutoUpdateString | false) | undefined;
  readonly restart?: ServiceRestartPolicy | undefined;
  readonly restartSec?: number | undefined;
  readonly timeoutStartSec?: number | undefined;
  readonly timeoutStopSec?: number | undefined;
}

export const containerBaseSchema: Schema.Schema<ContainerBaseConfig, ContainerBaseConfigInput> =
  Schema.Struct({
    image: containerImageSchema,
    imageDigest: Schema.optional(Schema.String),
    networkMode: Schema.optionalWith(Schema.Literal(...NETWORK_MODE_VALUES), {
      default: (): "pasta" => "pasta",
    }),
    ports: Schema.optional(Schema.Array(portSchema)),
    volumes: Schema.optional(Schema.Array(volumeMountSchema)),
    environment: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
    environmentFiles: Schema.optional(Schema.Array(absolutePathSchema)),
    healthCheck: Schema.optional(healthCheckSchema),
    readOnlyRootfs: Schema.optionalWith(Schema.Boolean, { default: (): boolean => false }),
    noNewPrivileges: Schema.optionalWith(Schema.Boolean, { default: (): boolean => true }),
    capAdd: Schema.optional(Schema.Array(Schema.String)),
    capDrop: Schema.optional(Schema.Array(Schema.String)),
    seccompProfile: Schema.optional(absolutePathSchema),
    shmSize: Schema.optional(Schema.String),
    devices: Schema.optional(Schema.Array(Schema.String)),
    autoUpdate: Schema.optionalWith(
      Schema.Union(Schema.Literal(...AUTO_UPDATE_STRING_VALUES), Schema.Literal(false)),
      {
        default: (): "registry" => "registry",
      }
    ),
    restart: Schema.optionalWith(Schema.Literal(...SERVICE_RESTART_VALUES), {
      default: (): "on-failure" => "on-failure",
    }),
    restartSec: Schema.optional(Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0))),
    timeoutStartSec: Schema.optional(
      Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0))
    ),
    timeoutStopSec: Schema.optional(
      Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0))
    ),
  });

/**
 * Default timeouts in ms. Validation is short for fast feedback; backup/restore
 * are longer because large databases or slow storage can legitimately take time.
 */
export const DEFAULT_TIMEOUTS = {
  validation: 60_000,
  backup: 600_000,
  restore: 1_800_000,
} as const;

export interface GlobalConfig {
  readonly divbanConfigSchemaVersion: DivbanConfigSchemaVersion;
  readonly defaults: {
    readonly networkMode: NetworkModeGlobal;
    readonly autoUpdate: AutoUpdateString | false;
    readonly timezone: string;
  };
  readonly users: {
    readonly uidRangeStart: number;
    readonly uidRangeEnd: number;
    readonly subuidRangeStart: number;
    readonly subuidRangeSize: number;
  };
  readonly logging: {
    readonly level: LogLevel;
    readonly format: LogFormat;
  };
  readonly paths: {
    readonly baseDataDir: AbsolutePath;
  };
  readonly timeouts: {
    readonly validation: number;
    readonly backup: number;
    readonly restore: number;
  };
}

/** Minimal valid input: only divbanConfigSchemaVersion required. */
export interface GlobalConfigInput {
  readonly divbanConfigSchemaVersion: string;
  readonly defaults?:
    | {
        readonly networkMode?: NetworkModeGlobal | undefined;
        readonly autoUpdate?: (AutoUpdateString | false) | undefined;
        readonly timezone?: string | undefined;
      }
    | undefined;
  readonly users?:
    | {
        readonly uidRangeStart?: number | undefined;
        readonly uidRangeEnd?: number | undefined;
        readonly subuidRangeStart?: number | undefined;
        readonly subuidRangeSize?: number | undefined;
      }
    | undefined;
  readonly logging?:
    | {
        readonly level?: LogLevel | undefined;
        readonly format?: LogFormat | undefined;
      }
    | undefined;
  readonly paths?:
    | {
        readonly baseDataDir?: string | undefined;
      }
    | undefined;
  readonly timeouts?:
    | {
        readonly validation?: number | undefined;
        readonly backup?: number | undefined;
        readonly restore?: number | undefined;
      }
    | undefined;
}

export const globalConfigSchema: Schema.Schema<GlobalConfig, GlobalConfigInput> = Schema.Struct({
  divbanConfigSchemaVersion: DivbanConfigSchemaVersionSchema,
  defaults: Schema.optionalWith(
    Schema.Struct({
      networkMode: Schema.optionalWith(Schema.Literal(...NETWORK_MODE_GLOBAL_VALUES), {
        default: (): "pasta" => "pasta",
      }),
      autoUpdate: Schema.optionalWith(
        Schema.Union(Schema.Literal(...AUTO_UPDATE_STRING_VALUES), Schema.Literal(false)),
        { default: (): "registry" => "registry" }
      ),
      timezone: Schema.optionalWith(Schema.String, { default: (): string => "UTC" }),
    }),
    {
      default: (): GlobalConfig["defaults"] => ({
        networkMode: "pasta",
        autoUpdate: "registry",
        timezone: "UTC",
      }),
    }
  ),
  users: Schema.optionalWith(
    Schema.Struct({
      uidRangeStart: Schema.optionalWith(
        Schema.Number.pipe(Schema.int(), Schema.between(10000, 59999)),
        { default: (): number => 10000 }
      ),
      uidRangeEnd: Schema.optionalWith(
        Schema.Number.pipe(Schema.int(), Schema.between(10000, 59999)),
        { default: (): number => 59999 }
      ),
      subuidRangeStart: Schema.optionalWith(
        Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(100000)),
        { default: (): number => 100000 }
      ),
      subuidRangeSize: Schema.optionalWith(
        Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(65536)),
        { default: (): number => 65536 }
      ),
    }),
    {
      default: (): GlobalConfig["users"] => ({
        uidRangeStart: 10000,
        uidRangeEnd: 59999,
        subuidRangeStart: 100000,
        subuidRangeSize: 65536,
      }),
    }
  ),
  logging: Schema.optionalWith(
    Schema.Struct({
      level: Schema.optionalWith(Schema.Literal(...LOG_LEVEL_VALUES), {
        default: (): "info" => "info",
      }),
      format: Schema.optionalWith(Schema.Literal(...LOG_FORMAT_VALUES), {
        default: (): "pretty" => "pretty",
      }),
    }),
    {
      default: (): GlobalConfig["logging"] => ({
        level: "info",
        format: "pretty",
      }),
    }
  ),
  paths: Schema.optionalWith(
    Schema.Struct({
      baseDataDir: Schema.optionalWith(absolutePathSchema, {
        default: (): AbsolutePath => path("/srv"),
      }),
    }),
    {
      default: (): GlobalConfig["paths"] => ({
        baseDataDir: path("/srv"),
      }),
    }
  ),
  timeouts: Schema.optionalWith(
    Schema.Struct({
      validation: Schema.optionalWith(
        Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1000)),
        { default: (): number => DEFAULT_TIMEOUTS.validation }
      ),
      backup: Schema.optionalWith(
        Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1000)),
        { default: (): number => DEFAULT_TIMEOUTS.backup }
      ),
      restore: Schema.optionalWith(
        Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1000)),
        { default: (): number => DEFAULT_TIMEOUTS.restore }
      ),
    }),
    {
      default: (): GlobalConfig["timeouts"] => ({
        validation: DEFAULT_TIMEOUTS.validation,
        backup: DEFAULT_TIMEOUTS.backup,
        restore: DEFAULT_TIMEOUTS.restore,
      }),
    }
  ),
});

/** Path configuration common to all services. Username/UID derived at setup time. */
export interface ServiceBaseConfig {
  paths: {
    dataDir: AbsolutePath;
  };
}

export interface ServiceBaseConfigInput {
  paths: {
    dataDir: string;
  };
}

export const serviceBaseSchema: Schema.Schema<ServiceBaseConfig, ServiceBaseConfigInput> =
  Schema.Struct({
    paths: Schema.Struct({
      dataDir: absolutePathSchema,
    }),
  });

/** Prefix prevents collision with system users and clarifies service ownership */
export const getServiceUsername = (
  serviceName: ServiceName
): Effect.Effect<Username, GeneralError> =>
  pipe(
    Effect.succeed(`divban-${serviceName}`),
    Effect.filterOrFail(
      isValidPosixUsername,
      () =>
        new GeneralError({
          code: ErrorCode.INVALID_ARGS,
          message: `Invalid service name for username: ${serviceName}. Must match [a-z_][a-z0-9_-]*`,
        })
    ),
    Effect.filterOrFail(
      (u): u is string => u.length <= 32,
      (u) =>
        new GeneralError({
          code: ErrorCode.INVALID_ARGS,
          message: `Service name too long: ${serviceName}. Username would be ${u.length} chars (max 32)`,
        })
    ),
    Effect.flatMap((u) => decodeUsername(u).pipe(Effect.mapError(parseErrorToGeneralError)))
  );

/** Data directory follows username convention for consistent ownership. */
export const getServiceDataDir = (
  serviceName: ServiceName,
  baseDataDir = "/srv"
): Effect.Effect<AbsolutePath, GeneralError> =>
  Effect.gen(function* () {
    const username = yield* getServiceUsername(serviceName);
    return yield* decodeAbsolutePath(`${baseDataDir}/${username}`).pipe(
      Effect.mapError(parseErrorToGeneralError)
    );
  });

/** Quadlet files go in ~/.config/containers/systemd per Podman spec. */
export const getQuadletDir = (homeDir: string): Effect.Effect<AbsolutePath, GeneralError> =>
  decodeAbsolutePath(`${homeDir}/.config/containers/systemd`).pipe(
    Effect.mapError(parseErrorToGeneralError)
  );

/** Config files live in <dataDir>/config by convention. */
export const getConfigDir = (dataDir: string): Effect.Effect<AbsolutePath, GeneralError> =>
  decodeAbsolutePath(`${dataDir}/config`).pipe(Effect.mapError(parseErrorToGeneralError));
