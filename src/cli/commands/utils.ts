/**
 * Shared utilities for CLI commands.
 */

import { DivbanError, ErrorCode } from "../../lib/errors";
import { Err, Ok, type Result } from "../../lib/result";
import type { AbsolutePath } from "../../lib/types";
import type { Service } from "../../services/types";
import { loadServiceConfig } from "../../config/loader";
import { fileExists } from "../../system/fs";

/**
 * Common config file locations for a service.
 */
const getConfigPaths = (
  serviceName: string,
  homeDir: AbsolutePath
): AbsolutePath[] => [
  `${homeDir}/.config/divban/${serviceName}.toml` as AbsolutePath,
  `/etc/divban/${serviceName}.toml` as AbsolutePath,
  `./divban-${serviceName}.toml` as AbsolutePath,
];

/**
 * Find and load a service configuration file.
 * Searches in common locations if no explicit path is provided.
 */
export const resolveServiceConfig = async (
  service: Service,
  homeDir: AbsolutePath,
  explicitPath?: string
): Promise<Result<unknown, DivbanError>> => {
  // If explicit path provided, use it
  if (explicitPath) {
    return loadServiceConfig(
      explicitPath as AbsolutePath,
      service.definition.configSchema
    );
  }

  // Search common locations
  const searchPaths = getConfigPaths(service.definition.name, homeDir);

  for (const path of searchPaths) {
    if (await fileExists(path)) {
      return loadServiceConfig(path, service.definition.configSchema);
    }
  }

  // No config found - this might be OK for some operations
  return Err(
    new DivbanError(
      ErrorCode.CONFIG_NOT_FOUND,
      `No configuration file found for ${service.definition.name}. Searched: ${searchPaths.join(", ")}`
    )
  );
};

/**
 * Format duration for display.
 */
export const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
};

/**
 * Format bytes for display.
 */
export const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  return `${bytes} B`;
};
