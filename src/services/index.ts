/**
 * Service registry and exports.
 */

import { DivbanError, ErrorCode } from "../lib/errors";
import { Err, Ok, type Result } from "../lib/result";
import type { Service, ServiceDefinition } from "./types";

// Service registry
const services = new Map<string, Service>();

/**
 * Register a service in the registry.
 */
export const registerService = (service: Service): void => {
  services.set(service.definition.name, service);
};

/**
 * Get a service by name.
 */
export const getService = (name: string): Result<Service, DivbanError> => {
  const service = services.get(name);

  if (!service) {
    const available = [...services.keys()].join(", ");
    return Err(
      new DivbanError(
        ErrorCode.SERVICE_NOT_FOUND,
        `Unknown service: '${name}'. Available services: ${available || "none"}`
      )
    );
  }

  return Ok(service);
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

/**
 * Get service or throw (for use in CLI where we want to exit on error).
 */
export const getServiceOrThrow = (name: string): Service => {
  const result = getService(name);
  if (!result.ok) {
    throw result.error;
  }
  return result.value;
};
