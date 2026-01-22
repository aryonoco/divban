// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Service interface and type definitions.
 * All services implement this interface for consistent behavior.
 */

import type { Effect, Schema } from "effect";
import type {
  BackupError,
  ConfigError,
  ContainerError,
  GeneralError,
  ServiceError,
  SystemError,
} from "../lib/errors";
import type { Logger } from "../lib/logger";
import type { AbsolutePath, GroupId, ServiceName, UserId, Username } from "../lib/types";

/**
 * Service definition metadata.
 */
export interface ServiceDefinition {
  /** Service name (lowercase, no spaces) */
  name: ServiceName;
  /** Human-readable description */
  description: string;
  /** Service version */
  version: string;

  /** Effect Schema for service-specific configuration */
  // biome-ignore lint/suspicious/noExplicitAny: Required for type-erased service registry
  configSchema: Schema.Schema<any, any, never>;

  /** Service capabilities */
  capabilities: {
    /** Multi-container service (uses stack orchestration) */
    multiContainer: boolean;
    /** Supports reload without restart */
    hasReload: boolean;
    /** Supports backup command */
    hasBackup: boolean;
    /** Supports restore command */
    hasRestore: boolean;
    /** Has hardware acceleration options */
    hardwareAcceleration: boolean;
  };
}

/**
 * System capabilities detected at runtime.
 */
export interface SystemCapabilities {
  /** Whether SELinux is in enforcing mode */
  selinuxEnforcing: boolean;
}

/**
 * Context provided to service operations.
 * @template C - Service-specific configuration type
 */
export interface ServiceContext<C> {
  /** Validated service configuration (typed per service) */
  config: C;
  /** Logger instance */
  logger: Logger;

  /** Filesystem paths */
  paths: {
    /** Data directory for persistent storage */
    dataDir: AbsolutePath;
    /** Quadlet files directory */
    quadletDir: AbsolutePath;
    /** Configuration files directory */
    configDir: AbsolutePath;
    /** User home directory */
    homeDir: AbsolutePath;
  };

  /** Service user information */
  user: {
    /** Username */
    name: Username;
    /** User ID */
    uid: UserId;
    /** Group ID */
    gid: GroupId;
  };

  /** Global options */
  options: {
    /** Dry run mode (don't write files) */
    dryRun: boolean;
    /** Verbose output */
    verbose: boolean;
    /** Force overwrite */
    force: boolean;
  };

  /** System capabilities detected at runtime */
  system: SystemCapabilities;
}

/**
 * Generated files from a service.
 */
export interface GeneratedFiles {
  readonly quadlets: ReadonlyMap<string, string>;
  readonly networks: ReadonlyMap<string, string>;
  readonly volumes: ReadonlyMap<string, string>;
  readonly environment: ReadonlyMap<string, string>;
  readonly other: ReadonlyMap<string, string>;
}

/**
 * Container status discriminated union.
 */
export type ContainerStatus =
  | {
      readonly status: "running";
      readonly pid?: number | undefined;
      readonly startedAt?: Date | undefined;
    }
  | {
      readonly status: "stopped";
      readonly exitCode?: number | undefined;
      readonly stoppedAt?: Date | undefined;
    }
  | {
      readonly status: "failed";
      readonly exitCode?: number | undefined;
      readonly error?: string | undefined;
    }
  | { readonly status: "starting" }
  | { readonly status: "unknown"; readonly rawStatus?: string | undefined };

/**
 * Health check status discriminated union.
 */
export type HealthStatus =
  | { readonly health: "healthy" }
  | { readonly health: "unhealthy"; readonly failingStreak?: number | undefined }
  | { readonly health: "starting" };

/**
 * Container information with status.
 */
export interface ContainerInfo {
  name: string;
  status: ContainerStatus;
  health?: HealthStatus | undefined;
}

/**
 * Service status information.
 */
export interface ServiceStatus {
  running: boolean;
  containers: ContainerInfo[];
}

/**
 * Log viewing options.
 */
export interface LogOptions {
  follow: boolean;
  lines: number;
  container?: string;
}

/**
 * Backup result.
 */
export interface BackupResult {
  path: AbsolutePath;
  size: number;
  timestamp: Date;
}

/**
 * All services must implement these methods.
 * @template C - Service-specific configuration type
 */
export interface ServiceEffect<C> {
  /** Service definition (metadata) */
  readonly definition: ServiceDefinition;

  // === Lifecycle Methods ===

  /**
   * Validate a configuration file.
   * @param configPath Path to configuration file
   */
  validate(configPath: AbsolutePath): Effect.Effect<void, ConfigError | SystemError>;

  /**
   * Generate all files for the service.
   * @param ctx Service context
   */
  generate(ctx: ServiceContext<C>): Effect.Effect<GeneratedFiles, ServiceError | GeneralError>;

  /**
   * Full setup: create user, directories, generate files, install quadlets.
   * @param ctx Service context
   */
  setup(
    ctx: ServiceContext<C>
  ): Effect.Effect<void, ServiceError | SystemError | ContainerError | GeneralError>;

  // === Runtime Methods ===

  /**
   * Start the service.
   * @param ctx Service context
   */
  start(ctx: ServiceContext<C>): Effect.Effect<void, ServiceError | SystemError | GeneralError>;

  /**
   * Stop the service.
   * @param ctx Service context
   */
  stop(ctx: ServiceContext<C>): Effect.Effect<void, ServiceError | SystemError | GeneralError>;

  /**
   * Restart the service.
   * @param ctx Service context
   */
  restart(ctx: ServiceContext<C>): Effect.Effect<void, ServiceError | SystemError | GeneralError>;

  /**
   * Get service status.
   * @param ctx Service context
   */
  status(
    ctx: ServiceContext<C>
  ): Effect.Effect<ServiceStatus, ServiceError | SystemError | GeneralError>;

  /**
   * View service logs.
   * @param ctx Service context
   * @param options Log viewing options
   */
  logs(
    ctx: ServiceContext<C>,
    options: LogOptions
  ): Effect.Effect<void, ServiceError | SystemError | GeneralError>;

  // === Optional Methods ===

  /**
   * Reload configuration without restart (if supported).
   * @param ctx Service context
   */
  reload?(
    ctx: ServiceContext<C>
  ): Effect.Effect<void, ConfigError | ServiceError | SystemError | GeneralError>;

  /**
   * Create a backup (if supported).
   * @param ctx Service context
   */
  backup?(
    ctx: ServiceContext<C>
  ): Effect.Effect<BackupResult, BackupError | SystemError | GeneralError>;

  /**
   * Restore from backup (if supported).
   * @param ctx Service context
   * @param backupPath Path to backup file
   */
  restore?(
    ctx: ServiceContext<C>,
    backupPath: AbsolutePath
  ): Effect.Effect<void, BackupError | SystemError | GeneralError>;
}

/** Type-erased service for registry and CLI usage */
export type AnyServiceEffect = ServiceEffect<unknown>;

// ============================================================================
// GeneratedFiles Operations
// ============================================================================

/**
 * Merge two ReadonlyMaps. Right-biased (later values win).
 */
const mergeMaps = <K, V>(left: ReadonlyMap<K, V>, right: ReadonlyMap<K, V>): ReadonlyMap<K, V> =>
  new Map([...left, ...right]);

/**
 * Empty GeneratedFiles object.
 */
export const emptyGeneratedFiles: GeneratedFiles = {
  quadlets: new Map(),
  networks: new Map(),
  volumes: new Map(),
  environment: new Map(),
  other: new Map(),
};

/**
 * Create an empty GeneratedFiles object.
 * @deprecated Use `emptyGeneratedFiles` constant instead.
 */
export const createGeneratedFiles = (): GeneratedFiles => emptyGeneratedFiles;

/**
 * Merge two GeneratedFiles. Right-biased (later values win).
 */
export const appendGeneratedFiles = (
  left: GeneratedFiles,
  right: GeneratedFiles
): GeneratedFiles => ({
  quadlets: mergeMaps(left.quadlets, right.quadlets),
  networks: mergeMaps(left.networks, right.networks),
  volumes: mergeMaps(left.volumes, right.volumes),
  environment: mergeMaps(left.environment, right.environment),
  other: mergeMaps(left.other, right.other),
});

/**
 * Concatenate multiple GeneratedFiles into one.
 */
export const concatGeneratedFiles = (files: readonly GeneratedFiles[]): GeneratedFiles =>
  files.reduce(appendGeneratedFiles, emptyGeneratedFiles);

/**
 * Merge multiple GeneratedFiles objects (variadic).
 */
export const mergeGeneratedFiles = (...files: readonly GeneratedFiles[]): GeneratedFiles =>
  concatGeneratedFiles(files);

/**
 * Get total file count from GeneratedFiles.
 */
export const getFileCount = (files: GeneratedFiles): number => {
  return (
    files.quadlets.size +
    files.networks.size +
    files.volumes.size +
    files.environment.size +
    files.other.size
  );
};
