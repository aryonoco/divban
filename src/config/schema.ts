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
  duration,
  parseErrorToGeneralError,
} from "../lib/types";

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
  readonly protocol: "tcp" | "udp";
}

export interface PortConfigInput {
  readonly host: number;
  readonly container: number;
  readonly hostIp?: string | undefined;
  readonly protocol?: "tcp" | "udp" | undefined;
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
  protocol: Schema.optionalWith(Schema.Literal("tcp", "udp"), { default: (): "tcp" => "tcp" }),
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
  readonly onFailure: "none" | "kill" | "restart" | "stop";
}

export interface HealthCheckConfigInput {
  readonly cmd: string;
  readonly interval?: string | undefined;
  readonly timeout?: string | undefined;
  readonly retries?: number | undefined;
  readonly startPeriod?: string | undefined;
  readonly onFailure?: "none" | "kill" | "restart" | "stop" | undefined;
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
    onFailure: Schema.optionalWith(Schema.Literal("none", "kill", "restart", "stop"), {
      default: (): "none" => "none",
    }),
  });

export type ServiceRestartPolicy =
  | "no"
  | "on-success"
  | "on-failure"
  | "on-abnormal"
  | "on-abort"
  | "always";

export const serviceRestartSchema: Schema.Schema<ServiceRestartPolicy> = Schema.Literal(
  "no",
  "on-success",
  "on-failure",
  "on-abnormal",
  "on-abort",
  "always"
);

/**
 * Base container configuration (output after decoding).
 * Used by all services as the foundation for container definitions.
 * Uses readonly to match Effect Schema's default output.
 */
export interface ContainerBaseConfig {
  readonly image: ContainerImage;
  readonly imageDigest?: string | undefined;
  readonly networkMode: "pasta" | "slirp4netns" | "host" | "none";
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
  readonly autoUpdate: "registry" | "local" | false;
  readonly restart: ServiceRestartPolicy;
  readonly restartSec?: number | undefined;
  readonly timeoutStartSec?: number | undefined;
  readonly timeoutStopSec?: number | undefined;
}

/**
 * Base container configuration (input before decoding).
 * Fields with defaults are optional in input.
 */
export interface ContainerBaseConfigInput {
  readonly image: string;
  readonly imageDigest?: string | undefined;
  readonly networkMode?: "pasta" | "slirp4netns" | "host" | "none" | undefined;
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
  readonly autoUpdate?: "registry" | "local" | false | undefined;
  readonly restart?: ServiceRestartPolicy | undefined;
  readonly restartSec?: number | undefined;
  readonly timeoutStartSec?: number | undefined;
  readonly timeoutStopSec?: number | undefined;
}

export const containerBaseSchema: Schema.Schema<ContainerBaseConfig, ContainerBaseConfigInput> =
  Schema.Struct({
    image: containerImageSchema,
    imageDigest: Schema.optional(Schema.String),
    networkMode: Schema.optionalWith(Schema.Literal("pasta", "slirp4netns", "host", "none"), {
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
      Schema.Union(Schema.Literal("registry", "local"), Schema.Literal(false)),
      {
        default: (): "registry" => "registry",
      }
    ),
    restart: Schema.optionalWith(serviceRestartSchema, {
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
 * Default timeout values in milliseconds.
 * Used when no global config is available or as fallback values.
 */
export const DEFAULT_TIMEOUTS = {
  /** Timeout for validation/reload operations (60 seconds) */
  validation: 60_000,
  /** Timeout for backup operations (10 minutes) */
  backup: 600_000,
  /** Timeout for restore operations (30 minutes) */
  restore: 1_800_000,
} as const;

export interface GlobalConfig {
  readonly defaults: {
    readonly networkMode: "pasta" | "slirp4netns";
    readonly autoUpdate: "registry" | "local" | false;
    readonly timezone: string;
  };
  readonly users: {
    readonly uidRangeStart: number;
    readonly uidRangeEnd: number;
    readonly subuidRangeStart: number;
    readonly subuidRangeSize: number;
  };
  readonly logging: {
    readonly level: "debug" | "info" | "warn" | "error";
    readonly format: "pretty" | "json";
  };
  readonly paths: {
    readonly baseDataDir: AbsolutePath;
  };
  readonly timeouts: {
    /** Timeout for validation/reload operations in ms (default: 60000 = 60s) */
    readonly validation: number;
    /** Timeout for backup operations in ms (default: 600000 = 10min) */
    readonly backup: number;
    /** Timeout for restore operations in ms (default: 1800000 = 30min) */
    readonly restore: number;
  };
}

/**
 * Global configuration for divban.toml (input before decoding)
 * All nested objects and their fields are optional.
 */
export interface GlobalConfigInput {
  readonly defaults?:
    | {
        readonly networkMode?: "pasta" | "slirp4netns" | undefined;
        readonly autoUpdate?: "registry" | "local" | false | undefined;
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
        readonly level?: "debug" | "info" | "warn" | "error" | undefined;
        readonly format?: "pretty" | "json" | undefined;
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
  defaults: Schema.optionalWith(
    Schema.Struct({
      networkMode: Schema.optionalWith(Schema.Literal("pasta", "slirp4netns"), {
        default: (): "pasta" => "pasta",
      }),
      autoUpdate: Schema.optionalWith(
        Schema.Union(Schema.Literal("registry", "local"), Schema.Literal(false)),
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
      level: Schema.optionalWith(Schema.Literal("debug", "info", "warn", "error"), {
        default: (): "info" => "info",
      }),
      format: Schema.optionalWith(Schema.Literal("pretty", "json"), {
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

/**
 * Service base configuration - common to all services (output after decoding).
 * Note: Username is derived from service name as "divban-<service>"
 * UID is dynamically allocated from range 10000-59999
 */
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

/** Pattern: divban-<service> (e.g., divban-caddy, divban-immich) */
export const getServiceUsername = (
  serviceName: ServiceName
): Effect.Effect<Username, GeneralError> =>
  pipe(
    Effect.succeed(`divban-${serviceName}`),
    Effect.filterOrFail(
      isValidPosixUsername,
      () =>
        new GeneralError({
          code: ErrorCode.INVALID_ARGS as 2,
          message: `Invalid service name for username: ${serviceName}. Must match [a-z_][a-z0-9_-]*`,
        })
    ),
    Effect.filterOrFail(
      (username): username is string => username.length <= 32,
      (username) =>
        new GeneralError({
          code: ErrorCode.INVALID_ARGS as 2,
          message: `Service name too long: ${serviceName}. Username would be ${username.length} chars (max 32)`,
        })
    ),
    Effect.map((username) => username as Username)
  );

/**
 * Get data directory for a service (Effect version).
 * Pattern: <baseDataDir>/divban-<service>
 */
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
