# divban

CLI for managing rootless Podman services with systemd Quadlet integration. Built with Bun, TypeScript, and Effect.

## Purpose

Declarative TOML-based configuration for containerised services. Each service runs as a dedicated system user with isolated UID namespaces, managed through systemd user sessions.

## Key Directories

- `src/cli/` - Command-line interface and argument parsing
- `src/config/` - TOML configuration loading and Effect Schema validation
- `src/services/` - Service implementations (caddy, immich, actual)
- `src/services/helpers.ts` - Shared service utilities and tracked resource operations
- `src/quadlet/` - Quadlet file generation for systemd
- `src/stack/` - Multi-container orchestration
- `src/system/` - System operations (exec, user management, systemctl, directories, secrets)
- `src/lib/` - Shared utilities (errors, logging, branded types)

## Commands

- `just dev <service> <command> [config]` - Run in development mode
- `just test` - Run test suite
- `just ci` - Full CI: format check, lint, typecheck, test
- `just build` - Build native binary
- `just lint` - Run Biome linter
- `just fmt` - Format code with Biome

## Architecture

**Effect-based:** All operations use Effect for typed errors, resource management, and composition. Functions return `Effect.Effect<A, E>` rather than throwing exceptions.

**Resource Management:** Setup operations use `Effect.acquireRelease` with tracked functions for idempotent rollback. The `Acquired<A>` pattern tracks whether resources were created (for conditional rollback) or already existed.

**Tracked Operations:** Functions like `ensureDirectoriesTracked`, `writeGeneratedFilesTracked`, `reloadAndEnableServicesTracked` return metadata about what was created/modified, enabling precise rollback on failure.

**Type Safety:** Branded types in `src/lib/types.ts` prevent mixing incompatible values (UserId, Username, AbsolutePath, etc.).

**Service Pattern:** All services implement `ServiceEffect<C>` with lifecycle methods (validate, generate, setup) and runtime methods (start, stop, restart, status, logs). Setup uses `SetupStep<StateIn, Output, E, R>` with fixed-arity pipelines (`executeSteps3/4/5`) for type-safe composition with automatic rollback.

**Error Codes:** Organised exit codes in `src/lib/errors.ts` - General (0-9), Config (10-19), System (20-29), Service (30-39), Container (40-49), Backup (50-59).

## Key Patterns

**Setup Flow:** `setup.ts` orchestrates service setup using `Effect.scoped` with nested `acquireRelease` calls for user creation, linger enablement, directory creation, config copying, and service-specific setup.

**Service Setup Steps:** Each service defines setup steps as `SetupStep<StateIn, Output, E, R>` with acquire/release pairs. State accumulates via intersection types (`EmptyState & A & B & C`). The `executeSteps3/4/5` functions run steps sequentially with per-step progress logging, calling release functions in reverse order on failure using the `Outcome` sum type.

**File Write Tracking:** `FileWriteResult` discriminated union tracks whether files were `Created` (delete on rollback) or `Modified` (restore from `.bak` backup on rollback, delete backup on success).

## Verification

Run `just ci` before committing - it runs format check, linting, typechecking, and tests.

## References

- `README.md` - Usage documentation and supported services
- `examples/` - Example TOML configurations
- `justfile` - All available development commands
