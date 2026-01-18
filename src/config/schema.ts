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
export const absolutePathSchema = z.string().refine((s) => s.startsWith("/"), {
  message: "Path must be absolute (start with /)",
});

export const usernameSchema = z.string().regex(/^[a-z_][a-z0-9_-]*$/, {
  message: "Username must match [a-z_][a-z0-9_-]*",
});

export const containerImageSchema = z.string().regex(/^[\w./-]+(:[\w.-]+)?(@sha256:[a-f0-9]+)?$/, {
  message: "Invalid container image format",
});

export const portSchema = z.object({
  host: z.number().int().min(1).max(65535),
  container: z.number().int().min(1).max(65535),
  hostIp: z.string().ip().optional(),
  protocol: z.enum(["tcp", "udp"]).default("tcp"),
});

export const volumeMountSchema = z.object({
  source: z.string(),
  target: absolutePathSchema,
  options: z.string().optional(),
});

export const healthCheckSchema = z.object({
  cmd: z.string(),
  interval: z.string().default("30s"),
  timeout: z.string().default("30s"),
  retries: z.number().int().min(1).default(3),
  startPeriod: z.string().default("0s"),
  onFailure: z.enum(["none", "kill", "restart", "stop"]).default("none"),
});

export const serviceRestartSchema = z.enum([
  "no",
  "on-success",
  "on-failure",
  "on-abnormal",
  "on-abort",
  "always",
]);

/**
 * Base container configuration schema.
 * Used by all services as the foundation for container definitions.
 */
export const containerBaseSchema = z.object({
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
});

export type ContainerBaseConfig = z.infer<typeof containerBaseSchema>;

/**
 * Global configuration schema for divban.toml
 */
export const globalConfigSchema = z.object({
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
});

export type GlobalConfig = z.infer<typeof globalConfigSchema>;

/**
 * Service base schema - common to all services.
 * Note: Username is derived from service name as "divban-<service>"
 * UID is dynamically allocated from range 10000-59999
 */
export const serviceBaseSchema = z.object({
  paths: z.object({
    dataDir: absolutePathSchema,
  }),
});

export type ServiceBaseConfig = z.infer<typeof serviceBaseSchema>;

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

  try {
    return Ok(makeAbsolutePath(`${baseDataDir}/${usernameResult.value}`));
  } catch (_e) {
    return Err(
      new DivbanError(
        ErrorCode.INVALID_ARGS,
        `Invalid data directory: ${baseDataDir}/${usernameResult.value}`
      )
    );
  }
};

/**
 * Get quadlet directory for a service user.
 */
export const getQuadletDir = (homeDir: string): AbsolutePath => {
  return makeAbsolutePath(`${homeDir}/.config/containers/systemd`);
};

/**
 * Get config directory for a service.
 */
export const getConfigDir = (dataDir: string): AbsolutePath => {
  return makeAbsolutePath(`${dataDir}/config`);
};
