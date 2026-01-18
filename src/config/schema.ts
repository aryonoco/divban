// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Zod schemas for divban configuration files.
 * Single source of truth for configuration structure and validation.
 */

import { z } from "zod";
import { DivbanError, ErrorCode } from "../lib/errors";
import { Err, Ok, type Result } from "../lib/result";
import { type AbsolutePath, type Username, AbsolutePath as makeAbsolutePath } from "../lib/types";

/**
 * Top-level regex patterns for validation (better performance).
 */
const POSIX_USERNAME_REGEX = /^[a-z_][a-z0-9_-]*$/;

/**
 * Reusable schema components
 */
export const absolutePathSchema: z.ZodEffects<z.ZodString, string, string> = z
  .string()
  .refine((s) => s.startsWith("/"), {
    message: "Path must be absolute (start with /)",
  });

export const usernameSchema: z.ZodString = z.string().regex(/^[a-z_][a-z0-9_-]*$/, {
  message: "Username must match [a-z_][a-z0-9_-]*",
});

export const containerImageSchema: z.ZodString = z
  .string()
  .regex(/^[\w./-]+(:[\w.-]+)?(@sha256:[a-f0-9]+)?$/, {
    message: "Invalid container image format",
  });

/** Port mapping configuration */
export interface PortConfig {
  host: number;
  container: number;
  hostIp?: string | undefined;
  protocol: "tcp" | "udp";
}

export const portSchema: z.ZodType<PortConfig> = z.object({
  host: z.number().int().min(1).max(65535),
  container: z.number().int().min(1).max(65535),
  hostIp: z.string().ip().optional(),
  protocol: z.enum(["tcp", "udp"]).default("tcp"),
}) as z.ZodType<PortConfig>;

/** Volume mount configuration */
export interface VolumeMountConfig {
  source: string;
  target: string;
  options?: string | undefined;
}

export const volumeMountSchema: z.ZodType<VolumeMountConfig> = z.object({
  source: z.string(),
  target: absolutePathSchema,
  options: z.string().optional(),
});

/** Health check configuration */
export interface HealthCheckConfig {
  cmd: string;
  interval: string;
  timeout: string;
  retries: number;
  startPeriod: string;
  onFailure: "none" | "kill" | "restart" | "stop";
}

export const healthCheckSchema: z.ZodType<HealthCheckConfig> = z.object({
  cmd: z.string(),
  interval: z.string().default("30s"),
  timeout: z.string().default("30s"),
  retries: z.number().int().min(1).default(3),
  startPeriod: z.string().default("0s"),
  onFailure: z.enum(["none", "kill", "restart", "stop"]).default("none"),
}) as z.ZodType<HealthCheckConfig>;

/** Service restart policy */
export type ServiceRestartPolicy =
  | "no"
  | "on-success"
  | "on-failure"
  | "on-abnormal"
  | "on-abort"
  | "always";

export const serviceRestartSchema: z.ZodEnum<
  ["no", "on-success", "on-failure", "on-abnormal", "on-abort", "always"]
> = z.enum(["no", "on-success", "on-failure", "on-abnormal", "on-abort", "always"]);

/**
 * Base container configuration.
 * Used by all services as the foundation for container definitions.
 */
export interface ContainerBaseConfig {
  image: string;
  imageDigest?: string | undefined;
  networkMode: "pasta" | "slirp4netns" | "host" | "none";
  ports?: PortConfig[] | undefined;
  volumes?: VolumeMountConfig[] | undefined;
  environment?: Record<string, string> | undefined;
  environmentFiles?: string[] | undefined;
  healthCheck?: HealthCheckConfig | undefined;
  readOnlyRootfs: boolean;
  noNewPrivileges: boolean;
  capAdd?: string[] | undefined;
  capDrop?: string[] | undefined;
  seccompProfile?: string | undefined;
  shmSize?: string | undefined;
  devices?: string[] | undefined;
  autoUpdate: "registry" | "local" | false;
  restart: ServiceRestartPolicy;
  restartSec?: number | undefined;
  timeoutStartSec?: number | undefined;
  timeoutStopSec?: number | undefined;
}

export const containerBaseSchema: z.ZodType<ContainerBaseConfig> = z.object({
  image: containerImageSchema,
  imageDigest: z.string().optional(),
  networkMode: z.enum(["pasta", "slirp4netns", "host", "none"]).default("pasta"),
  ports: z.array(portSchema).optional(),
  volumes: z.array(volumeMountSchema).optional(),
  environment: z.record(z.string()).optional(),
  environmentFiles: z.array(absolutePathSchema).optional(),
  healthCheck: healthCheckSchema.optional(),
  readOnlyRootfs: z.boolean().default(false),
  noNewPrivileges: z.boolean().default(true),
  capAdd: z.array(z.string()).optional(),
  capDrop: z.array(z.string()).optional(),
  seccompProfile: absolutePathSchema.optional(),
  shmSize: z.string().optional(),
  devices: z.array(z.string()).optional(),
  autoUpdate: z.enum(["registry", "local"]).or(z.literal(false)).default("registry"),
  restart: serviceRestartSchema.default("on-failure"),
  restartSec: z.number().int().min(0).optional(),
  timeoutStartSec: z.number().int().min(0).optional(),
  timeoutStopSec: z.number().int().min(0).optional(),
}) as z.ZodType<ContainerBaseConfig>;

/**
 * Global configuration for divban.toml
 */
export interface GlobalConfig {
  defaults: {
    networkMode: "pasta" | "slirp4netns";
    autoUpdate: "registry" | "local" | false;
    timezone: string;
  };
  users: {
    uidRangeStart: number;
    uidRangeEnd: number;
    subuidRangeStart: number;
    subuidRangeSize: number;
  };
  logging: {
    level: "debug" | "info" | "warn" | "error";
    format: "pretty" | "json";
  };
  paths: {
    baseDataDir: string;
  };
}

export const globalConfigSchema: z.ZodType<GlobalConfig> = z.object({
  defaults: z
    .object({
      networkMode: z.enum(["pasta", "slirp4netns"]).default("pasta"),
      autoUpdate: z.enum(["registry", "local"]).or(z.literal(false)).default("registry"),
      timezone: z.string().default("UTC"),
    })
    .default({}),
  users: z
    .object({
      uidRangeStart: z.number().int().min(10000).max(59999).default(10000),
      uidRangeEnd: z.number().int().min(10000).max(59999).default(59999),
      subuidRangeStart: z.number().int().min(100000).default(100000),
      subuidRangeSize: z.number().int().min(65536).default(65536),
    })
    .default({}),
  logging: z
    .object({
      level: z.enum(["debug", "info", "warn", "error"]).default("info"),
      format: z.enum(["pretty", "json"]).default("pretty"),
    })
    .default({}),
  paths: z
    .object({
      baseDataDir: absolutePathSchema.default("/srv"),
    })
    .default({}),
}) as z.ZodType<GlobalConfig>;

/**
 * Service base configuration - common to all services.
 * Note: Username is derived from service name as "divban-<service>"
 * UID is dynamically allocated from range 10000-59999
 */
export interface ServiceBaseConfig {
  paths: {
    dataDir: string;
  };
}

export const serviceBaseSchema: z.ZodType<ServiceBaseConfig> = z.object({
  paths: z.object({
    dataDir: absolutePathSchema,
  }),
});

/**
 * Generate username from service name.
 * Pattern: divban-<service>
 * Examples: divban-caddy, divban-immich, divban-actual
 */
export const getServiceUsername = (serviceName: string): Result<Username, DivbanError> => {
  const username = `divban-${serviceName}`;

  // Validate against POSIX username rules
  if (!POSIX_USERNAME_REGEX.test(username)) {
    return Err(
      new DivbanError(
        ErrorCode.INVALID_ARGS,
        `Invalid service name for username: ${serviceName}. Must match [a-z_][a-z0-9_-]*`
      )
    );
  }
  if (username.length > 32) {
    return Err(
      new DivbanError(
        ErrorCode.INVALID_ARGS,
        `Service name too long: ${serviceName}. Username would be ${username.length} chars (max 32)`
      )
    );
  }

  return Ok(username as Username);
};

/**
 * Get data directory for a service.
 * Pattern: <baseDataDir>/divban-<service>
 */
export const getServiceDataDir = (
  serviceName: string,
  baseDataDir = "/srv"
): Result<AbsolutePath, DivbanError> => {
  const usernameResult = getServiceUsername(serviceName);
  if (!usernameResult.ok) {
    return usernameResult;
  }

  const pathResult = makeAbsolutePath(`${baseDataDir}/${usernameResult.value}`);
  if (!pathResult.ok) {
    return Err(
      new DivbanError(
        ErrorCode.INVALID_ARGS,
        `Invalid data directory: ${baseDataDir}/${usernameResult.value}`
      )
    );
  }
  return pathResult;
};

/**
 * Get quadlet directory for a service user.
 */
export const getQuadletDir = (homeDir: string): Result<AbsolutePath, DivbanError> => {
  return makeAbsolutePath(`${homeDir}/.config/containers/systemd`);
};

/**
 * Get config directory for a service.
 */
export const getConfigDir = (dataDir: string): Result<AbsolutePath, DivbanError> => {
  return makeAbsolutePath(`${dataDir}/config`);
};
