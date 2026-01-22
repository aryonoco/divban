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

import type { Context, Effect, Schema } from "effect";
import type {
  BackupError,
  ConfigError,
  ContainerError,
  GeneralError,
  ServiceError,
  SystemError,
} from "../lib/errors";
import type { AbsolutePath, ServiceName } from "../lib/types";
import type {
  AppLogger,
  ServiceOptions,
  ServicePaths,
  ServiceUser,
  SystemCapabilities,
} from "./context";

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
 * Uses Effect's context system - no explicit ctx parameter.
 * Dependencies tracked via R type parameter.
 *
 * @template C - Service-specific configuration type
 * @template I - Identifier type for the context tag
 * @template ConfigTag - Context.Tag for the service's configuration
 */
export interface ServiceEffect<C, I, ConfigTag extends Context.Tag<I, C>> {
  /** Service definition (metadata) */
  readonly definition: ServiceDefinition;

  /** Context tag for accessing this service's configuration */
  readonly configTag: ConfigTag;

  // === Lifecycle Methods ===

  /**
   * Validate a configuration file.
   * @param configPath Path to configuration file
   */
  validate(configPath: AbsolutePath): Effect.Effect<void, ConfigError | SystemError>;

  /**
   * Generate all files for the service.
   * Dependencies accessed via Effect context.
   */
  generate(): Effect.Effect<
    GeneratedFiles,
    ServiceError | GeneralError,
    Context.Tag.Identifier<ConfigTag> | ServicePaths | SystemCapabilities
  >;

  /**
   * Full setup: create user, directories, generate files, install quadlets.
   * Dependencies accessed via Effect context.
   */
  setup(): Effect.Effect<
    void,
    ServiceError | SystemError | ContainerError | GeneralError,
    | Context.Tag.Identifier<ConfigTag>
    | ServicePaths
    | ServiceUser
    | ServiceOptions
    | SystemCapabilities
    | AppLogger
  >;

  // === Runtime Methods ===

  /**
   * Start the service.
   * Dependencies accessed via Effect context.
   */
  start(): Effect.Effect<
    void,
    ServiceError | SystemError | GeneralError,
    Context.Tag.Identifier<ConfigTag> | ServiceUser | AppLogger
  >;

  /**
   * Stop the service.
   * Dependencies accessed via Effect context.
   */
  stop(): Effect.Effect<
    void,
    ServiceError | SystemError | GeneralError,
    Context.Tag.Identifier<ConfigTag> | ServiceUser | AppLogger
  >;

  /**
   * Restart the service.
   * Dependencies accessed via Effect context.
   */
  restart(): Effect.Effect<
    void,
    ServiceError | SystemError | GeneralError,
    Context.Tag.Identifier<ConfigTag> | ServiceUser | AppLogger
  >;

  /**
   * Get service status.
   * Dependencies accessed via Effect context.
   */
  status(): Effect.Effect<
    ServiceStatus,
    ServiceError | SystemError | GeneralError,
    Context.Tag.Identifier<ConfigTag> | ServiceUser
  >;

  /**
   * View service logs.
   * @param options Log viewing options
   * Dependencies accessed via Effect context.
   */
  logs(
    options: LogOptions
  ): Effect.Effect<
    void,
    ServiceError | SystemError | GeneralError,
    Context.Tag.Identifier<ConfigTag> | ServiceUser
  >;

  // === Optional Methods ===

  /**
   * Reload configuration without restart (if supported).
   * Dependencies accessed via Effect context.
   */
  reload?(): Effect.Effect<
    void,
    ConfigError | ServiceError | SystemError | GeneralError,
    Context.Tag.Identifier<ConfigTag> | ServiceUser | AppLogger
  >;

  /**
   * Create a backup (if supported).
   * Dependencies accessed via Effect context.
   */
  backup?(): Effect.Effect<
    BackupResult,
    BackupError | SystemError | GeneralError,
    Context.Tag.Identifier<ConfigTag> | ServiceUser | ServicePaths | AppLogger
  >;

  /**
   * Restore from backup (if supported).
   * @param backupPath Path to backup file
   * Dependencies accessed via Effect context.
   */
  restore?(
    backupPath: AbsolutePath
  ): Effect.Effect<
    void,
    BackupError | SystemError | GeneralError,
    Context.Tag.Identifier<ConfigTag> | ServiceUser | ServicePaths | AppLogger
  >;
}

/** Type-erased service for registry and CLI usage */
// biome-ignore lint/suspicious/noExplicitAny: Required for type-erased service registry
export type AnyServiceEffect = ServiceEffect<any, any, Context.Tag<any, any>>;

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
