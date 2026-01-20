// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Service registry and exports - Effect-based.
 */

import { Effect } from "effect";
import { ErrorCode, ServiceError } from "../lib/errors";
import type { AnyServiceEffect, ServiceDefinition } from "./types";

// Service registry
const services = new Map<string, AnyServiceEffect>();

/**
 * Register a service in the registry.
 */
export const registerService = (service: AnyServiceEffect): void => {
  services.set(service.definition.name, service);
};

/**
 * Get a service by name.
 */
export const getService = (name: string): Effect.Effect<AnyServiceEffect, ServiceError> => {
  const service = services.get(name);
  if (service === undefined) {
    const available = [...services.keys()].join(", ");
    return Effect.fail(
      new ServiceError({
        code: ErrorCode.SERVICE_NOT_FOUND as 30,
        message: `Unknown service: '${name}'. Available services: ${available || "none"}`,
      })
    );
  }
  return Effect.succeed(service);
};

/**
 * List all registered services.
 */
export const listServices = (): ServiceDefinition[] => {
  return [...services.values()].map((s) => s.definition);
};

/**
 * Check if a service is registered.
 */
export const hasService = (name: string): boolean => {
  return services.has(name);
};

/**
 * Get all service names.
 */
export const getServiceNames = (): string[] => {
  return [...services.keys()];
};

// Re-export types from Effect version
export type {
  AnyServiceEffect,
  BackupResult,
  GeneratedFiles,
  LogOptions,
  ServiceEffect,
  ServiceContext,
  ServiceDefinition,
  ServiceStatus,
} from "./types";

export { createGeneratedFiles, getFileCount, mergeGeneratedFiles } from "./types";

/**
 * Initialize all built-in services.
 */
export const initializeServices = async (): Promise<void> => {
  const { caddyService } = await import("./caddy");
  const { immichService } = await import("./immich");
  const { actualService } = await import("./actual");

  registerService(caddyService);
  registerService(immichService);
  registerService(actualService);
};
