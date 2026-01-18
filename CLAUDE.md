# divban

CLI for managing rootless Podman services with systemd Quadlet integration. Built with Bun and TypeScript.

## Purpose

Declarative TOML-based configuration for containerised services. Each service runs as a dedicated system user with isolated UID namespaces, managed through systemd user sessions.

## Key Directories

- `src/cli/` - Command-line interface and argument parsing
- `src/config/` - TOML configuration loading and Zod validation
- `src/services/` - Service implementations (caddy, immich, actual)
- `src/quadlet/` - Quadlet file generation for systemd
- `src/stack/` - Multi-container orchestration
- `src/system/` - System operations (exec, user management, systemctl)
- `src/lib/` - Shared utilities (Result type, errors, logging, branded types)

## Commands

- `just dev <service> <command> [config]` - Run in development mode
- `just test` - Run test suite
- `just ci` - Full CI: format check, lint, typecheck, test
- `just build` - Build native binary
- `just lint` - Run Biome linter
- `just fmt` - Format code with Biome

## Architecture

**Error Handling:** Uses Rust-inspired `Result<T, E>` type from `src/lib/result.ts`. No exceptions - all errors are typed and returned.

**Type Safety:** Branded types in `src/lib/types.ts` prevent mixing incompatible values (UserId, Username, AbsolutePath, etc.).

**Service Pattern:** All services implement a common interface with lifecycle methods (validate, generate, setup) and runtime methods (start, stop, restart, status, logs).

**Error Codes:** Organised exit codes in `src/lib/errors.ts` - General (0-9), Config (10-19), System (20-29), Service (30-39), Container (40-49), Backup (50-59).

## Verification

Run `just ci` before committing - it runs format check, linting, typechecking, and tests.

## References

- `README.md` - Usage documentation and supported services
- `examples/` - Example TOML configurations
- `justfile` - All available development commands
