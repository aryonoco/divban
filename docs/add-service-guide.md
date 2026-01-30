# Adding a Service to divban - AI Agent Instructions

This document provides complete instructions for adding a new containerized service to divban given a docker-compose file as input. Follow these instructions exactly to generate code that passes `just ci`.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Prerequisites: Read These Files First](#2-prerequisites-read-these-files-first)
3. [Step 1: Analyze the Docker-Compose](#3-step-1-analyze-the-docker-compose)
4. [Step 2: Create the TOML Configuration](#4-step-2-create-the-toml-configuration)
5. [Step 3: Implement config.ts](#5-step-3-implement-configts)
6. [Step 4: Implement schema.ts](#6-step-4-implement-schemats)
7. [Step 5: Implement index.ts](#7-step-5-implement-indexts)
8. [Step 6: Register the Service](#8-step-6-register-the-service)
9. [Multi-Container Services](#9-multi-container-services)
10. [Backup and Restore](#10-backup-and-restore)
11. [Branded Types Reference](#11-branded-types-reference)
12. [Coding Standards](#12-coding-standards)
13. [Verification](#13-verification)
14. [Reference Tables](#14-reference-tables)
15. [Quick Debugging](#15-quick-debugging)

---

## 1. Overview

### What divban Does

divban is a CLI for managing rootless Podman services with systemd Quadlet integration:
- Each service runs as a dedicated system user (`divban-{servicename}`)
- Uses rootless Podman with user namespace isolation
- Managed via systemd user sessions (Quadlet files)
- Declarative TOML configuration

### What You Create

1. **Example TOML** (`examples/divban-{servicename}.toml`) - User-facing configuration
2. **Service directory** (`src/services/{servicename}/`) containing:
   - `config.ts` - Context.Tag for dependency injection
   - `schema.ts` - Effect Schema for validation
   - `index.ts` - Main implementation
3. **Registration** in `src/services/index.ts`

### Service Classification

| Type | Containers | Setup Steps | Helper |
|------|------------|-------------|--------|
| **Single-container** | 1 | 4 | `createSingleContainerOps()` |
| **Multi-container** | 2+ | 5+ | Stack orchestration |

---

## 2. Prerequisites: Read These Files First

Before implementing, read these existing patterns to understand the codebase:

**Single-container reference** (follow this pattern closely):
- `src/services/actual/index.ts` - Complete single-container service
- `src/services/actual/schema.ts` - Schema definition pattern with backup config
- `src/services/actual/config.ts` - Context tag pattern
- `examples/divban-actual.toml` - Example TOML configuration

**Single-container with backup** (for services needing backup/restore):
- `src/services/freshrss/index.ts` - Single-container with unified backup
- `src/services/freshrss/schema.ts` - Schema with versioning + backup config

**Multi-container reference** (for complex services):
- `src/services/immich/index.ts` - Multi-container stack service
- `src/services/immich/schema.ts` - Complex schema with nested configs
- `src/services/immich/constants.ts` - Container names and default images
- `src/services/immich/secrets.ts` - Secret definitions
- `examples/divban-immich.toml` - Multi-container TOML example

**Core infrastructure**:
- `src/lib/types.ts` - Branded type definitions (MUST use these)
- `src/lib/log.ts` - CLI logging utilities (logSuccess, logFail, logStep)
- `src/lib/traced.ts` - Operation tracing with Effect spans
- `src/lib/escape-codec.ts` - Bidirectional string escape codecs
- `src/config/field-values.ts` - Common enum values for schemas
- `src/services/helpers.ts` - Setup pipeline helpers
- `src/services/types.ts` - ServiceEffect interface
- `src/lib/versioning/` - Config and backup schema versioning
- `src/lib/db-backup/` - Unified backup strategies (postgres, sqlite-stop, freshrss-cli)
- `CLAUDE.md` - Coding standards (CRITICAL - must follow exactly)

---

## 3. Step 1: Analyze the Docker-Compose

Before writing code, analyze the docker-compose to classify and extract information.

### 3.1 Classify Service Type

**Single-container**: One service (e.g., Actual Budget, Caddy)
- Use `createSingleContainerOps()` helper
- Simple 4-step setup pipeline

**Multi-container**: Multiple interdependent services (e.g., Immich with server + postgres + redis)
- Use stack orchestration (`createStack`, `generateStackQuadlets`)
- 5+ step setup pipeline with secrets management

### 3.2 Extract Per-Container Information

```yaml
services:
  myservice:
    image:           # Container image (add full registry prefix)
    ports:           # Host:container port mappings
    volumes:         # Bind mounts and named volumes
    environment:     # Static config and secrets (passwords = auto-generated)
    depends_on:      # Service dependencies (for systemd ordering)
    healthcheck:     # Health monitoring
    restart:         # Restart policy
    cap_add/cap_drop: # Linux capabilities
    security_opt:    # Security options (no-new-privileges, etc.)
    read_only:       # Read-only rootfs
```

### 3.3 Determine Capabilities

```typescript
capabilities: {
  multiContainer: boolean;        // Multiple containers?
  hasReload: boolean;             // Can reload config without restart?
  hasBackup: boolean;             // Has database/data to backup?
  hasRestore: boolean;            // Can restore from backup?
  hardwareAcceleration: boolean;  // GPU/hardware support?
}
```

### 3.4 Secret Detection

Environment variables containing passwords, API keys, or tokens should be auto-generated secrets via podman secrets, not user-configured values in TOML.

---

## 4. Step 2: Create the TOML Configuration

Create `examples/divban-{servicename}.toml`:

```toml
# SPDX-License-Identifier: 0BSD
# SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
#
# divban-{servicename}.toml - {ServiceName} configuration

divbanConfigSchemaVersion = "1.0.0"

[paths]
# Directory for service data
dataDir = "/srv/divban-{servicename}"

# ─────────────────────────────────────────────────────────────────────────────
# Container Configuration
# ─────────────────────────────────────────────────────────────────────────────

[container]
# Container image (include full registry prefix: docker.io/, ghcr.io/, etc.)
image = "docker.io/org/image:tag"

# Auto-update policy: "registry", "local", or omit for none
autoUpdate = "registry"

# ─────────────────────────────────────────────────────────────────────────────
# Network Configuration
# ─────────────────────────────────────────────────────────────────────────────

[network]
# Port to expose (default: from container docs)
port = 8080

# Host IP to bind to (127.0.0.1 for local only, 0.0.0.0 for all interfaces)
host = "127.0.0.1"

# ─────────────────────────────────────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────────────────────────────────────

# Log level: "debug", "info", "warn", "error"
logLevel = "info"
```

### Configuration Design Rules

1. **Include schema version** - All configs MUST start with `divbanConfigSchemaVersion = "1.0.0"` after the header
2. **Use sensible defaults** - Most options should be optional in schema with defaults
3. **Secrets are generated, not configured** - Document with comment: `# Password auto-generated during setup`
4. **Paths are absolute** - Always start with `/`
5. **Include full registry prefixes** - Use `docker.io/`, `ghcr.io/`, `quay.io/`, etc.
6. **Comments document usage** - Add helpful comments for users
7. **Backup config has defaults** - Backup configuration typically doesn't need TOML exposure as it has sensible defaults

---

## 5. Step 3: Implement config.ts

Create `src/services/{servicename}/config.ts`:

```typescript
// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * {ServiceName} service configuration context tag.
 * Uses Context.GenericTag for isolatedDeclarations: true compatibility.
 */

import { Context } from "effect";
import type { {ServiceName}Config } from "./schema";

export interface {ServiceName}ConfigTag {
  readonly _tag: "{ServiceName}Config";
}

/**
 * {ServiceName} configuration context.
 * Used to access service configuration in Effect generators via `yield* {ServiceName}ConfigTag`.
 */
export const {ServiceName}ConfigTag: Context.Tag<{ServiceName}ConfigTag, {ServiceName}Config> = Context.GenericTag<
  {ServiceName}ConfigTag,
  {ServiceName}Config
>("divban/{ServiceName}Config");
```

**Critical Notes:**
- Interface has phantom `_tag` field (compile-time only, not present at runtime)
- Tag name follows pattern `divban/{ServiceName}Config`
- MUST use `Context.GenericTag` (not `Context.Tag` constructor)
- Import config type from `./schema`

---

## 6. Step 4: Implement schema.ts

Create `src/services/{servicename}/schema.ts`:

```typescript
// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * {ServiceName} service configuration schema.
 */

import { Schema } from "effect";
import { absolutePathSchema, containerImageSchema } from "../../config/schema";
// For enum constants (log levels, network modes, restart policies, etc.):
// import { LOG_LEVEL_VALUES, LOG_LEVEL_DEFAULT } from "../../config/field-values";
// For services with backup support, import the appropriate backup config type:
// import type { SqliteStopBackupConfig } from "../../lib/db-backup";
// import type { PostgresBackupConfig } from "../../lib/db-backup";
// import type { FreshRssCliBackupConfig } from "../../lib/db-backup";
import { isValidIP } from "../../lib/schema-utils";
import {
  type AbsolutePath,
  type ContainerImage,
  type ContainerName,
  containerImage,
  containerName,
} from "../../lib/types";
// REQUIRED import for all backup strategies:
// import { ContainerNameSchema } from "../../lib/types";
import {
  type DivbanConfigSchemaVersion,
  DivbanConfigSchemaVersionSchema,
} from "../../lib/versioning";

// ============================================================================
// Backup Configuration Interfaces (define BEFORE main Config if service has backup)
// ============================================================================

// For services with backup support, define backup config interfaces here first:
// export interface {ServiceName}BackupConfigInput { ... }
// export const {servicename}BackupConfigSchema: Schema.Schema<...> = ...
// See Section 10 and actual/schema.ts or freshrss/schema.ts for examples.

// ============================================================================
// Output Interface (after validation, with branded types)
// ============================================================================

export interface {ServiceName}Config {
  /** Config schema version - required for all configs */
  readonly divbanConfigSchemaVersion: DivbanConfigSchemaVersion;
  /** Path configuration */
  readonly paths: {
    /** Directory for service data */
    readonly dataDir: AbsolutePath;
  };
  /** Container configuration */
  readonly container?:
    | {
        /** Container image */
        readonly image: ContainerImage;
        /** Auto-update policy */
        readonly autoUpdate?: "registry" | "local" | undefined;
      }
    | undefined;
  /** Network configuration */
  readonly network?:
    | {
        /** Host port to bind */
        readonly port: number;
        /** Host IP to bind */
        readonly host: string;
      }
    | undefined;
  /** Logging level */
  readonly logLevel: "debug" | "info" | "warn" | "error";
  // For services with backup support, add:
  // readonly backup: SqliteStopBackupConfig;  // or PostgresBackupConfig, FreshRssCliBackupConfig
}

// ============================================================================
// Input Interface (before validation, with optional defaults)
// ============================================================================

/** Fields with defaults are optional in input */
export interface {ServiceName}ConfigInput {
  readonly divbanConfigSchemaVersion: string;  // Required, validated by schema
  readonly paths: {
    readonly dataDir: string;  // string, not AbsolutePath
  };
  readonly container?:
    | {
        readonly image?: string | undefined;  // optional with default
        readonly autoUpdate?: "registry" | "local" | undefined;
      }
    | undefined;
  readonly network?:
    | {
        readonly port?: number | undefined;  // optional with default
        readonly host?: string | undefined;
      }
    | undefined;
  readonly logLevel?: "debug" | "info" | "warn" | "error" | undefined;
  // For services with backup support, add:
  // readonly backup?: {ServiceName}BackupConfigInput | undefined;
}

// ============================================================================
// Constants (use branded type constructors)
// ============================================================================

const {SERVICENAME}_CONTAINER = containerName("{servicename}");

// ============================================================================
// Backup Configuration (for services with hasBackup: true)
// ============================================================================

// For services with backup support, define backup config input and schema:
//
// /** Backup configuration input - optional since it has defaults */
// export interface {ServiceName}BackupConfigInput {
//   readonly type?: "sqlite-stop" | undefined;  // or "postgres", "freshrss-cli"
//   readonly container?: string | undefined;
//   // ... strategy-specific optional fields
// }
//
// const defaultBackupConfig = (): SqliteStopBackupConfig => ({
//   type: "sqlite-stop",
//   container: {SERVICENAME}_CONTAINER,
//   sqlitePath: "data/database.sqlite",
//   includeFiles: [],
//   exclude: [],
// });
//
// export const {servicename}BackupConfigSchema: Schema.Schema<
//   SqliteStopBackupConfig,
//   {ServiceName}BackupConfigInput
// > = Schema.Struct({
//   type: Schema.optionalWith(Schema.Literal("sqlite-stop"), {
//     default: (): "sqlite-stop" => "sqlite-stop",
//   }),
//   container: Schema.optionalWith(ContainerNameSchema, {
//     default: (): ContainerName => {SERVICENAME}_CONTAINER,
//   }),
//   // ... strategy-specific fields with defaults
// });

// ============================================================================
// Effect Schema (runtime validation)
// ============================================================================

export const {servicename}ConfigSchema: Schema.Schema<{ServiceName}Config, {ServiceName}ConfigInput> = Schema.Struct({
  divbanConfigSchemaVersion: DivbanConfigSchemaVersionSchema,  // Required for all configs
  paths: Schema.Struct({
    dataDir: absolutePathSchema,
  }),
  container: Schema.optional(
    Schema.Struct({
      image: Schema.optionalWith(containerImageSchema, {
        default: (): ContainerImage =>
          containerImage("docker.io/org/image:tag"),  // Default image
      }),
      autoUpdate: Schema.optional(Schema.Literal("registry", "local")),
    })
  ),
  network: Schema.optional(
    Schema.Struct({
      port: Schema.optionalWith(
        Schema.Number.pipe(Schema.int(), Schema.between(1, 65535)),
        { default: (): number => 8080 }  // Default port
      ),
      host: Schema.optionalWith(
        Schema.String.pipe(
          Schema.filter(isValidIP, { message: (): string => "Invalid IP address" })
        ),
        { default: (): string => "127.0.0.1" }
      ),
    })
  ),
  // Preferred: Use centralized enum values from field-values.ts
  // logLevel: Schema.optionalWith(Schema.Literal(...LOG_LEVEL_VALUES), {
  //   default: (): "info" => LOG_LEVEL_DEFAULT,
  // }),
  // Or inline (works but less maintainable):
  logLevel: Schema.optionalWith(Schema.Literal("debug", "info", "warn", "error"), {
    default: (): "info" => "info",
  }),
  // For services with backup support, add:
  // backup: Schema.optionalWith({servicename}BackupConfigSchema, { default: defaultBackupConfig }),
});

// ============================================================================
// Defaults Export (for reference in generate())
// ============================================================================

interface {ServiceName}Defaults {
  readonly container: { readonly image: ContainerImage };
  readonly network: { readonly port: number; readonly host: string };
}

export const {servicename}Defaults: {ServiceName}Defaults = {
  container: {
    image: containerImage("docker.io/org/image:tag"),
  },
  network: {
    port: 8080,
    host: "127.0.0.1",
  },
} as const;
```

### Schema Patterns

| Pattern | Usage |
|---------|-------|
| `Schema.optional(...)` | Field can be omitted entirely |
| `Schema.optionalWith(..., { default: () => value })` | Optional with default value |
| `Schema.Literal("a", "b", "c")` | Union of literal strings |
| `Schema.Number.pipe(Schema.int(), Schema.between(1, 65535))` | Bounded integer |
| `Schema.filter(predicate, { message: () => "..." })` | Custom validation |

**Common imports from codebase:**
- `absolutePathSchema` from `../../config/schema`
- `containerImageSchema` from `../../config/schema`
- `isValidIP` from `../../lib/schema-utils`

---

## 7. Step 5: Implement index.ts

Create `src/services/{servicename}/index.ts`:

```typescript
// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * {ServiceName} service implementation.
 * Uses Effect's context system - dependencies accessed via yield*.
 */

import { Effect } from "effect";
// For services with backup support, import from db-backup:
// import { backupService, restoreService } from "../../lib/db-backup";
import type { BackupError, GeneralError, ServiceError, SystemError } from "../../lib/errors";
// For CLI output (optional, only if needed for custom logging):
// import { logSuccess, logFail, logStep } from "../../lib/log";
import {
  type AbsolutePath,
  containerImage,
  containerName,
  duration,
  pathJoin,
  serviceName,
} from "../../lib/types";
import { createHttpHealthCheck, relabelVolumes } from "../../quadlet";
import { generateContainerQuadlet } from "../../quadlet/container";
import { ensureDirectoriesTracked, removeDirectoriesReverse } from "../../system/directories";
import {
  ServiceOptions,
  type ServicePaths,
  ServiceUser,
  SystemCapabilities,
} from "../context";
import {
  type EmptyState,
  type FilesWriteResult,
  Outcome,
  type ServicesEnableResult,
  SetupStep,
  cleanupFileBackups,
  createConfigValidator,
  createSingleContainerOps,
  emptyState,
  pipeline,
  reloadAndEnableServicesTracked,
  rollbackFileWrites,
  rollbackServiceChanges,
  wrapBackupResult,
  writeGeneratedFilesTracked,
} from "../helpers";
import type { BackupResult, GeneratedFiles, ServiceDefinition, ServiceEffect } from "../types";
import { {ServiceName}ConfigTag } from "./config";
import { type {ServiceName}Config, {servicename}ConfigSchema } from "./schema";

// ============================================================================
// Constants (use branded type constructors)
// ============================================================================

const SERVICE_NAME = serviceName("{servicename}");
const CONTAINER_NAME = containerName("{servicename}");

// ============================================================================
// Service Definition
// ============================================================================

const definition: ServiceDefinition = {
  name: SERVICE_NAME,
  description: "{Human-readable description}",
  version: "0.1.0",
  capabilities: {
    multiContainer: false,
    hasReload: false,
    hasBackup: false,
    hasRestore: false,
    hardwareAcceleration: false,
  },
};

// ============================================================================
// Standard Operations (start, stop, restart, status, logs)
// ============================================================================

const ops = createSingleContainerOps({
  containerName: CONTAINER_NAME,
  displayName: "{ServiceName}",
});

// ============================================================================
// Config Validation
// ============================================================================

const validate = createConfigValidator({servicename}ConfigSchema);

// ============================================================================
// Generate Quadlet Files
// ============================================================================

const generate = (): Effect.Effect<
  GeneratedFiles,
  ServiceError | GeneralError,
  {ServiceName}ConfigTag | SystemCapabilities
> =>
  Effect.gen(function* () {
    const config = yield* {ServiceName}ConfigTag;
    const system = yield* SystemCapabilities;

    const port = config.network?.port ?? 8080;
    const host = config.network?.host ?? "127.0.0.1";

    const quadletConfig: Parameters<typeof generateContainerQuadlet>[0] = {
      name: CONTAINER_NAME,
      containerName: CONTAINER_NAME,
      description: "{ServiceName} Server",
      image: config.container?.image ?? containerImage("docker.io/org/image:tag"),

      // Network
      ports: [
        {
          hostIp: host,
          host: port,
          container: 8080,  // Container's internal port (from docker docs)
        },
      ],

      // Volumes
      volumes: relabelVolumes(
        [
          {
            source: config.paths.dataDir,
            target: "/data",  // Container's data path (from docker docs)
          },
        ],
        system.selinuxEnforcing
      ),

      // User namespace (keep-id for bind mount compatibility)
      userNs: {
        mode: "keep-id",
      },

      // Health check
      healthCheck: createHttpHealthCheck("http://localhost:8080/", {
        interval: duration("30s"),
        startPeriod: duration("10s"),
      }),

      // Security
      readOnlyRootfs: false,  // Set true if container supports it
      noNewPrivileges: true,

      // Service settings
      service: {
        restart: "always",
      },

      // Auto-update (only include if specified)
      ...(config.container?.autoUpdate !== undefined && {
        autoUpdate: config.container.autoUpdate,
      }),
    };

    const containerQuadlet = generateContainerQuadlet(quadletConfig);

    return {
      quadlets: new Map([[`${CONTAINER_NAME}.container`, containerQuadlet.content]]),
      networks: new Map(),
      volumes: new Map(),
      environment: new Map(),
      other: new Map(),
    };
  });

// ============================================================================
// Setup Pipeline
// ============================================================================

interface GenerateOutput {
  readonly files: GeneratedFiles;
}

interface CreateDirsOutput {
  readonly createdDirs: readonly AbsolutePath[];
}

interface WriteFilesOutput {
  readonly fileResults: FilesWriteResult;
}

interface EnableServicesOutput {
  readonly serviceResults: ServicesEnableResult;
}

const generateStep: SetupStep<
  EmptyState,
  GenerateOutput,
  ServiceError | GeneralError,
  {ServiceName}ConfigTag | SystemCapabilities
> = SetupStep.pure("Generating configuration files...", (_state: EmptyState) =>
  Effect.map(generate(), (files): GenerateOutput => ({ files }))
);

const createDirsStep: SetupStep<
  EmptyState & GenerateOutput,
  CreateDirsOutput,
  SystemError | GeneralError,
  {ServiceName}ConfigTag | ServiceUser
> = SetupStep.resource(
  "Creating data directories...",
  (_state: EmptyState & GenerateOutput) =>
    Effect.gen(function* () {
      const config = yield* {ServiceName}ConfigTag;
      const user = yield* ServiceUser;

      const dataDir = config.paths.dataDir;
      const dirs: readonly AbsolutePath[] = [
        dataDir,
        pathJoin(dataDir, "backups"),  // Add subdirectories as needed
      ];

      const { createdPaths } = yield* ensureDirectoriesTracked(dirs, {
        uid: user.uid,
        gid: user.gid,
      });
      return { createdDirs: createdPaths };
    }),
  (state, outcome): Effect.Effect<void, never, never> =>
    Outcome.match(outcome, {
      onSuccess: (): Effect.Effect<void, never, never> => Effect.void,
      onFailure: (): Effect.Effect<void, never, never> =>
        removeDirectoriesReverse(state.createdDirs),
    })
);

const writeFilesStep: SetupStep<
  EmptyState & GenerateOutput & CreateDirsOutput,
  WriteFilesOutput,
  SystemError | GeneralError,
  ServicePaths | ServiceUser
> = SetupStep.resource(
  "Writing quadlet files...",
  (state: EmptyState & GenerateOutput & CreateDirsOutput) =>
    Effect.map(
      writeGeneratedFilesTracked(state.files),
      (fileResults): WriteFilesOutput => ({ fileResults })
    ),
  (state, outcome): Effect.Effect<void, never, never> =>
    Outcome.match(outcome, {
      onSuccess: (): Effect.Effect<void, never, never> =>
        cleanupFileBackups(state.fileResults.results),
      onFailure: (): Effect.Effect<void, never, never> =>
        rollbackFileWrites(state.fileResults.results),
    })
);

const enableServicesStep: SetupStep<
  EmptyState & GenerateOutput & CreateDirsOutput & WriteFilesOutput,
  EnableServicesOutput,
  ServiceError | SystemError | GeneralError,
  ServiceUser
> = SetupStep.resource(
  "Enabling service...",
  (_state: EmptyState & GenerateOutput & CreateDirsOutput & WriteFilesOutput) =>
    Effect.map(
      reloadAndEnableServicesTracked([CONTAINER_NAME], false),
      (serviceResults): EnableServicesOutput => ({ serviceResults })
    ),
  (state, outcome): Effect.Effect<void, never, ServiceUser> =>
    Outcome.match(outcome, {
      onSuccess: (): Effect.Effect<void, never, never> => Effect.void,
      onFailure: (): Effect.Effect<void, never, ServiceUser> =>
        rollbackServiceChanges(state.serviceResults),
    })
);

const setup = (): Effect.Effect<
  void,
  ServiceError | SystemError | GeneralError,
  {ServiceName}ConfigTag | ServicePaths | ServiceUser | SystemCapabilities
> =>
  pipeline<EmptyState>()
    .andThen(generateStep)
    .andThen(createDirsStep)
    .andThen(writeFilesStep)
    .andThen(enableServicesStep)
    .execute(emptyState);

// ============================================================================
// Export Service
// ============================================================================

export const {servicename}Service: ServiceEffect<{ServiceName}Config, {ServiceName}ConfigTag, typeof {ServiceName}ConfigTag> = {
  definition,
  configTag: {ServiceName}ConfigTag,
  configSchema: {servicename}ConfigSchema,
  validate,
  generate,
  setup,
  start: ops.start,
  stop: ops.stop,
  restart: ops.restart,
  status: ops.status,
  logs: ops.logs,
};
```

### Key Implementation Notes

1. **Branded type constructors** - Use `serviceName()`, `containerName()`, `containerImage()`, `duration()` from `../../lib/types`
2. **`createSingleContainerOps`** - Takes `{ containerName, displayName }` object
3. **`pathJoin`** - Preserves `AbsolutePath` brand when base is `AbsolutePath`
4. **`writeGeneratedFilesTracked`** - Takes `files` from accumulated state (`state.files`)
5. **`relabelVolumes`** - Handles SELinux `:Z` relabeling based on system capabilities
6. **`duration("30s")`** - Creates branded `DurationString` for health checks
7. **`SetupStep.pure`** - For computations without cleanup
8. **`SetupStep.resource`** - For operations requiring rollback on failure
9. **`ServicePaths` import** - Use `type ServicePaths` in the import (it's a type-only import)

---

## 8. Step 6: Register the Service

Edit `src/services/index.ts`:

```typescript
export const initializeServices = async (): Promise<void> => {
  const { caddyService } = await import("./caddy");
  const { immichService } = await import("./immich");
  const { actualService } = await import("./actual");
  const { freshRssService } = await import("./freshrss");
  const { {servicename}Service } = await import("./{servicename}");  // ADD

  registerService(caddyService);
  registerService(immichService);
  registerService(actualService);
  registerService(freshRssService);
  registerService({servicename}Service);  // ADD
};
```

---

## 9. Multi-Container Services

For services with multiple containers (app + database + cache), follow the Immich pattern.

### 9.1 Additional Files

```
src/services/{servicename}/
├── index.ts        # Uses stack APIs
├── config.ts       # Context tag (same pattern)
├── schema.ts       # More complex schema
├── constants.ts    # Container names, default images
└── secrets.ts      # Secret definitions
```

### 9.2 constants.ts

```typescript
// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>

/** Centralized constants for MyService service. */

import {
  type ContainerImage,
  type ContainerName,
  type NetworkName,
  containerImage,
  containerName,
  networkName,
} from "../../lib/types";

interface MyServiceContainers {
  readonly redis: ContainerName;
  readonly postgres: ContainerName;
  readonly main: ContainerName;
}

export const CONTAINERS: MyServiceContainers = {
  redis: containerName("myservice-redis"),
  postgres: containerName("myservice-postgres"),
  main: containerName("myservice"),
} as const;

export const NETWORK_NAME: NetworkName = networkName("myservice-net");

interface MyServiceImages {
  readonly redis: ContainerImage;
  readonly postgres: ContainerImage;
  readonly main: ContainerImage;
}

export const DEFAULT_IMAGES: MyServiceImages = {
  redis: containerImage("docker.io/library/redis:7-alpine"),
  postgres: containerImage("docker.io/library/postgres:16"),
  main: containerImage("docker.io/org/myservice:latest"),
} as const;

export const INTERNAL_URLS = {
  main: "http://myservice:8080",
} as const;
```

### 9.3 secrets.ts

```typescript
// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>

import type { SecretDefinition } from "../../system/secrets";

export const MYSERVICE_SECRETS: readonly SecretDefinition[] = [
  {
    name: "db-password",
    description: "PostgreSQL database password",
    length: 32,
  },
] as const;

export const MyServiceSecretNames = {
  DB_PASSWORD: "db-password",
} as const;
```

### 9.4 Stack Generation Pattern

```typescript
import { Array as Arr, Effect, pipe } from "effect";
import { configFilePath } from "../../lib/paths";
import {
  type AbsolutePath,
  containerImage,
  duration,
  serviceName,
} from "../../lib/types";
import {
  createEnvSecret,
  createHttpHealthCheck,
  createKeepIdNs,
  createMountedSecret,
  createPostgresHealthCheck,
  createRedisHealthCheck,
  getSecretMountPath,
} from "../../quadlet";
import { createStack, generateEnvFile, generateStackQuadlets } from "../../stack";
import type { StackContainer } from "../../stack/types";
import { getPodmanSecretName } from "../../system/secrets";
import { ServicePaths, SystemCapabilities } from "../context";

const generate = (): Effect.Effect<
  GeneratedFiles,
  ServiceError | GeneralError,
  MyServiceConfigTag | ServicePaths | SystemCapabilities
> =>
  Effect.gen(function* () {
    const config = yield* MyServiceConfigTag;
    const paths = yield* ServicePaths;
    const system = yield* SystemCapabilities;

    const dbSecretName = getPodmanSecretName(SERVICE_NAME, MyServiceSecretNames.DB_PASSWORD);
    const networkHost = config.network?.host ?? "127.0.0.1";
    const networkPort = config.network?.port ?? 8080;

    // Environment file
    const envContent = generateEnvFile({
      header: "MyService Environment Configuration",
      groups: [
        {
          name: "Database Configuration",
          vars: {
            DB_HOSTNAME: CONTAINERS.postgres,
            DB_PORT: 5432,
            DB_DATABASE_NAME: config.database.database,
            DB_USERNAME: config.database.username,
          },
        },
        {
          name: "Redis Configuration",
          vars: {
            REDIS_HOSTNAME: CONTAINERS.redis,
            REDIS_PORT: 6379,
          },
        },
      ],
    });

    // Define containers
    const redisContainer: StackContainer = {
      name: CONTAINERS.redis,
      description: "MyService Redis cache",
      image: DEFAULT_IMAGES.redis,
      healthCheck: createRedisHealthCheck(),
      readOnlyRootfs: true,
      noNewPrivileges: true,
      service: { restart: "always" },
    };

    const postgresContainer: StackContainer = {
      name: CONTAINERS.postgres,
      description: "MyService PostgreSQL database",
      image: DEFAULT_IMAGES.postgres,
      environment: {
        POSTGRES_PASSWORD_FILE: getSecretMountPath(dbSecretName),
        POSTGRES_USER: config.database.username,
        POSTGRES_DB: config.database.database,
        POSTGRES_INITDB_ARGS: "--data-checksums",
      },
      secrets: [createMountedSecret(dbSecretName)],
      volumes: [{ source: `${config.paths.dataDir}/postgres`, target: "/var/lib/postgresql/data" }],
      healthCheck: createPostgresHealthCheck(config.database.username, config.database.database),
      shmSize: "256m",
      noNewPrivileges: true,
      service: { restart: "always" },
    };

    const mainContainer: StackContainer = {
      name: CONTAINERS.main,
      description: "MyService main server",
      image: DEFAULT_IMAGES.main,
      requires: [CONTAINERS.redis, CONTAINERS.postgres],
      ports: [{ hostIp: networkHost, host: networkPort, container: 8080 }],
      volumes: [
        { source: `${config.paths.dataDir}/data`, target: "/data" },
      ],
      environmentFiles: [`${paths.configDir}/myservice.env`],
      secrets: [createEnvSecret(dbSecretName, "DB_PASSWORD")],
      userNs: createKeepIdNs(),
      healthCheck: createHttpHealthCheck("http://localhost:8080/health", {
        interval: duration("30s"),
        startPeriod: duration("30s"),
      }),
      noNewPrivileges: true,
      service: { restart: "always" },
    };

    const containers: readonly StackContainer[] = [redisContainer, postgresContainer, mainContainer];

    const stack = createStack({
      name: "myservice",
      network: { name: NETWORK_NAME, internal: true },
      containers: [...containers],  // Spread to mutable array for createStack
    });

    const stackFiles = generateStackQuadlets(stack, {
      envFilePath: configFilePath(paths.configDir, "myservice.env"),
      userNs: createKeepIdNs(),
      selinuxEnforcing: system.selinuxEnforcing,
    });

    return {
      quadlets: new Map(stackFiles.containers),
      networks: new Map(stackFiles.networks),
      volumes: new Map(stackFiles.volumes),
      environment: new Map([[`myservice.env`, envContent]]),
      other: new Map(),
    };
  });
```

### 9.5 Secrets Setup Step

Add this step as the first step in the multi-container pipeline (before generate):

```typescript
import type { ContainerError } from "../../lib/errors";
import {
  deletePodmanSecrets,
  ensureServiceSecretsTracked,
} from "../../system/secrets";

interface SecretsOutput {
  readonly createdSecrets: readonly string[];
}

/** Generates secrets and deletes them on rollback. */
const secretsStep: SetupStep<
  EmptyState,
  SecretsOutput,
  SystemError | GeneralError | ContainerError,
  ServicePaths | ServiceUser
> = SetupStep.resource(
  "Generating secrets...",
  (_state: EmptyState) =>
    Effect.gen(function* () {
      const paths = yield* ServicePaths;
      const user = yield* ServiceUser;

      const { createdSecrets } = yield* ensureServiceSecretsTracked(
        SERVICE_NAME,
        MYSERVICE_SECRETS,
        paths.homeDir,
        user.name,
        user.uid,
        user.gid
      );
      return { createdSecrets };
    }),
  (state, outcome): Effect.Effect<void, never, ServiceUser> =>
    Outcome.match(outcome, {
      onSuccess: (): Effect.Effect<void, never, never> => Effect.void,
      onFailure: (): Effect.Effect<void, never, ServiceUser> =>
        state.createdSecrets.length > 0
          ? Effect.gen(function* () {
              const user = yield* ServiceUser;
              yield* deletePodmanSecrets([...state.createdSecrets], user.name, user.uid);
            })
          : Effect.void,
    })
);

// The full multi-container setup pipeline:
const setup = (): Effect.Effect<
  void,
  ServiceError | SystemError | ContainerError | GeneralError,
  MyServiceConfigTag | ServicePaths | ServiceUser | SystemCapabilities
> =>
  pipeline<EmptyState>()
    .andThen(secretsStep)        // Generate podman secrets
    .andThen(generateStep)       // Generate quadlet files
    .andThen(createDirsStep)     // Create data directories
    .andThen(writeFilesStep)     // Write quadlet and env files
    .andThen(enableServicesStep) // Enable and start systemd services
    .execute(emptyState);
```

### 9.6 Multi-Container Operations

Instead of `createSingleContainerOps`, implement custom operations using stack orchestration:

```typescript
import { Array as Arr, Effect, pipe } from "effect";
import { createStack } from "../../stack";
import { getStackStatus, startStack, stopStack } from "../../stack/orchestrator";
import type { StackContainer } from "../../stack/types";

const start = (): Effect.Effect<
  void,
  ServiceError | SystemError | GeneralError,
  MyServiceConfigTag | ServiceUser
> =>
  Effect.gen(function* () {
    const config = yield* MyServiceConfigTag;
    const user = yield* ServiceUser;

    // Build minimal stack structure for orchestrator (only need name + requires)
    const baseContainers: StackContainer[] = [
      { name: CONTAINERS.redis, image: "", requires: [] },
      { name: CONTAINERS.postgres, image: "", requires: [CONTAINERS.redis] },
      { name: CONTAINERS.main, image: "", requires: [CONTAINERS.redis, CONTAINERS.postgres] },
    ];

    // Optionally add more containers based on config
    const containers = pipe(
      baseContainers,
      Arr.appendAll(config.someFeatureEnabled ? [{ name: CONTAINERS.worker, image: "" }] : [])
    );

    const stack = createStack({ name: "myservice", containers: [...containers] });
    yield* startStack(stack, { user: user.name, uid: user.uid });
  });

const stop = (): Effect.Effect<
  void,
  ServiceError | SystemError | GeneralError,
  MyServiceConfigTag | ServiceUser
> =>
  Effect.gen(function* () {
    const config = yield* MyServiceConfigTag;
    const user = yield* ServiceUser;

    // Stop in reverse dependency order
    const baseContainers: StackContainer[] = [
      { name: CONTAINERS.main, image: "", requires: [CONTAINERS.redis, CONTAINERS.postgres] },
      { name: CONTAINERS.postgres, image: "", requires: [CONTAINERS.redis] },
      { name: CONTAINERS.redis, image: "" },
    ];

    // Prepend optional containers (they stop first)
    const containers = pipe(
      baseContainers,
      Arr.prependAll(config.someFeatureEnabled ? [{ name: CONTAINERS.worker, image: "" }] : [])
    );

    const stack = createStack({ name: "myservice", containers: [...containers] });
    yield* stopStack(stack, { user: user.name, uid: user.uid });
  });

const restart = (): Effect.Effect<
  void,
  ServiceError | SystemError | GeneralError,
  MyServiceConfigTag | ServiceUser
> =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Restarting MyService...");
    yield* stop();
    yield* start();
  });
```

### 9.7 ExistentialService Pattern

Services with different config types cannot be stored in the same Map without type erasure. The `ExistentialService` wrapper solves this by hiding type parameters externally while preserving them internally.

**Pattern:** Used internally by the service registry in `src/services/index.ts`

**Implementation:**
- `mkExistentialService(service)` wraps `ServiceEffect<C, I, Tag>` hiding type parameters
- Registry stores `Map<ServiceName, ExistentialService>`
- Type safety is preserved internally, but hidden at the collection level

**When relevant:** Understanding CLI architecture and plugin patterns. This pattern implements "exists C. ServiceEffect<C, ...>" semantics, allowing heterogeneous collections of typed services.

**Location:** `src/services/types.ts` (`ExistentialService`, `mkExistentialService`)

### 9.8 Dependency Resolution and Parallelization

The stack orchestrator supports parallel container startup within dependency levels.

**StartOrder Type:**
- `levels: string[][]` - 2D array where each inner array contains containers that can start in parallel
- Example: `[["redis"], ["postgres"], ["main", "worker"]]` - main and worker start together after postgres

**Dependency Variants:**
- `requires: [...]` - Hard dependencies (container fails if dependencies fail)
- `wants: [...]` - Soft dependencies (container starts even if dependencies fail)

**Resolution:** `resolveStartOrder()` in `src/stack/orchestrator.ts` performs topological sort with cycle detection.

**Parallel Execution:** Containers at the same level start concurrently using `Effect.forEach` with `concurrency: "unbounded"`.

---

## 10. Backup and Restore

If your service has `hasBackup: true` / `hasRestore: true`, use the unified `db-backup` module.

### 10.1 Backup Strategies

divban provides three backup strategies via `src/lib/db-backup/`:

| Strategy | Config Type | Use Case | Hot Backup Safe |
|----------|-------------|----------|--------------------|
| `postgres` | `PostgresBackupConfig` | PostgreSQL via pg_dumpall | Yes |
| `sqlite-stop` | `SqliteStopBackupConfig` | SQLite with container stop | No (requires `--force`) |
| `freshrss-cli` | `FreshRssCliBackupConfig` | FreshRSS PHP CLI export | Yes |

### 10.2 Schema Integration

Add backup config to your schema (see Section 6 for full pattern):

```typescript
// REQUIRED imports for all backup strategies:
import type { SqliteStopBackupConfig } from "../../lib/db-backup";
import { type ContainerName, ContainerNameSchema, containerName } from "../../lib/types";

const {SERVICENAME}_CONTAINER = containerName("{servicename}");

/** Backup configuration input - optional since it has defaults */
export interface {ServiceName}BackupConfigInput {
  readonly type?: "sqlite-stop" | undefined;
  readonly container?: string | undefined;
  readonly sqlitePath?: string | undefined;
  readonly includeFiles?: readonly string[] | undefined;
  readonly exclude?: readonly string[] | undefined;
}

const defaultBackupConfig = (): SqliteStopBackupConfig => ({
  type: "sqlite-stop",
  container: {SERVICENAME}_CONTAINER,
  sqlitePath: "data/database.sqlite",
  includeFiles: [],
  exclude: [],
});

export const {servicename}BackupConfigSchema: Schema.Schema<
  SqliteStopBackupConfig,
  {ServiceName}BackupConfigInput
> = Schema.Struct({
  type: Schema.optionalWith(Schema.Literal("sqlite-stop"), {
    default: (): "sqlite-stop" => "sqlite-stop",
  }),
  container: Schema.optionalWith(ContainerNameSchema, {
    default: (): ContainerName => {SERVICENAME}_CONTAINER,
  }),
  sqlitePath: Schema.optionalWith(Schema.String, {
    default: (): string => "data/database.sqlite",
  }),
  includeFiles: Schema.optionalWith(Schema.Array(Schema.String), {
    default: (): readonly string[] => [],
  }),
  exclude: Schema.optionalWith(Schema.Array(Schema.String), {
    default: (): readonly string[] => [],
  }),
});

// In main config schema:
export const {servicename}ConfigSchema = Schema.Struct({
  // ... other fields
  backup: Schema.optionalWith({servicename}BackupConfigSchema, { default: defaultBackupConfig }),
});
```

### 10.3 Implementation in index.ts

Use `backupService` and `restoreService` from the unified module:

```typescript
import { backupService, restoreService } from "../../lib/db-backup";
import { ServiceOptions } from "../context";  // Provides force flag
import { wrapBackupResult } from "../helpers";
import type { BackupResult } from "../types";

const backup = (): Effect.Effect<
  BackupResult,
  BackupError | ServiceError | SystemError | GeneralError,
  {ServiceName}ConfigTag | ServiceUser | ServiceOptions
> =>
  Effect.gen(function* () {
    const config = yield* {ServiceName}ConfigTag;
    const user = yield* ServiceUser;
    const options = yield* ServiceOptions;

    return yield* wrapBackupResult(
      backupService(config.backup, {
        serviceName: definition.name,
        dataDir: config.paths.dataDir,
        user: user.name,
        uid: user.uid,
        force: options.force,
      })
    );
  });

const restore = (
  backupPath: AbsolutePath
): Effect.Effect<
  void,
  BackupError | ServiceError | SystemError | GeneralError,
  {ServiceName}ConfigTag | ServiceUser
> =>
  Effect.gen(function* () {
    const config = yield* {ServiceName}ConfigTag;
    const user = yield* ServiceUser;

    yield* restoreService(backupPath, config.backup, {
      serviceName: definition.name,
      dataDir: config.paths.dataDir,
      user: user.name,
      uid: user.uid,
    });
  });

// Add to service export:
export const {servicename}Service: ServiceEffect<{ServiceName}Config, {ServiceName}ConfigTag, typeof {ServiceName}ConfigTag> = {
  definition,
  configTag: {ServiceName}ConfigTag,
  configSchema: {servicename}ConfigSchema,
  validate,
  generate,
  setup,
  start: ops.start,
  stop: ops.stop,
  restart: ops.restart,
  status: ops.status,
  logs: ops.logs,
  backup,
  restore,
};

// Update capabilities in definition:
const definition: ServiceDefinition = {
  name: SERVICE_NAME,
  description: "...",
  version: "0.1.0",
  capabilities: {
    multiContainer: false,
    hasReload: false,
    hasBackup: true,
    hasRestore: true,
    hardwareAcceleration: false,
  },
};
```

### 10.4 Strategy Selection Guide

**Use `postgres`** when:
- Service uses PostgreSQL database
- Hot backup is required (no downtime)
- Example: Immich

**Use `sqlite-stop`** when:
- Service uses SQLite database
- Service must be stopped for consistent backup
- Requires `--force` flag from user
- Example: Actual Budget

**Use `freshrss-cli`** when:
- Service provides its own CLI backup command
- Hot backup is safe via application logic
- Example: FreshRSS (uses PHP CLI export)

### 10.5 Archive Metadata

All backups include `divban.backup.metadata.json` with versioning fields:

```json
{
  "schemaVersion": "1.0.0",
  "producer": "divban",
  "producerVersion": "0.5.5",
  "service": "actual",
  "timestamp": "2026-01-24T12:00:00.000Z",
  "files": ["database.sql"]
}
```

On restore, divban validates:
- `producer` must be `"divban"`
- `service` must match the restoring service
- `schemaVersion` must be supported
- `producerVersion` may warn if newer than current

---

## 11. Branded Types Reference

divban uses a comprehensive branded type system to prevent bugs at compile time. **Never use raw strings/numbers for domain values.**

### 11.1 Available Branded Types

| Type | Base | Validation | Constructor |
|------|------|------------|-------------|
| `UserId` | `number` | 0-65534, integer | `decodeUserId()` |
| `GroupId` | `number` | 0-65534, integer | `decodeGroupId()` |
| `SubordinateId` | `number` | 100000-4294967294 | `decodeSubordinateId()` |
| `AbsolutePath` | `string` | Starts with `/` | `path()`, `decodeAbsolutePath()` |
| `Username` | `string` | `[a-z_][a-z0-9_-]*`, max 32 | `username()`, `decodeUsername()` |
| `ServiceName` | `string` | `[a-z][a-z0-9-]*` | `serviceName()`, `decodeServiceName()` |
| `ContainerName` | `string` | `[a-zA-Z0-9][a-zA-Z0-9_.-]*` | `containerName()`, `decodeContainerName()` |
| `NetworkName` | `string` | Same as ContainerName | `networkName()`, `decodeNetworkName()` |
| `VolumeName` | `string` | Same as ContainerName | `volumeName()`, `decodeVolumeName()` |
| `ContainerImage` | `string` | Valid image reference | `containerImage()`, `decodeContainerImage()` |
| `DurationString` | `string` | `{number}{ms\|s\|m\|h\|d}` | `duration()`, `decodeDurationString()` |
| `PrivateIP` | `string` | RFC 1918 IPv4 / RFC 4193 IPv6 | `decodePrivateIP()` |
| `DatabaseName` | `string` | Valid database identifier | `databaseName()`, `decodeDatabaseName()` |
| `DatabaseUser` | `string` | Valid database username | `databaseUser()`, `decodeDatabaseUser()` |

### 11.2 Literal Constructors vs Decoders

**Literal constructors** (for compile-time known values):
```typescript
import { serviceName, containerName, containerImage, path, duration } from "../../lib/types";

const SERVICE_NAME = serviceName("actual");           // ServiceName
const CONTAINER_NAME = containerName("actual");       // ContainerName
const IMAGE = containerImage("docker.io/org/img:v1"); // ContainerImage
const DATA_DIR = path("/srv/divban-actual");          // AbsolutePath
const INTERVAL = duration("30s");                     // DurationString
```

**Decoders** (for runtime/user input):
```typescript
import { decodeAbsolutePath, parseErrorToGeneralError } from "../../lib/types";

// In Effect.gen:
const dataDir = yield* decodeAbsolutePath(userInput).pipe(
  Effect.mapError(parseErrorToGeneralError)
);
```

### 11.3 Path Utilities

```typescript
import { path, pathJoin, pathWithSuffix } from "../../lib/types";

// Compile-time validated literal
const dataDir = path("/srv/data");

// Type-preserving join (result is AbsolutePath)
const configDir = pathJoin(dataDir, "config");
const deepPath = pathJoin(dataDir, "a", "b", "c.txt");

// Type-preserving suffix (result is AbsolutePath)
const backup = pathWithSuffix(dataDir, ".bak");
```

### 11.4 Conversion Functions

```typescript
import { userIdToGroupId, serviceNameToContainerName } from "../../lib/types";

const gid = userIdToGroupId(uid);                    // UserId → GroupId
const container = serviceNameToContainerName(name);  // ServiceName → ContainerName
```

### 11.5 Schema Re-exports

For service schemas, import from `../../config/schema`:

```typescript
import { absolutePathSchema, containerImageSchema } from "../../config/schema";
```

For backup schemas that need `ContainerNameSchema`:

```typescript
import { ContainerNameSchema } from "../../lib/types";
```

### 11.6 Configuration Enum Values

For consistent enum values across schemas, import from `src/config/field-values.ts`:

**Available enum constants:**
- `LOG_LEVEL_VALUES` - `["debug", "info", "warn", "error"]`
- `LOG_LEVEL_DEFAULT` - `"info"`
- `NETWORK_MODE_VALUES` - `["pasta", "slirp4netns", "host", "none"]`
- `SERVICE_RESTART_VALUES` - `["no", "on-success", "on-failure", "on-abnormal", "on-abort", "always"]`
- `AUTO_UPDATE_STRING_VALUES` - `["registry", "local"]`
- `PROTOCOL_VALUES` - `["tcp", "udp"]`

**Usage in schemas:**

```typescript
import { LOG_LEVEL_VALUES, LOG_LEVEL_DEFAULT } from "../../config/field-values";

logLevel: Schema.optionalWith(Schema.Literal(...LOG_LEVEL_VALUES), {
  default: (): "info" => LOG_LEVEL_DEFAULT,
})
```

**Benefits:**
- Single source of truth for enum values
- Consistent across all services
- Easier to maintain and extend

---

## 12. Coding Standards

These are **non-negotiable** requirements from `CLAUDE.md`. Code that violates these will fail CI.

### 12.1 No Loops

Use functional alternatives:

```typescript
// BAD
for (const item of items) { results.push(transform(item)); }

// GOOD
const results = Arr.map(items, transform);

// With Effect:
yield* Effect.forEach(items, (item) => transformEffect(item), { concurrency: 1 });
```

### 12.2 No Conditionals

Use pattern matching:

```typescript
// BAD
if (config.enabled) { return doA(); } else { return doB(); }

// GOOD
return Match.value(config.enabled).pipe(
  Match.when(true, () => doA()),
  Match.when(false, () => doB()),
  Match.exhaustive
);

// Or for Option:
return Option.match(maybeValue, {
  onNone: () => defaultValue,
  onSome: (value) => transformValue(value),
});
```

### 12.3 No RegExp

Use character predicates from `src/lib/char.ts`:
- `isLower`, `isUpper`, `isDigit`, `isAlphaNum`, etc.
- Compose with `all`/`any` from `src/lib/str.ts`

### 12.4 Branded Types Required

Never use raw strings/numbers for domain values. See Section 11.

### 12.5 Immutable Data

All interfaces use `readonly`:
- `readonly` on all interface properties
- `ReadonlyMap`, `ReadonlyArray` for collections

### 12.6 Effect Patterns

**Context access:**
```typescript
const config = yield* MyServiceConfigTag;
const user = yield* ServiceUser;
```

**Error handling:**
```typescript
yield* pipe(
  Effect.succeed(result),
  Effect.filterOrFail(
    (r) => r.exitCode === 0,
    (r) => new ServiceError({ ... })
  )
);
```

**Resource cleanup:**
```typescript
SetupStep.resource(
  "Description...",
  (state) => acquireEffect,
  (state, outcome) => Outcome.match(outcome, {
    onSuccess: () => Effect.void,
    onFailure: () => cleanupEffect,
  })
);
```

### 12.7 Logging Patterns

**Effect's built-in logging:**
- Use `Effect.logInfo()`, `Effect.logError()`, `Effect.logDebug()` for inline logging within Effect chains
- Import `logSuccess()`, `logFail()`, `logStep()` from `src/lib/log.ts` for CLI output formatting

**Operation tracing:**
- Wrap operations with `withOperationLogging(displayName, verb, effect)` from `src/lib/traced.ts`
- Automatically logs entry/exit and duration via `Effect.withLogSpan`

**Step counters:**
- Use `createStepCounter(total)` from `src/lib/traced.ts` for concurrent progress tracking
- Thread-safe via `SynchronizedRef`

**Never:**
- Don't add AppLogger to service context requirements
- Don't create custom logger abstractions
- AppLogger has been removed from the codebase

### 12.8 String Escaping

**Use escape codecs from `src/lib/escape-codec.ts`:**
- `quoteEscapeCodec` - For Caddyfile and INI file quotes (escapes `"` and `\`)
- `envEscapeCodec` - For shell-sensitive characters in environment files

**Pattern:**
```typescript
import { quoteEscapeCodec, envEscapeCodec } from "../../lib/escape-codec";

// Escape user input for use in quoted strings
const escaped = quoteEscapeCodec.escape(userInput);

// Unescape back to original
const original = quoteEscapeCodec.unescape(escaped);
```

**Guarantees:**
- Codecs are bidirectional: `unescape(escape(s)) === s`
- Round-trip identity is guaranteed
- Character-level validation ensures correctness

**Never:**
- Don't use inline escape maps or manual string replacement
- Don't use RegExp for escaping (violates coding standards)

---

## 13. Verification

### 13.1 Required Checks

```bash
# Full CI (MUST PASS)
just ci

# Individual checks
just fmt      # Format code
just lint     # Run linter
just test     # Run tests
```

### 13.2 Spelling

If cspell fails on technical terms, add them alphabetically to `project-words.txt`.

**Never:**
- Add linter ignore comments
- Disable rules
- Loosen tsconfig settings

### 13.3 Manual Testing

```bash
# Validate config
just dev {servicename} validate examples/divban-{servicename}.toml

# Dry-run generate
just dev {servicename} generate examples/divban-{servicename}.toml --dry-run

# Check help
just dev --help
```

---

## 14. Reference Tables

### Docker-Compose to divban Mapping

| Docker-Compose | divban |
|----------------|--------|
| `image:` | `config.container.image` |
| `ports: ["8080:80"]` | `ports: [{ hostIp: host, host: 8080, container: 80 }]` |
| `volumes: ["/host:/container"]` | `volumes: [{ source: "/host", target: "/container" }]` |
| Named volume | Bind mount to `dataDir` subdirectory |
| `environment:` | Config schema fields or environment map |
| `environment: PASSWORD=...` | Auto-generated podman secrets |
| `depends_on:` | `requires: [...]` in container config |
| `restart: unless-stopped` | `service: { restart: "always" }` |
| `healthcheck:` | `healthCheck: createHttpHealthCheck(...)` |
| `cap_add/cap_drop` | `capAdd: [...], capDrop: [...]` |
| `security_opt: [no-new-privileges]` | `noNewPrivileges: true` |
| `read_only: true` | `readOnlyRootfs: true` |

### Health Check Patterns

```typescript
import { duration } from "../../lib/types";
import {
  createHealthCheck,
  createHttpHealthCheck,
  createPostgresHealthCheck,
  createRedisHealthCheck,
} from "../../quadlet";

// HTTP (most common)
createHttpHealthCheck("http://localhost:8080/health", {
  interval: duration("30s"),
  startPeriod: duration("10s"),
})

// PostgreSQL
createPostgresHealthCheck(username, database)

// Redis
createRedisHealthCheck()

// Custom command
createHealthCheck("curl -sf http://localhost/", {
  interval: duration("30s"),
  timeout: duration("5s"),
  retries: 3,
  startPeriod: duration("30s"),
})
```

### Volume Patterns

```typescript
import { relabelVolumes } from "../../quadlet";

// Bind mount (most common - use dataDir)
{ source: config.paths.dataDir, target: "/data" }

// Subdirectory bind mount (use pathJoin for AbsolutePath preservation)
{ source: pathJoin(config.paths.dataDir, "config"), target: "/config" }

// Read-only
{ source: "/etc/config", target: "/config", readOnly: true }

// With SELinux handling
relabelVolumes([{ source: path, target: "/data" }], system.selinuxEnforcing)
```

### Port Patterns

```typescript
// Localhost only (secure - default choice)
{ hostIp: "127.0.0.1", host: 8080, container: 8080 }

// All interfaces (use with caution)
{ host: 8080, container: 8080 }

// UDP
{ host: 53, container: 53, protocol: "udp" }
```

### Secret Patterns

```typescript
import {
  createMountedSecret,
  createEnvSecret,
  getSecretMountPath,
} from "../../quadlet";

// As mounted file (preferred for *_FILE env vars)
createMountedSecret("db-password")  // → /run/secrets/db-password

// As environment variable
createEnvSecret("db-password", "DATABASE_PASSWORD")

// Get mount path for environment var
getSecretMountPath("db-password")  // → "/run/secrets/db-password"
```

### Backup Strategy Types

| Strategy | Config Type | Import From | Requires Force | Additional Imports |
|----------|-------------|-------------|----------------|--------------------|
| `postgres` | `PostgresBackupConfig` | `../../lib/db-backup` | No | `ContainerNameSchema` (required) |
| `sqlite-stop` | `SqliteStopBackupConfig` | `../../lib/db-backup` | Yes | `ContainerNameSchema` (required) |
| `freshrss-cli` | `FreshRssCliBackupConfig` | `../../lib/db-backup` | No | `ContainerNameSchema` (required) |

---

## 15. Quick Debugging

**Type errors in setup steps:** Check that state types accumulate correctly (`EmptyState & GenerateOutput & CreateDirsOutput & ...`)

**Context not found errors:** Ensure all context tags used in `yield*` are declared in the R type parameter

**Service not found in CLI:** Check registration in `src/services/index.ts`

**Spelling errors in CI:** Add technical terms to `project-words.txt` alphabetically

**ServicePaths type error:** Use `type ServicePaths` in import, not value import

**Backup not working:** Ensure `ServiceOptions` is in the R type parameter of `backup()` - it provides the `force` flag

**"Invalid backup" on restore:** Check that `divban.backup.metadata.json` exists in backup archive and contains valid `producer`, `service`, `schemaVersion`, and `producerVersion` fields

**Config validation fails on version:** Ensure `divbanConfigSchemaVersion = "1.0.0"` is placed immediately after the TOML header comment block

**Branded type error:** Use literal constructors (`serviceName()`, `containerName()`, etc.) for hardcoded values, decoders (`decodeServiceName()`, etc.) for user input

**pathJoin losing AbsolutePath:** Ensure base argument is `AbsolutePath` (not `string`) to preserve the brand

**Logger/AppLogger errors:** Remove AppLogger from context requirements - it no longer exists. Use `Effect.logInfo()` or import from `src/lib/log.ts` instead

**Escape codec errors:** Import from `src/lib/escape-codec.ts`, use `.escape()`/`.unescape()` methods. Don't use inline escape maps or RegExp

**Enum literal errors:** Import enum values from `src/config/field-values.ts` instead of hardcoding literals (e.g., use `LOG_LEVEL_VALUES` instead of `["debug", "info", "warn", "error"]`)

---

## Checklist

Before submitting, verify:

- [ ] Reviewed docker-compose and determined service type
- [ ] Created `examples/divban-{servicename}.toml` with all configurable options
- [ ] TOML starts with `divbanConfigSchemaVersion = "1.0.0"` after header
- [ ] Created `src/services/{servicename}/config.ts` - Context.Tag defined correctly
- [ ] Created `src/services/{servicename}/schema.ts` - Effect Schema with Input/Output interfaces
- [ ] Schema includes `divbanConfigSchemaVersion: DivbanConfigSchemaVersionSchema`
- [ ] Created `src/services/{servicename}/index.ts` - ServiceEffect implementation
- [ ] (If multi-container) Created `constants.ts` and `secrets.ts`
- [ ] (If backup) Schema includes backup config with defaults (see Section 10.2)
- [ ] (If backup) index.ts imports `backupService`/`restoreService` from `../../lib/db-backup`
- [ ] (If backup) `backup()` includes `ServiceOptions` in R type parameter
- [ ] Service registered in `src/services/index.ts`
- [ ] `just ci` passes with no errors or warnings
- [ ] No loops, conditionals, or RegExp in code
- [ ] All domain values use branded types with proper constructors
- [ ] All interfaces are `readonly`
- [ ] Full registry prefixes on container images (`docker.io/`, `ghcr.io/`, etc.)
- [ ] Included `logLevel` in schema using `LOG_LEVEL_VALUES` from `field-values.ts` (or inline literals)
- [ ] Used `as const` for constants objects (CONTAINERS, DEFAULT_IMAGES, INTERNAL_URLS, etc.)
- [ ] Used branded type constructors (`serviceName()`, `containerName()`, etc.) not raw strings
- [ ] (If backup) Imported `ContainerNameSchema` from `../../lib/types`
- [ ] Removed AppLogger from all context requirements (setup, backup, restore, operations)
- [ ] Used escape codecs from `escape-codec.ts` instead of inline escape maps
