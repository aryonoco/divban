// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Service registry and exports.
 */

import { DivbanError, ErrorCode } from "../lib/errors";
import { fromUndefined, okOr } from "../lib/option";
import type { Result } from "../lib/result";
import type { AnyService, ServiceDefinition } from "./types";

// Service registry
const services = new Map<string, AnyService>();

/**
 * Register a service in the registry.
 */
export const registerService = (service: AnyService): void => {
  services.set(service.definition.name, service);
};

/**
 * Get a service by name.
 */
export const getService = (name: string): Result<AnyService, DivbanError> => {
  const available = [...services.keys()].join(", ");
  return okOr(
    fromUndefined(services.get(name)),
    new DivbanError(
      ErrorCode.SERVICE_NOT_FOUND,
      `Unknown service: '${name}'. Available services: ${available || "none"}`
    )
  );
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

// Re-export types
export type {
  AnyService,
  BackupResult,
  GeneratedFiles,
  LogOptions,
  Service,
  ServiceContext,
  ServiceDefinition,
  ServiceStatus,
} from "./types";

export { createGeneratedFiles, getFileCount, mergeGeneratedFiles } from "./types";

// Import and register services
// Note: Services are imported dynamically to avoid circular dependencies
// and to allow lazy loading

/**
 * Initialize all built-in services.
 * Call this at application startup.
 */
export const initializeServices = async (): Promise<void> => {
  // Import services dynamically
  const { caddyService } = await import("./caddy");
  const { immichService } = await import("./immich");
  const { actualService } = await import("./actual");

  // Register services
  registerService(caddyService);
  registerService(immichService);
  registerService(actualService);
};
