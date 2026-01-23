# Comment Catalogue

This document catalogues comments that need rewriting because they describe **what** code does instead of **why**.

## Criteria

**Flag comments that:**
- Describe what code does (redundant with code)
- Restate function/variable names
- Lack "why" context

**Good comments explain:**
- Business rationale
- Non-obvious constraints
- Workarounds for external issues
- Edge case reasoning

---

## Batch 1

### `src/cli/commands/backup-config.ts` ✅

**Line 50:** `/** File entry: archive path and content */`
- Issue: Type alias comment restates the type definition without explaining purpose or usage context

**Line 57-59:** `/** Read a file if it exists, returning the entry or null. */`
- Issue: Restates function name and return type; doesn't explain why null is returned vs throwing

**Line 72-74:** `/** Collect config files for a single service. */`
- Issue: Restates function name; doesn't explain which files or why these specific ones

**Line 94-96:** `/** Read a file and return as a FileEntry. */`
- Issue: Restates function signature

**Line 103-105:** `/** Scan directory with glob pattern, reading all matching files. */`
- Issue: Describes what parameters do; doesn't explain use case

**Line 115:** `// Read all files in parallel`
- Issue: Describes what `Effect.all` with `concurrency: "unbounded"` does

**Line 128-130:** `/** Collect all config files (for "all" service). */`
- Issue: Restates function name

**Line 154-156:** `/** Get config directory for a service by looking up its system user. */`
- Issue: Restates function name and implementation approach

**Line 197-199:** `/** Find first valid config directory from known services. */`
- Issue: Restates function name

**Line 224-226:** `/** Resolve config directory based on service (single or "all"). */`
- Issue: Restates function name

**Line 236-238:** `/** Build archive output path and ensure directory exists. */`
- Issue: Restates function name

**Line 249:** `// Generate timestamped default path`
- Issue: Describes what the following code does

**Line 263-265:** `/** Execute backup-config command. */`
- Issue: Restates function name

---

### `src/cli/commands/backup.ts` ✅

**Line 37-39:** `/** Execute the backup command. */`
- Issue: Restates function name

---

### `src/cli/commands/diff.ts` ✅

**Line 53-55:** `/** Execute the diff command. */`
- Issue: Restates function name

**Line 121:** `// Build user info for layer`
- Issue: Describes what the following code does

**Line 167:** `// Generate files`
- Issue: Describes what the method call does

**Line 172:** `// Collect all file entries`
- Issue: Describes what the following code does

**Line 196:** `// Compute all diffs`
- Issue: Describes what the following code does

**Line 207:** `// Partition diffs by status`
- Issue: Describes what the filter calls do

**Line 262:** `// Summary`
- Issue: Single-word label describing what follows

**Line 281-283:** `/** Compare a file with new content. */`
- Issue: Restates function name

**Line 309:** `// Generate simple line diff`
- Issue: Describes what the function call does

**Line 322-324:** `/** Generate a simple unified diff. */`
- Issue: Restates function name

---

### `src/cli/commands/generate.ts` ✅

**Line 39-41:** `/** Execute the generate command. */`
- Issue: Restates function name

**Line 69:** `// Access service methods with proper config typing`
- Issue: Describes what the code does

**Line 94:** `// Generate files`
- Issue: Describes what the method call does

---

### `src/cli/commands/logs.ts` ✅

**Line 36-38:** `/** Execute the logs command. */`
- Issue: Restates function name

**Line 43:** `// Resolve prerequisites without config`
- Issue: Describes what the function call does

**Line 46:** `// Access service methods with proper config typing`
- Issue: Describes what the code does

**Line 64:** `// Use empty config if not found`
- Issue: Describes what the code does

**Line 72:** `// Update paths with config dataDir if available`
- Issue: Describes what the code does

---

## Batch 2

### ✅ `src/cli/commands/reload.ts`

**Line 36-38:** `/** Execute the reload command. */`
- Issue: Restates function name

**Line 43:** `// Check if service supports reload`
- Issue: Describes what the condition checks

**Line 66:** `// Resolve prerequisites without config`
- Issue: Describes what the function call does

**Line 69:** `// Access service methods with proper config typing`
- Issue: Describes what the code does

**Line 72:** `// Load config with typed schema (optional for reload)`
- Issue: Describes what the code does

**Line 91:** `// Use empty config if not found`
- Issue: Describes what the code does

**Line 99:** `// Update paths with config dataDir if available`
- Issue: Describes what the code does

---

### ✅ `src/cli/commands/remove.ts`

**Line 8-10:** `/** remove command - completely remove a service. */`
- Issue: Restates module/function purpose evident from filename and context

**Line 32-34:** `/** Execute the remove command. */`
- Issue: Restates function name

**Line 42:** `// Require root`
- Issue: Describes what the function call does

**Line 45:** `// Get service username`
- Issue: Describes what the function call does

**Line 48:** `// Check if user exists`
- Issue: Describes what the condition checks

**Line 54:** `// Get data directory`
- Issue: Describes what the function call does

**Line 60:** `// Dry-run mode`
- Issue: Describes what the condition checks

**Line 78:** `// Require --force`
- Issue: Describes what the condition checks

**Line 145-147:** `/** Stop the systemd user service for a user. */`
- Issue: Restates function name

**Line 159-161:** `/** Clean up all podman resources for a user. */`
- Issue: Restates function name

**Line 167:** `// Remove all containers`
- Issue: Describes what the command does

**Line 175:** `// Remove all volumes`
- Issue: Describes what the command does

**Line 219-221:** `/** Remove all container storage for a user. */`
- Issue: Restates function name

**Line 242-244:** `/** Kill all processes belonging to a user. */`
- Issue: Restates function name

**Line 257:** `// Force kill any remaining processes with SIGKILL`
- Issue: Describes what the command does

---

### ✅ `src/cli/commands/restart.ts`

**Line 36-38:** `/** Execute the restart command. */`
- Issue: Restates function name

**Line 43:** `// Resolve prerequisites without config`
- Issue: Describes what the function call does

**Line 46:** `// Access service methods with proper config typing`
- Issue: Describes what the code does

**Line 49:** `// Load config with typed schema (optional for restart)`
- Issue: Describes what the code does

**Line 64:** `// Use empty config if not found`
- Issue: Describes what the code does

**Line 72:** `// Update paths with config dataDir if available`
- Issue: Describes what the code does

---

### ✅ `src/cli/commands/restore.ts`

**Line 43-45:** `/** Context for restore operations. */`
- Issue: Restates interface name

**Line 52-54:** `/** Validate that service supports restore capability. */`
- Issue: Restates function name

**Line 72-74:** `/** Handle dry run mode for restore. */`
- Issue: Restates function name

**Line 80-82:** `/** Handle missing force flag for restore. */`
- Issue: Restates function name

**Line 94-96:** `/** Validate backup path and force flag for non-dry-run case. */`
- Issue: Restates function name

**Line 109-111:** `/** Process backup path based on dryRun flag. */`
- Issue: Restates function name

**Line 151-153:** `/** Format restore result based on output format. */`
- Issue: Restates function name

**Line 173-175:** `/** Load config for restore (optional). */`
- Issue: Restates function name

**Line 195-197:** `/** Build config and paths from config result. */`
- Issue: Restates function name

**Line 222-224:** `/** Perform the actual restore operation. */`
- Issue: Restates function name

**Line 268-270:** `/** Execute the restore command (main entry point). */`
- Issue: Restates function name

---

### ✅ `src/cli/commands/secret.ts`

**Line 57-59:** `/** Show a specific secret value. */`
- Issue: Restates function name

**Line 80:** `// Get service user`
- Issue: Describes what the function call does

**Line 99:** `// Get secret`
- Issue: Describes what the function call does

**Line 110-112:** `/** List all available secrets for a service. */`
- Issue: Restates function name

**Line 120:** `// Get service user`
- Issue: Describes what the function call does

**Line 139:** `// List secrets`
- Issue: Describes what the function call does

---

## Batch 3

### `src/cli/commands/setup.ts` ✅

**Line 54-56:** `/** Execute the setup command. */`
- Issue: Restates function name

**Line 62:** `// Get UID allocation settings from global config`
- Issue: Describes what the function call does

**Line 76:** `// Validate path first`
- Issue: Describes what the following code does

**Line 79:** `// Get service username`
- Issue: Describes what the function call does

**Line 123:** `// Check if user already exists`
- Issue: Describes what the code checks

**Line 155:** `// Access service methods with proper config typing`
- Issue: Describes what the code does

**Line 158:** `// Load and validate config with typed schema`
- Issue: Describes what the function call does

**Line 241:** `// Build service layer`
- Issue: Describes what the following code does

---

### `src/cli/commands/start.ts` ✅

**Line 36-38:** `/** Execute the start command. */`
- Issue: Restates function name

**Line 43:** `// Resolve prerequisites without config`
- Issue: Describes what the function call does

**Line 46:** `// Access service methods with proper config typing`
- Issue: Describes what the code does

**Line 49:** `// Load config with typed schema (optional for start)`
- Issue: Describes what the code does

**Line 64:** `// Use empty config if not found`
- Issue: Describes what the code does

**Line 72:** `// Update paths with config dataDir if available`
- Issue: Describes what the code does

---

### `src/cli/commands/status.ts` ✅

**Line 38-40:** `/** Execute the status command. */`
- Issue: Restates function name

**Line 45:** `// Get service user - check if configured first`
- Issue: Describes what the code does

**Line 75:** `// Resolve prerequisites without config`
- Issue: Describes what the function call does

**Line 78:** `// Access service methods with proper config typing`
- Issue: Describes what the code does

**Line 81:** `// Load config with typed schema (optional for status)`
- Issue: Describes what the code does

**Line 96:** `// Use empty config if not found`
- Issue: Describes what the code does

**Line 104:** `// Update paths with config dataDir if available`
- Issue: Describes what the code does

---

### `src/cli/commands/stop.ts` ✅

**Line 36-38:** `/** Execute the stop command. */`
- Issue: Restates function name

**Line 43:** `// Resolve prerequisites without config`
- Issue: Describes what the function call does

**Line 46:** `// Access service methods with proper config typing`
- Issue: Describes what the code does

**Line 49:** `// Load config with typed schema (optional for stop)`
- Issue: Describes what the code does

**Line 64:** `// Use empty config if not found`
- Issue: Describes what the code does

**Line 72:** `// Update paths with config dataDir if available`
- Issue: Describes what the code does

---

### `src/cli/commands/update.ts` ✅

**Line 31-33:** `/** Context for update operations. */`
- Issue: Restates interface name

**Line 41-43:** `/** Discriminated union for update status. */`
- Issue: Describes what the type is (evident from the type definition)

**Line 49:** `/** Update status: no updates available */`
- Issue: Restates the constant name

**Line 51:** `/** Update status: updates are available */`
- Issue: Restates the constant name

**Line 53:** `/** Update status: all images up to date */`
- Issue: Restates the constant name

**Line 56-58:** `/** Resolve service user or fail with appropriate error. */`
- Issue: Restates function name

**Line 80-82:** `/** Build podman auto-update command arguments. */`
- Issue: Restates function name

**Line 99-101:** `/** Check for available updates using podman auto-update --dry-run. */`
- Issue: Restates function name and implementation detail

**Line 120-122:** `/** Apply updates using podman auto-update. */`
- Issue: Restates function name

**Line 154-156:** `/** Parse update check output into discriminated union. */`
- Issue: Restates function name and return type

**Line 171-173:** `/** Handle the update check result. */`
- Issue: Restates function name

**Line 196-198:** `/** Handle dry run mode. */`
- Issue: Restates function name

**Line 202-204:** `/** Perform the actual update check and apply. */`
- Issue: Restates function name

**Line 212-214:** `/** Execute the update command (main entry point). */`
- Issue: Restates function name

---

## Batch 4

### `src/cli/commands/utils.ts`

**Line 53-55:** `/** Extract context options from parsed args. */`
- Issue: Restates function name

**Line 78-80:** `/** Try to load config from a single path with typed schema. */`
- Issue: Restates function name

**Line 131-133:** `/** Format duration for display. */`
- Issue: Restates function name

**Line 146-148:** `/** Format bytes for display. */`
- Issue: Restates function name

**Line 162-164:** `/** Interface for configs that may have a paths.dataDir property. */`
- Issue: Restates interface purpose evident from name and properties

**Line 169-171:** `/** Type guard to check if config has paths.dataDir property. */`
- Issue: Restates function name

**Line 205:** `/** State for width-bounded truncation */`
- Issue: Restates type alias name

**Line 208:** `/** Step function: accumulate chars while under width limit */`
- Issue: Describes what the function does

**Line 248-250:** `/** Resolved service user information. */`
- Issue: Restates interface name

**Line 258-261:** `/** Resolve service user from system. Returns error if user doesn't exist. */`
- Issue: Restates function name and error behavior evident from return type

**Line 308-310:** `/** Build service paths from home directory and optional data dir override. */`
- Issue: Restates function signature

**Line 347-349:** `/** Create a Layer from resolved prerequisites and a service config tag. */`
- Issue: Restates function signature

---

### `src/cli/commands/validate.ts`

**Line 28-30:** `/** Execute the validate command. */`
- Issue: Restates function name

---

### `src/cli/help.ts`

**Line 19-21:** `/** Main help text. */`
- Issue: Restates function name

**Line 90-92:** `/** Get help for a specific service. */`
- Issue: Restates function name

**Line 153-155:** `/** Get help for a specific command. */`
- Issue: Restates function name

**Line 319-321:** `/** Print version information. */`
- Issue: Restates function name

---

### `src/cli/index.ts`

**Line 36:** `// Import Effect-based command handlers`
- Issue: Describes what the imports are

**Line 70:** `// Initialize services registry inside Effect`
- Issue: Describes what the code does

**Line 73:** `// Parse arguments`
- Issue: Describes what the function call does

**Line 76:** `// Handle version flag early`
- Issue: Describes what the code does

**Line 83-84:** `// Validate global config path if provided`
- Issue: Describes what the code does

**Line 90:** `// Load global configuration (always loads, returns defaults if no file)`
- Issue: Describes what the function call does

**Line 107:** `// Create logger with effective settings`
- Issue: Describes what the code does

**Line 113:** `// Handle help`
- Issue: Describes what the code does

**Line 123:** `// Handle "all" service (run command on all services)`
- Issue: Describes what the code does

**Line 128:** `// Get the service`
- Issue: Describes what the function call does

**Line 131:** `// Validate arguments for specific command`
- Issue: Describes what the function call does

**Line 134:** `// Execute command`
- Issue: Describes what the function call does

**Line 193-195:** `/** Run command on single service, returning Option<errorCode> for first-error tracking. */`
- Issue: Restates function signature

**Line 226-228:** `/** Allowed commands for "all" target. */`
- Issue: Restates constant name

**Line 244-246:** `/** Validate command is allowed for "all" target. */`
- Issue: Restates function name

**Line 257-259:** `/** Run command on each service, collecting first error if any. */`
- Issue: Restates function name

**Line 275:** `// Effect.reduce: effectful fold accumulating first error as Option`
- Issue: Describes what the Effect function call does

**Line 292:** `// Re-export for testing`
- Issue: Describes what the exports are for

---

### `src/cli/parser.ts`

**Line 20-22:** `/** Available commands. */`
- Issue: Restates constant name

**Line 45-47:** `/** Parsed command line arguments. */`
- Issue: Restates interface name

**Line 70-72:** `/** Default parsed arguments. */`
- Issue: Restates constant name

**Line 88-91:** `/** Type guard for Command. */`
- Issue: Restates function name

**Line 93-95:** `/** Parse options for nodeParseArgs. */`
- Issue: Restates constant name

**Line 113-115:** `/** Node parseArgs result type. */`
- Issue: Restates type alias name

**Line 148-150:** `/** Extract service from first positional. */`
- Issue: Restates function name

**Line 157-160:** `/** Parse command from second positional. Returns Effect to handle invalid command error. */`
- Issue: Restates function name and return type

**Line 175-177:** `/** Get maximum positionals for command using Match (exhaustive). */`
- Issue: Restates function name and implementation detail

**Line 191-193:** `/** Validate no extra positional arguments. */`
- Issue: Restates function name

**Line 210-212:** `/** Extract boolean flags as partial object. */`
- Issue: Restates function name

**Line 225-227:** `/** Parse lines option. */`
- Issue: Restates function name

**Line 236-238:** `/** Validate log level option. */`
- Issue: Restates function name

**Line 248-250:** `/** Validate format option. */`
- Issue: Restates function name

**Line 258-259:** `/** Extract string options */`
- Issue: Restates function name

**Line 276-278:** `/** Extract positional args based on command */`
- Issue: Restates function name

**Line 304-306:** `/** Build parsed args from values and positionals. */`
- Issue: Restates function signature

**Line 333-335:** `/** Parse raw args */`
- Issue: Restates function name

**Line 344-346:** `/** Convert parse error to GeneralError. */`
- Issue: Restates function name

**Line 353-355:** `/** Parse command line arguments. */`
- Issue: Restates function name

**Line 365-367:** `/** Validate parsed arguments for a specific command. */`
- Issue: Restates function name

---

## Batch 5

### `src/cli/runtime.ts`

**Line 25-27:** `/** Service paths configuration for a command. */`
- Issue: Restates interface name

**Line 35-37:** `/** Service user configuration for a command. */`
- Issue: Restates interface name

**Line 44-46:** `/** Service options for a command. */`
- Issue: Restates interface name

**Line 53-55:** `/** System capabilities for a command. */`
- Issue: Restates interface name

---

### `src/config/env.ts`

**Line 19:** `/** Supported log levels */`
- Issue: Restates type alias name

**Line 22:** `/** Supported log formats */`
- Issue: Restates type alias name

**Line 25-27:** `/** Environment configuration shape. */`
- Issue: Restates interface name

**Line 66-68:** `/** Log format with DIVBAN_ namespace. */`
- Issue: Describes implementation detail

**Line 74-76:** `/** Base data directory with DIVBAN_ namespace. */`
- Issue: Describes implementation detail

**Line 136-138:** `/** Test config override options using camelCase keys. */`
- Issue: Restates interface name

**Line 147-149:** `/** Default test configuration values. */`
- Issue: Restates constant name

**Line 217:** `// Fall back to TOML config`
- Issue: Describes what the code does

**Line 239:** `// Fall back to TOML config`
- Issue: Describes what the code does

---

### `src/config/index.ts`

**Line 12:** `// Schema exports`
- Issue: Section marker that describes what

**Line 37:** `// Loader exports`
- Issue: Section marker that describes what

**Line 45:** `// Merge exports`
- Issue: Section marker that describes what

---

### `src/config/loader.ts`

**Line 25-27:** `/** Load and parse a TOML file. */`
- Issue: Restates function name

**Line 33:** `// Check if file exists`
- Issue: Describes what the code does

**Line 47:** `// Read file content`
- Issue: Describes what the code does

**Line 58:** `// Parse TOML using Bun's native parser`
- Issue: Describes what the code does

**Line 70:** `// Validate with Effect Schema`
- Issue: Describes what the code does

**Line 74-76:** `/** Load global configuration with explicit HOME directory. */`
- Issue: Restates function signature

**Line 134-136:** `/** Load service configuration. */`
- Issue: Restates function name

---

### `src/config/merge.ts`

**Line 19-21:** `/** Deep merge two objects, with source values taking precedence. */`
- Issue: Restates function name and parameter behavior evident from signature

**Line 26:** `// Build overrides object from source entries (single pass)`
- Issue: Describes what the code does

**Line 32:** `// Recursive case: both are plain objects`
- Issue: Describes what the code does

**Line 36:** `// Base case: use source value directly`
- Issue: Describes what the code does

**Line 43-45:** `/** Merge global config defaults into container configuration. */`
- Issue: Restates function name

**Line 59-61:** `/** Get effective user allocation settings from global config. */`
- Issue: Restates function name

**Line 79-81:** `/** Get effective logging settings from global config. */`
- Issue: Restates function name

**Line 95-97:** `/** Get effective paths from global config. */`
- Issue: Restates function name

**Line 119-121:** `/** Add timezone to environment if not already set. */`
- Issue: Restates function name

---

## Batch 6

### `src/config/schema.ts`

**Line 46:** `/** Port mapping configuration (output after decoding) */`
- Issue: Restates interface name; "(output after decoding)" pattern is repetitive

**Line 54:** `/** Port mapping configuration (input before decoding) */`
- Issue: Restates interface name

**Line 75:** `/** Volume mount configuration (output after decoding) */`
- Issue: Restates interface name

**Line 82:** `/** Volume mount configuration (input before decoding) */`
- Issue: Restates interface name

**Line 96:** `/** Health check configuration (output after decoding) */`
- Issue: Restates interface name

**Line 106:** `/** Health check configuration (input before decoding) */`
- Issue: Restates interface name

**Line 136:** `/** Service restart policy */`
- Issue: Restates type alias name

**Line 259-260:** `/** Global configuration for divban.toml (output after decoding) */`
- Issue: Restates interface name

**Line 443-445:** `/** Service base configuration - common to all services (input before decoding). */`
- Issue: Restates interface name

**Line 459-461:** `// ============================================================================ // Effect-based Helper Functions // ============================================================================`
- Issue: Section markers that describe what follows

**Line 509-511:** `/** Get quadlet directory for a service user (Effect version). */`
- Issue: Restates function name; "(Effect version)" is redundant

**Line 517-519:** `/** Get config directory for a service (Effect version). */`
- Issue: Restates function name

---

### `src/index.ts`

**Line 19-22:** `/** Extract exit code from Effect Exit. Handles both success and failure cases with proper error extraction. */`
- Issue: Restates function name and implementation details evident from code

**Line 42-44:** `/** Log error from Exit cause. */`
- Issue: Restates function name

---

### `src/lib/assert.ts`

**Line 15-17:** `/** Returns Effect that fails if condition is false. */`
- Issue: Describes what; doesn't explain when/why to use this over plain assertions

**Line 25-27:** `/** Type guard for checking if a value is an object with specific keys. */`
- Issue: Restates function name and signature

**Line 38-40:** `/** Type guard for checking if a value is a non-empty string. */`
- Issue: Restates function name

**Line 44-46:** `/** Type guard for checking if a value is a positive integer. */`
- Issue: Restates function name

**Line 50-52:** `/** Type guard for checking if a value is a non-negative integer. */`
- Issue: Restates function name

**Line 56-58:** `/** Check if a value is one of the allowed values. */`
- Issue: Restates function name

**Line 62-64:** `/** Narrow an array type to non-empty. */`
- Issue: Restates type alias purpose

**Line 69-71:** `/** Total: returns Effect<NonEmptyArray<T>, GeneralError>. */`
- Issue: Restates return type signature

**Line 80-83:** `/** Returns None if array is empty. Returns Some(arr) if non-empty, None otherwise. */`
- Issue: Restates Option semantics evident from return type

---

### `src/lib/backup-utils.ts`

**Line 29-32:** `/** Create a backup-safe timestamp string. Format: YYYY-MM-DDTHH-mm-ss-sssZ (ISO with colons/periods replaced) */`
- Issue: Restates function name; format is implementation detail

**Line 36-38:** `/** Ensure backup directory exists with proper error mapping. */`
- Issue: Restates function name

**Line 51-53:** `/** Create archive metadata for a backup. */`
- Issue: Restates function name

**Line 61-64:** `/** Write a backup archive to disk. Returns the path on success. */`
- Issue: Restates function name and return type

**Line 88-92:** `/** List backup files in a directory, sorted by modification time (newest first). @param backupDir - Directory containing backups @param pattern - Glob pattern ... */`
- Issue: Restates function signature

**Line 129-131:** `/** Detect compression format from file extension. */`
- Issue: Restates function name

**Line 142-144:** `/** Validate backup file exists before restore. */`
- Issue: Restates function name

**Line 159-161:** `/** Get accurate file size using stat(). */`
- Issue: Restates function name and implementation detail

**Line 192-194:** `// ============================================================================ // Directory Scanning Utilities // ============================================================================`
- Issue: Section markers that describe what follows

**Line 227-229:** `/** Get file stat safely, defaulting mtime to 0 on error. */`
- Issue: Restates function behavior evident from implementation

**Line 243-245:** `/** List files sorted by modification time (newest first). */`
- Issue: Restates function name

**Line 267-269:** `/** Read file content from directory. */`
- Issue: Restates function name

**Line 293-295:** `/** Collect files with their contents from a directory. */`
- Issue: Restates function name

---

### `src/lib/char.ts`

**Line 40:** `/** Check if character is in a given set */`
- Issue: Restates function name

---

## Batch 7

### `src/lib/collection-utils.ts`

**Line 17-19:** `// ============================================================================ // Identity Function // ============================================================================`
- Issue: Section markers that describe what follows

**Line 21:** `/** The identity function. Use instead of \`(x) => x\`. */`
- Issue: Restates function name; usage hint is marginally useful

**Line 24-26:** `// ============================================================================ // Async Iterable → Effect Collection // ============================================================================`
- Issue: Section markers

**Line 28-30:** `/** Collect async iterable to Chunk using Stream. */`
- Issue: Restates function name

**Line 37-39:** `/** Collect async iterable to ReadonlyArray. */`
- Issue: Restates function name

**Line 57-59:** `// ============================================================================ // ReadonlyMap Operations // ============================================================================`
- Issue: Section markers

**Line 61:** `/** Empty ReadonlyMap. */`
- Issue: Restates function name

**Line 64-66:** `/** Merge two ReadonlyMaps. Right-biased (later values win). */`
- Issue: Restates function name

**Line 72-74:** `/** Concatenate many maps into one. Right-biased. */`
- Issue: Restates function name

**Line 78-80:** `/** Create ReadonlyMap from entries (tuple array). */`
- Issue: Restates function name

**Line 84-86:** `/** Create ReadonlyMap from iterable of entries. */`
- Issue: Restates function name

**Line 90-92:** `/** Insert a key-value pair, returning a new map. */`
- Issue: Restates function behavior evident from signature

**Line 98-100:** `/** Lookup a key in a map, returning Option. */`
- Issue: Restates function name and return type

**Line 106-108:** `// ============================================================================ // ReadonlyArray Operations // ============================================================================`
- Issue: Section markers

**Line 116-118:** `/** Safe last - returns Option. */`
- Issue: Describes what; return type is evident from signature

**Line 130-132:** `/** Flatten nested arrays into a single array. */`
- Issue: Restates function name

**Line 135-137:** `/** Deduplicate array preserving order. */`
- Issue: Restates function name

**Line 140-142:** `/** Concatenate and deduplicate multiple arrays. */`
- Issue: Restates function name

**Line 146-148:** `// ============================================================================ // Record Operations // ============================================================================`
- Issue: Section markers

**Line 160-162:** `/** Map over record entries with a function. */`
- Issue: Restates function name

**Line 168-170:** `/** FlatMap over record entries. */`
- Issue: Restates function name

**Line 176-178:** `// ============================================================================ // Merge Helpers // ============================================================================`
- Issue: Section markers

**Line 180-182:** `/** Merge records using spread. Right-biased (later values win). */`
- Issue: Restates function name and implementation detail

**Line 188-190:** `/** Merge multiple partial records into one. */`
- Issue: Restates function name

---

### `src/lib/crypto.ts`

**Line 36-38:** `/** Generate valid characters from random bytes. */`
- Issue: Restates function name

---

### `src/lib/errors.ts`

**Line 126-128:** `/** Get human-readable error code name. */`
- Issue: Restates function name

**Line 138-140:** `/** Extract error message from unknown value. */`
- Issue: Restates function name

**Line 151-153:** `// ============================================================================ // Effect-Style Tagged Error Classes // ============================================================================`
- Issue: Section markers

**Line 155:** `/** General error code values (1-4) */`
- Issue: Restates type alias purpose; code range evident from type definition

**Line 158:** `/** Config error code values (10-13) */`
- Issue: Restates type alias purpose

**Line 161:** `/** System error code values (20-28) */`
- Issue: Restates type alias purpose

**Line 164:** `/** Service error code values (30-35) */`
- Issue: Restates type alias purpose

**Line 167:** `/** Container error code values (40-46) */`
- Issue: Restates type alias purpose

**Line 170:** `/** Backup error code values (50-52) */`
- Issue: Restates type alias purpose

**Line 173:** `/** Props for GeneralError */`
- Issue: Restates interface name

**Line 180:** `/** Props for ConfigError */`
- Issue: Restates interface name

**Line 188:** `/** Props for SystemError */`
- Issue: Restates interface name

**Line 195:** `/** Props for ServiceError */`
- Issue: Restates interface name

**Line 203:** `/** Props for ContainerError */`
- Issue: Restates interface name

**Line 211:** `/** Props for BackupError */`
- Issue: Restates interface name

**Line 271-273:** `/** System errors (codes 20-28) */`
- Issue: Restates class name; code range is redundant

**Line 294-296:** `/** Service errors (codes 30-35) */`
- Issue: Restates class name

**Line 321-323:** `/** Container errors (codes 40-46) */`
- Issue: Restates class name

**Line 348-350:** `/** Backup errors (codes 50-52) */`
- Issue: Restates class name

**Line 387-389:** `/** Helper to get exit code from any Effect error. */`
- Issue: Restates function name

**Line 392-394:** `// ============================================================================ // Error Factory Functions // ============================================================================`
- Issue: Section markers

**Line 396-398:** `/** Create a GeneralError from an ErrorCode constant and message. */`
- Issue: Restates function signature

**Line 424-426:** `/** Create a SystemError from an ErrorCode constant and message. */`
- Issue: Restates function signature

---

### `src/lib/file-parsers.ts`

**Line 16-18:** `// ============================================================================ // Line Parsing Helpers // ============================================================================`
- Issue: Section markers

**Line 20:** `/** Predicate: line is non-empty and not a comment */`
- Issue: Describes what; evident from function name and implementation

**Line 26:** `/** Filter out empty and comment lines */`
- Issue: Restates function name

**Line 30:** `/** Split content into content lines */`
- Issue: Restates function name

**Line 34-36:** `// ============================================================================ // KEY=VALUE Parsing // ============================================================================`
- Issue: Section markers

**Line 57-59:** `// ============================================================================ // Colon-Delimited Parsing // ============================================================================`
- Issue: Section markers

**Line 90-92:** `// ============================================================================ // Subuid/Subgid Range Type // ============================================================================`
- Issue: Section markers

**Line 94:** `/** Subuid/subgid range type */`
- Issue: Restates interface name

**Line 101:** `/** Order instance for SubidRange by start position */`
- Issue: Restates constant name and type

**Line 129-131:** `// ============================================================================ // UID Allocation Pure Functions // ============================================================================`
- Issue: Section markers

**Line 148:** `/** Accumulator state for gap-finding fold */`
- Issue: Restates interface purpose evident from name

**Line 154-157:** `/** Find gap in sorted ranges for new allocation. Process lines with accumulator. */`
- Issue: Restates function name

---

### `src/lib/index.ts`

**Line 8-11:** `/** Core library exports for divban. This module provides the foundation types and utilities used throughout the application. */`
- Issue: Restates module purpose evident from filename

**Line 13:** `// Types - Branded types for type-safe identifiers`
- Issue: Section marker

**Line 48:** `// Path utilities`
- Issue: Section marker

**Line 69:** `// Option - Re-exported from Effect with helpers`
- Issue: Section marker

**Line 81:** `// Errors - Tagged error classes for Effect-based error handling`
- Issue: Section marker

**Line 96:** `// Logger - Structured logging`
- Issue: Section marker

**Line 107:** `// Assert - Runtime assertions and type guards`
- Issue: Section marker

**Line 122:** `// Utils - Bun standard library utilities`
- Issue: Section marker

**Line 165:** `// Semver - Version comparison`
- Issue: Section marker

**Line 185:** `// Timing - Effect-based timing utilities`
- Issue: Section marker

**Line 189:** `// Paths - Centralized path construction`
- Issue: Section marker

---

## Batch 8

### `src/lib/logger.ts`

**Line 24-27:** `/** Color names supported by Bun.color() for terminal output. */`
- Issue: Restates type alias name

**Line 38-40:** `/** Apply bold styling to text. */`
- Issue: Restates function name

**Line 47-49:** `/** Strip ANSI escape codes from text. */`
- Issue: Restates function name

**Line 67:** `/** Output raw text without any formatting */`
- Issue: Restates method name

**Line 72-74:** `/** Create a logger instance with the given options. */`
- Issue: Restates function signature

**Line 79-80:** `// Determine if we should use colors based on option or auto-detect`
- Issue: Describes what the code does

**Line 82-83:** `// Internal colorize that respects the useColor option`
- Issue: Describes what the function does

**Line 95:** `// Use Bun.inspect for pretty debug output`
- Issue: Describes what the code does

**Line 181-183:** `/** Default logger for quick access. */`
- Issue: Restates variable name

**Line 197:** `// ─── Effect Alternative ─────...`
- Issue: Section marker

**Line 199-201:** `/** Fiber-local logger for Effect pipelines. */`
- Issue: Describes what

**Line 206:** `/** Get logger from current fiber context */`
- Issue: Restates function name

**Line 209:** `/** Run effect with specific logger in scope */`
- Issue: Restates function name

---

### `src/lib/match-helpers.ts`

**Line 8-10:** `/** Helper functions for exhaustive pattern matching using Effect's Match module. */`
- Issue: Restates module purpose evident from filename

---

### `src/lib/option-helpers.ts`

**Line 16-18:** `/** Convert Option to Effect, failing if None. */`
- Issue: Restates function behavior evident from signature

**Line 38-40:** `/** Map and provide default value. */`
- Issue: Restates function name

**Line 48-50:** `/** Map and provide lazy default. */`
- Issue: Restates function name

**Line 71-73:** `// ─────────────────────────────────────────────────────────────────────────────`
- Issue: Section markers

**Line 75-77:** `/** Conditionally spread an optional property. */`
- Issue: Restates function name

**Line 84-86:** `/** Build an object from tuples, omitting undefined values. */`
- Issue: Restates function name

**Line 96-98:** `// ============================================================================ // Option Extraction // ============================================================================`
- Issue: Section markers

**Line 109-111:** `/** Check if Option contains a value satisfying predicate. */`
- Issue: Restates function name

**Line 136-138:** `/** Apply function to each element, returning None if any call fails. */`
- Issue: Restates function behavior evident from signature

**Line 144-146:** `/** Filter out None values and extract Some values. */`
- Issue: Restates function name

---

### `src/lib/paths.ts`

**Line 26-28:** `// ============================================================================ // System Paths // ============================================================================`
- Issue: Section markers

**Line 50-52:** `// ============================================================================ // User Directory Paths // ============================================================================`
- Issue: Section markers

**Line 119-121:** `// ============================================================================ // Path Conversion Utilities // ============================================================================`
- Issue: Section markers

**Line 128-130:** `/** Normalize and resolve a path to absolute. */`
- Issue: Restates function name

**Line 159-161:** `// ============================================================================ // Service Paths // ============================================================================`
- Issue: Section markers

**Line 180-182:** `// ============================================================================ // File Path Builders // ============================================================================`
- Issue: Section markers

**Line 190-192:** `// ============================================================================ // Temporary/Mock Paths // ============================================================================`
- Issue: Section markers

---

### `src/lib/retry.ts`

**Line 18-20:** `// ============================================================================ // Retry Schedules // ============================================================================`
- Issue: Section markers

**Line 80-82:** `// ============================================================================ // Error Classification // ============================================================================`
- Issue: Section markers

**Line 132:** `/** Checks if message contains any pattern from the array */`
- Issue: Restates function name

---

## Batch 9

### `src/lib/schema-utils.ts`

**Line 28-30:** `// ============================================================================ // Error Formatting // ============================================================================`
- Issue: Section markers

**Line 48-50:** `// ============================================================================ // Decode Utilities // ============================================================================`
- Issue: Section markers

**Line 59-62:** `/** Decode unknown data with a schema, returning Effect. Effect version for use in Effect pipelines. */`
- Issue: Restates function signature; "Effect version" is redundant

**Line 84-86:** `// ============================================================================ // Parsing Primitives // ============================================================================`
- Issue: Section markers

**Line 107-109:** `/** Parse an octet (0-255). */`
- Issue: Restates function name

**Line 116-118:** `// ============================================================================ // IPv4 Parsing // ============================================================================`
- Issue: Section markers

**Line 120:** `/** Branded type for parsed IPv4 */`
- Issue: Restates type alias name

**Line 141-143:** `// ============================================================================ // IPv6 Parsing // ============================================================================`
- Issue: Section markers

**Line 145:** `/** Check if string is valid hex group (1-4 hex digits) */`
- Issue: Restates function name

**Line 148:** `/** State for substring counting */`
- Issue: Restates type alias name

**Line 151:** `/** Step function: find next match and advance state */`
- Issue: Describes what the function does

**Line 161:** `/** Count non-overlapping occurrences of substring */`
- Issue: Restates function name

**Line 195-197:** `// ============================================================================ // Email Parsing // ============================================================================`
- Issue: Section markers

**Line 199:** `/** Parsed email structure */`
- Issue: Restates interface name

**Line 205:** `/** Valid email character (non-whitespace, non-@) */`
- Issue: Describes what; evident from implementation

**Line 208-210:** `/** Parse email into local@domain structure. */`
- Issue: Restates function name

**Line 241-243:** `// ============================================================================ // Name Parsers // ============================================================================`
- Issue: Section markers

**Line 296-298:** `// ============================================================================ // Container Image Parser // ============================================================================`
- Issue: Section markers

**Line 300:** `/** Parsed container image structure */`
- Issue: Restates interface name

**Line 366-368:** `// ============================================================================ // URL Validation // ============================================================================`
- Issue: Section markers

---

### `src/lib/semver.ts`

**Line 8-10:** `/** Semantic versioning utilities using Bun.semver. */`
- Issue: Restates module purpose evident from filename

**Line 60-62:** `/** Check if version a is greater than version b. */`
- Issue: Restates function name (gt)

**Line 67-69:** `/** Check if version a is greater than or equal to version b. */`
- Issue: Restates function name (gte)

**Line 74-76:** `/** Check if version a is less than version b. */`
- Issue: Restates function name (lt)

**Line 81-83:** `/** Check if version a is less than or equal to version b. */`
- Issue: Restates function name (lte)

**Line 88-90:** `/** Check if two versions are equal. */`
- Issue: Restates function name (eq)

**Line 95-97:** `/** Check if two versions are not equal. */`
- Issue: Restates function name (neq)

---

### `src/lib/str-transform.ts`

**Line 69-71:** `/** Remove suffix if present. */`
- Issue: Restates function name

**Line 77-79:** `/** Remove prefix if present. */`
- Issue: Restates function name

**Line 85-87:** `/** Replace characters using a lookup map (unknown chars pass through). */`
- Issue: Restates function name

**Line 91-93:** `/** Escape characters with a prefix using lookup. */`
- Issue: Restates function name

---

### `src/lib/str.ts`

**Line 17:** `/** Convert string to array of single characters (always total) */`
- Issue: Restates function name; "(always total)" is marginally useful

**Line 39:** `/** Check if all characters satisfy predicate */`
- Issue: Restates function name

**Line 45:** `/** Check if any character satisfies predicate */`
- Issue: Restates function name

---

### `src/lib/timing.ts`

**Line 8-10:** `/** Effect-based timing utilities. */`
- Issue: Restates module purpose evident from filename

**Line 20-22:** `/** Stopwatch for Effect pipelines using Ref for managed state. */`
- Issue: Describes what

---

## Batch 10

### `src/lib/types.ts`

**Line 28-30:** `// ============================================================================ // Branded Type Definitions // ============================================================================`
- Issue: Section markers

**Line 66-68:** `// ============================================================================ // Message Functions // ============================================================================`
- Issue: Section markers

**Line 86-88:** `// ============================================================================ // Numeric Branded Schemas // ============================================================================`
- Issue: Section markers

**Line 90:** `/** User ID schema (0-65534 range for POSIX users) */`
- Issue: Duplicates the type alias comment above (line 32); schema purpose is evident from naming convention

**Line 97:** `/** Group ID schema (0-65534 range for POSIX groups) */`
- Issue: Duplicates the type alias comment above (line 35)

**Line 104:** `/** Subordinate ID schema for user namespaces (100000-4294967294 range) */`
- Issue: Duplicates the type alias comment above (line 38)

**Line 112-114:** `// ============================================================================ // String Branded Schemas // ============================================================================`
- Issue: Section markers

**Line 116:** `/** Absolute filesystem path schema (must start with /) */`
- Issue: Duplicates the type alias comment (line 41)

**Line 123:** `/** POSIX username schema (lowercase, starts with letter or underscore, max 32 chars) */`
- Issue: Duplicates the type alias comment (line 44)

**Line 130:** `/** Service name schema */`
- Issue: Restates schema name

**Line 136:** `/** Container name schema */`
- Issue: Restates schema name

**Line 143:** `/** Network name schema */`
- Issue: Restates schema name

**Line 149:** `/** Volume name schema */`
- Issue: Restates schema name

**Line 155:** `/** Container image schema (registry/image:tag@sha256:digest) */`
- Issue: Duplicates type alias comment (line 62)

**Line 162-164:** `// ============================================================================ // Duration String Types // ============================================================================`
- Issue: Section markers

**Line 166:** `/** Branded duration string for runtime validation */`
- Issue: Restates type alias purpose evident from name

**Line 169:** `/** Duration pattern: digits followed by unit */`
- Issue: Describes what the regex matches; pattern is readable

**Line 197-199:** `// ============================================================================ // PrivateIP Branded Schema // ============================================================================`
- Issue: Section markers

**Line 201:** `/** Private IPv4 (RFC 1918) validation using parser */`
- Issue: Restates function name and implementation detail

**Line 209:** `/** Private IPv6 (RFC 4193 ULA) validation using parser */`
- Issue: Restates function name and implementation detail

**Line 223:** `/** Check if string is a valid private IP */`
- Issue: Restates function name

**Line 226:** `/** Decode function for PrivateIP transform */`
- Issue: Restates function purpose evident from usage context

**Line 229:** `/** Encode function for PrivateIP transform (identity) */`
- Issue: Restates function purpose; "(identity)" redundant with implementation

**Line 232:** `/** Private IP schema (RFC 1918 IPv4 or RFC 4193 IPv6) */`
- Issue: Duplicates type alias comment (line 59)

**Line 244-248:** `// ============================================================================ // Type Guards // ============================================================================ // Schema.is(schema) returns...`
- Issue: Section markers; implementation note describes what Schema.is does (external API)

**Line 262-265:** `// ============================================================================ // Effect-Based Decoders // ============================================================================ // Usage: yield* decodeUserId...`
- Issue: Section markers (usage note is helpful)

**Line 325-327:** `// ============================================================================ // Error Conversion Helper // ============================================================================`
- Issue: Section markers

**Line 341-343:** `// ============================================================================ // UID/GID Conversion Helper // ============================================================================`
- Issue: Section markers

**Line 351-353:** `// ============================================================================ // Compile-Time Path Validation // ============================================================================`
- Issue: Section markers

**Line 402-404:** `// ============================================================================ // Type-Safe Path Concatenation // ============================================================================`
- Issue: Section markers

**Line 452-455:** `/** Join path segments into an AbsolutePath. First segment must start with /. */`
- Issue: Restates function name and constraint evident from return type

---

### `src/lib/utils.ts`

**Line 8-10:** `/** Utility functions using Bun standard library. */`
- Issue: Vague module-level comment; doesn't explain WHY these utilities exist

**Line 16-18:** `// ============================================================================ // UUID Generation // ============================================================================`
- Issue: Section markers

**Line 26-29:** `/** Generate a UUID v7 as a Buffer. */`
- Issue: Restates function name

**Line 31-34:** `/** Generate a UUID v7 with base64url encoding (shorter string). */`
- Issue: Restates function name; "(shorter string)" is marginally useful

**Line 36-39:** `/** Generate a random UUID v4 (standard random UUID). */`
- Issue: Restates function name

**Line 41-43:** `// ============================================================================ // Timing // ============================================================================`
- Issue: Section markers

**Line 45-48:** `/** Sleep for the specified number of milliseconds. */`
- Issue: Restates function signature

**Line 55-57:** `// ============================================================================ // Terminal String Width // ============================================================================`
- Issue: Section markers

**Line 93-95:** `/** Pad a string to a specific display width (left-pad with spaces). */`
- Issue: Restates function name

**Line 102-104:** `/** Center a string within a specific display width. */`
- Issue: Restates function name

**Line 113-116:** `/** Truncate a string to fit within a specific display width. Adds ellipsis if truncated. */`
- Issue: Restates function name and behavior evident from signature

**Line 132-134:** `/** Collect chars while width budget remains. */`
- Issue: Describes what the recursive helper does

**Line 153-155:** `// ============================================================================ // Promise Inspection (Debug Utilities) // ============================================================================`
- Issue: Section markers

**Line 181-186:** `/** Check if a promise is pending. */`
- Issue: Restates function name

**Line 188-193:** `/** Check if a promise is fulfilled. */`
- Issue: Restates function name

**Line 195-200:** `/** Check if a promise is rejected. */`
- Issue: Restates function name

**Line 202-204:** `// ============================================================================ // HTML Escaping // ============================================================================`
- Issue: Section markers

**Line 219-221:** `// ============================================================================ // Path Utilities // ============================================================================`
- Issue: Section markers

**Line 245-247:** `// ============================================================================ // Environment & Runtime Info // ============================================================================`
- Issue: Section markers

**Line 249-252:** `/** Get the Bun version string. */`
- Issue: Restates function name

**Line 254-257:** `/** Get the git revision of the Bun build. */`
- Issue: Restates function name

**Line 259-262:** `/** Check if this script is the main entry point. */`
- Issue: Restates function name

**Line 264-267:** `/** Get the absolute path of the main entry point. */`
- Issue: Restates function name

**Line 269-271:** `// ============================================================================ // Module Resolution // ============================================================================`
- Issue: Section markers

**Line 284-286:** `// ============================================================================ // Stream Utilities // ============================================================================`
- Issue: Section markers

**Line 288-290:** `/** Convert a ReadableStream to text. */`
- Issue: Restates function name

**Line 295-297:** `/** Convert a ReadableStream to a Uint8Array. */`
- Issue: Restates function name

**Line 302-304:** `/** Convert a ReadableStream to JSON. */`
- Issue: Restates function name

**Line 309-311:** `/** Convert a ReadableStream to an array of chunks. */`
- Issue: Restates function name

**Line 316-318:** `/** Convert a ReadableStream to a Blob. */`
- Issue: Restates function name

**Line 323-325:** `// ============================================================================ // Base64 Encoding/Decoding // ============================================================================`
- Issue: Section markers

**Line 327-330:** `/** Encode a string to base64. */`
- Issue: Restates function name

**Line 332-335:** `/** Decode a base64 string. */`
- Issue: Restates function name

**Line 337-340:** `/** Encode binary data to base64. */`
- Issue: Restates function name

**Line 344-347:** `/** Decode base64 to Uint8Array. */`
- Issue: Restates function name

**Line 351:** `/** Remove padding chars */`
- Issue: Restates function name

**Line 354-355:** `/** Convert +/ to URL-safe -_ */`
- Issue: Describes what the transformation does

**Line 371-373:** `// ============================================================================ // ANSI Color Utilities // ============================================================================`
- Issue: Section markers

**Line 375-377:** `/** Get ANSI escape code for a color with automatic terminal detection. */`
- Issue: Restates function name

**Line 383-386:** `/** Check if the terminal supports colors. */`
- Issue: Restates function name

**Line 388-391:** `/** Wrap text in ANSI color codes with automatic reset. */`
- Issue: Restates function name

**Line 396-398:** `// ============================================================================ // Buffer Building // ============================================================================`
- Issue: Section markers

---

### `src/quadlet/container/capabilities.ts`

**Line 99-101:** `/** Drop all capabilities except those needed. */`
- Issue: Restates function name

**Line 107-109:** `/** Common capability profiles. */`
- Issue: Restates constant name

**Line 134-136:** `/** Check if a capability name is valid. */`
- Issue: Restates function name

---

### `src/quadlet/container/environment.ts`

**Line 36-39:** `/** Format an environment file reference for quadlet. Supports %h for home directory and other systemd specifiers. */`
- Issue: Restates function signature; specifier support is implementation detail

**Line 50-52:** `/** Common environment variables. */`
- Issue: Restates constant name

**Line 57:** `/** Timezone */`
- Issue: Restates key name (TZ)

**Line 59:** `/** User ID */`
- Issue: Restates key name (PUID)

**Line 61:** `/** Group ID */`
- Issue: Restates key name (PGID)

**Line 63:** `/** Disable telemetry */`
- Issue: Restates key purpose evident from key name (NO_TELEMETRY)

**Line 78-80:** `/** Filter environment variables by prefix. */`
- Issue: Restates function name

---

### `src/quadlet/container/health.ts`

**Line 40-42:** `/** Create a basic health check configuration. */`
- Issue: Restates function name

**Line 55-57:** `/** Create a health check that uses curl to check an HTTP endpoint. */`
- Issue: Restates function name

**Line 67-69:** `/** Create a health check that uses wget to check an HTTP endpoint. */`
- Issue: Restates function name

**Line 79-81:** `/** Create a health check for PostgreSQL. */`
- Issue: Restates function name

**Line 94-96:** `/** Create a health check for Redis. */`
- Issue: Restates function name

**Line 114-116:** `/** Health check on failure actions. */`
- Issue: Restates constant name

**Line 118:** `/** Do nothing */`
- Issue: Restates value meaning (NONE)

**Line 120:** `/** Kill the container */`
- Issue: Restates value meaning (KILL)

**Line 122:** `/** Restart the container */`
- Issue: Restates value meaning (RESTART)

**Line 124:** `/** Stop the container */`
- Issue: Restates value meaning (STOP)

---

## Batch 11

### `src/quadlet/container/image.ts`

**Line 25-27:** `// ─────────────────────────────────────────────────────────────────────────────`
- Issue: Section markers

**Line 43-45:** `// ─────────────────────────────────────────────────────────────────────────────`
- Issue: Section markers

**Line 88-90:** `// ─────────────────────────────────────────────────────────────────────────────`
- Issue: Section markers

**Line 125-127:** `/** Parse image reference using state machine. */`
- Issue: Restates function name

**Line 131-133:** `/** Build image reference from components. */`
- Issue: Restates function name

**Line 157-159:** `/** Common container registries. */`
- Issue: Restates constant name

---

### `src/quadlet/container/index.ts`

**Line 35-37:** `/** Build container section by composing all entry generators. */`
- Issue: Restates function name

**Line 63-65:** `/** Generate a complete container quadlet file. */`
- Issue: Restates function name

**Line 90:** `// Re-export all container modules`
- Issue: Describes what the re-exports are

**Line 92:** `// capabilities.ts`
- Issue: Section marker naming module

**Line 102:** `// environment.ts`
- Issue: Section marker naming module

**Line 112:** `// secrets.ts`
- Issue: Section marker naming module

**Line 122:** `// health.ts`
- Issue: Section marker naming module

**Line 134:** `// image.ts`
- Issue: Section marker naming module

**Line 143:** `// misc.ts`
- Issue: Section marker naming module

**Line 153:** `// network.ts`
- Issue: Section marker naming module

**Line 164:** `// resources.ts`
- Issue: Section marker naming module

**Line 173:** `// security.ts`
- Issue: Section marker naming module

**Line 183:** `// user.ts`
- Issue: Section marker naming module

**Line 195:** `// volumes.ts`
- Issue: Section marker naming module

---

### `src/quadlet/container/misc.ts`

**Line 50-52:** `/** Convert config to INI entries. */`
- Issue: Restates function name

**Line 71-73:** `/** Common log drivers. */`
- Issue: Restates constant name

**Line 75:** `/** Journald (default for systemd) */`
- Issue: Restates value name

**Line 77:** `/** JSON file logging */`
- Issue: Restates value name

**Line 79:** `/** No logging */`
- Issue: Restates value name

**Line 81:** `/** Passthrough to conmon */`
- Issue: Describes what "passthrough" means (marginally useful)

**Line 83:** `/** syslog */`
- Issue: Restates value name

**Line 87-89:** `/** Common stop signals. */`
- Issue: Restates constant name

**Line 100-102:** `/** Pull policies. */`
- Issue: Restates constant name

**Line 104:** `/** Always pull the image */`
- Issue: Restates value name (ALWAYS)

**Line 106:** `/** Pull only if not present locally */`
- Issue: Restates value name (MISSING)

**Line 108:** `/** Never pull (use local only) */`
- Issue: Restates value name (NEVER)

**Line 110:** `/** Pull if remote is newer */`
- Issue: Restates value name (NEWER)

**Line 114-116:** `/** Common device mappings. */`
- Issue: Restates constant name

**Line 118:** `/** GPU devices for NVIDIA */`
- Issue: Describes what device paths are for (category label)

**Line 122:** `/** DRI devices for Intel/AMD GPU */`
- Issue: Describes what device paths are for (category label)

**Line 125:** `/** Video devices */`
- Issue: Describes what device path is for

**Line 127:** `/** Sound devices */`
- Issue: Describes what device path is for

**Line 129:** `/** Fuse device */`
- Issue: Restates key name

---

### `src/quadlet/container/network.ts`

**Line 43-46:** `/** Check if an IP address is IPv6. */`
- Issue: Restates function name

**Line 48-51:** `/** Format host IP for port mapping, wrapping IPv6 in brackets. */`
- Issue: Restates function name and behavior evident from implementation

**Line 53-55:** `/** Format a port mapping for quadlet. */`
- Issue: Restates function name

**Line 63-65:** `/** Format network mode value with pasta options if applicable. */`
- Issue: Restates function signature

**Line 91-93:** `/** Create a standard port mapping. */`
- Issue: Restates function name

**Line 104-106:** `/** Create a localhost-only port mapping. */`
- Issue: Restates function name

**Line 118-120:** `/** Create port mappings for common services. */`
- Issue: Restates constant name

---

### `src/quadlet/container/resources.ts`

**Line 23-25:** `// ============================================================================ // Parsed Result Type // ============================================================================`
- Issue: Section markers

**Line 32-34:** `// ============================================================================ // Lexer State Machine // ============================================================================`
- Issue: Section markers

**Line 44-47:** `/** Step function for memory size lexer. State transitions: digits -> unit -> done */`
- Issue: Restates function name; state transition documentation is marginally useful

**Line 102-104:** `/** Parse memory size string using lexer. */`
- Issue: Restates function name

**Line 129-131:** `// ============================================================================ // Configuration Types // ============================================================================`
- Issue: Section markers

**Line 170-172:** `// ============================================================================ // Public API // ============================================================================`
- Issue: Section markers

**Line 174:** `/** Multipliers for memory units */`
- Issue: Restates constant name

**Line 183-186:** `/** Parse memory size string to bytes. Uses Option.match for exhaustive pattern matching. */`
- Issue: Restates function signature; implementation detail about Option.match

**Line 203-205:** `/** Format bytes as a memory size string. */`
- Issue: Restates function name

**Line 219-221:** `/** Common resource profiles. */`
- Issue: Restates constant name

---

## Batch 12

### `src/quadlet/container/secrets.ts`

**Line 25-28:** `/** Format a secret mount for quadlet. Format: name[,type=mount|env][,target=path|envvar][,mode=0XXX] */`
- Issue: Restates function name; format specification is marginally useful

**Line 51-53:** `/** Create a secret mounted as a file. */`
- Issue: Restates function name

**Line 60-62:** `/** Create a secret injected as environment variable. */`
- Issue: Restates function name

**Line 69-71:** `/** Get the default mount path for a secret. */`
- Issue: Restates function name

---

### `src/quadlet/container/security.ts`

**Line 45-47:** `/** Create a hardened security configuration. */`
- Issue: Restates function name

**Line 53-55:** `/** Create a minimal security configuration (no special restrictions). */`
- Issue: Restates function name

**Line 60-62:** `/** Security profiles for common use cases. */`
- Issue: Restates constant name

**Line 64:** `/** Maximum security - read-only rootfs, no privilege escalation */`
- Issue: Restates what the config does; evident from the function it calls

**Line 66:** `/** Minimal restrictions */`
- Issue: Restates constant name

**Line 72-74:** `/** Common seccomp profile locations. */`
- Issue: Restates constant name

**Line 76:** `/** Default Podman seccomp profile */`
- Issue: Restates value meaning

---

### `src/quadlet/container/user.ts`

**Line 22-24:** `/** Format keep-id mode with optional uid/gid. */`
- Issue: Restates function name

**Line 42-44:** `/** Convert user namespace config to INI entries. */`
- Issue: Restates function name

**Line 73-76:** `/** Create a keep-id user namespace configuration. This maps the container root to the host user. */`
- Issue: Restates function name

**Line 83-85:** `/** Create an auto user namespace configuration. */`
- Issue: Restates function name

**Line 116-118:** `/** Check if a user namespace uses UID/GID mapping that differs from the default. */`
- Issue: Restates function name

**Line 137-139:** `/** User namespace modes. */`
- Issue: Restates constant name

**Line 158-160:** `/** Determine the best user namespace mode for a use case. */`
- Issue: Restates function name

---

### `src/quadlet/container/volumes.ts`

**Line 31-33:** `/** Format a volume mount for quadlet. */`
- Issue: Restates function name

**Line 46-48:** `/** Create a bind mount */`
- Issue: Restates function name

**Line 55-57:** `/** Create a read-only bind mount. */`
- Issue: Restates function name

**Line 64-66:** `/** Create a named volume mount */`
- Issue: Restates function name

**Line 77-79:** `/** Create a mount with SELinux relabeling. */`
- Issue: Restates function name

**Line 90-92:** `/** Common mount paths. */`
- Issue: Restates constant name

**Line 94:** `/** /etc/localtime for timezone */`
- Issue: Restates key name and path

**Line 100-102:** `/** Check if a source is a named volume (ends with .volume). */`
- Issue: Restates function name and implementation detail

**Line 107-109:** `/** Check if a source is an absolute path (bind mount). */`
- Issue: Restates function name and implementation detail

**Line 114-116:** `/** Check if volume options already include SELinux relabeling (:z or :Z). */`
- Issue: Restates function name

**Line 125-127:** `/** Check if volume options already include ownership flag (:U). */`
- Issue: Restates function name

**Line 136-140:** `/** Add SELinux relabel option to a single volume mount if needed. Only applies to bind mounts... */`
- Issue: Restates function name; behavior details already evident from code

**Line 194-197:** `/** Apply SELinux relabeling to all volumes in an array. Returns undefined if input is undefined... */`
- Issue: Restates function name and return behavior evident from signature

**Line 208-210:** `/** Options for processing volumes. */`
- Issue: Restates interface name

**Line 218-220:** `/** Process volumes */`
- Issue: Restates function name

---

### `src/quadlet/entry-combinators.ts`

**Line 19-21:** `// ─────────────────────────────────────────────────────────────────────────────`
- Issue: Section markers

**Line 23-25:** `/** Convert Option<Entries> to Entries, returning empty for None. */`
- Issue: Restates function name and behavior evident from signature

**Line 29-31:** `// ─────────────────────────────────────────────────────────────────────────────`
- Issue: Section markers

**Line 33-35:** `/** Format primitive values to strings. */`
- Issue: Restates function name

**Line 54-57:** `/** Lift a value into an Entry if defined, otherwise return empty. Delegates to fromMaybe with formatPrimitive. */`
- Issue: Restates behavior evident from signature; delegation detail is marginally useful

**Line 61-63:** `// ─────────────────────────────────────────────────────────────────────────────`
- Issue: Section markers

**Line 65-67:** `/** Map an array of strings to entries with the same key. */`
- Issue: Restates function name

**Line 75-77:** `/** Map an array with a custom formatter. */`
- Issue: Restates function name

**Line 89-91:** `// ─────────────────────────────────────────────────────────────────────────────`
- Issue: Section markers

**Line 113-115:** `// ─────────────────────────────────────────────────────────────────────────────`
- Issue: Section markers

**Line 117-119:** `/** Concatenate multiple entry arrays into one. */`
- Issue: Restates function name

**Line 122-124:** `// ─────────────────────────────────────────────────────────────────────────────`
- Issue: Section markers

**Line 126-128:** `/** Conditionally include an entry based on a predicate. */`
- Issue: Restates function name

---

## Batch 13

### `src/quadlet/entry.ts`

**Line 14-16:** `/** An INI entry - the fundamental unit of quadlet configuration. */`
- Issue: Restates interface name

**Line 22-24:** `/** Type alias for a collection of entries. */`
- Issue: Restates type alias purpose

**Line 27-29:** `/** Empty entries - empty starting point for entry arrays. */`
- Issue: Restates constant name

---

### `src/quadlet/factory.ts`

**Line 20-25:** `/** Factory for simple quadlet generators (network, volume pattern). Handles optional Unit section... */`
- Issue: Restates function name; isolatedDeclarations note is useful though

---

### `src/quadlet/format.ts`

**Line 18-20:** `/** Section in an INI file. */`
- Issue: Restates interface name

**Line 28:** `/** Escape double quotes with backslash */`
- Issue: Describes what the map does; evident from variable name and value

**Line 32-35:** `/** Escape a value for INI file format. Handles special characters and quoting. */`
- Issue: Restates function name

**Line 43-45:** `/** Format a single INI section. */`
- Issue: Restates function name

**Line 55-57:** `/** Format multiple sections into a complete INI file. */`
- Issue: Restates function name

**Line 66-68:** `/** Standard section ordering for quadlet files. */`
- Issue: Restates constant name

**Line 78-80:** `/** Get the sort order index for a section (unknown sections go at the end). */`
- Issue: Restates function name; fallback behavior is marginally useful

**Line 86-88:** `/** Order instance for IniSection based on standard quadlet section ordering. */`
- Issue: Restates variable purpose

**Line 91-93:** `/** Sort sections in the standard order. */`
- Issue: Restates function name

**Line 97-99:** `/** Create a formatted quadlet file with properly ordered sections. */`
- Issue: Restates function name

---

### `src/quadlet/index.ts`

**Line 16:** `// Entry types`
- Issue: Section marker

**Line 20:** `// Entry builders`
- Issue: Section marker

**Line 31:** `// Section and quadlet generators`
- Issue: Section marker

**Line 35:** `// Types`
- Issue: Section marker

**Line 49:** `// Format utilities`
- Issue: Section marker

**Line 60:** `// Unit section`
- Issue: Section marker

**Line 70:** `// Service section`
- Issue: Section marker

**Line 78:** `// Install section`
- Issue: Section marker

**Line 86:** `// Network quadlet`
- Issue: Section marker

**Line 94:** `// Volume quadlet`
- Issue: Section marker

**Line 102:** `// Container quadlet (includes all sub-modules)`
- Issue: Section marker

**Lines 106, 111, 118, 132, 138, 144, 153, 159, 165, 170, 179:** `// Image`, `// Network`, `// Volumes`, etc.
- Issue: Section markers for export groups

---

### `src/quadlet/install.ts`

**Line 28-30:** `/** Build the [Install] section for a quadlet file. */`
- Issue: Restates function name

**Line 34-36:** `/** Common install targets. */`
- Issue: Restates constant name

**Line 42:** `/** Graphical target */`
- Issue: Restates value name

---

## Batch 14

### `src/quadlet/network.ts`

**Line 33-35:** `/** Build the [Network] section. */`
- Issue: Restates function name

**Line 41-43:** `/** Generate a complete network quadlet file. */`
- Issue: Restates function name

**Line 47-49:** `/** Create a simple internal bridge network configuration. */`
- Issue: Restates function name

**Line 57-59:** `/** Create a network with external connectivity. */`
- Issue: Restates function name

---

### `src/quadlet/section-factory.ts`

**Line 17-22:** `/** Factory for creating section builders. Eliminates boilerplate: (name, getEntries) → (config → IniSection). Note: Explicit return type required for isolatedDeclarations. */`
- Issue: Partially restates function signature; isolatedDeclarations note is useful context

---

### `src/quadlet/service.ts`

**Line 31-33:** `/** Build the [Service] section for a quadlet file. */`
- Issue: Restates function name

**Line 39-41:** `/** Create a default service configuration. */`
- Issue: Restates function name

**Line 49-52:** `/** Merge service configurations with defaults. Always falls back to system defaults for undefined values. */`
- Issue: Describes what the function does

---

### `src/quadlet/types.ts`

**Line 26-28:** `/** Port mapping configuration. */`
- Issue: Restates interface name

**Line 40-42:** `/** Volume mount configuration. */`
- Issue: Restates interface name

**Line 52-55:** `/** Secret mount configuration. Maps a podman secret to a container. */`
- Issue: Restates interface name

**Line 67-69:** `/** Health check configuration. */`
- Issue: Restates interface name

**Line 85-87:** `/** User namespace configuration discriminated union. */`
- Issue: Restates type alias name

**Line 97-99:** `/** Service section configuration for systemd. */`
- Issue: Restates interface name

**Line 155-157:** `/** Network quadlet configuration. */`
- Issue: Restates interface name

**Line 181-183:** `/** Volume quadlet configuration. */`
- Issue: Restates interface name

**Line 197-199:** `/** Generated quadlet file. */`
- Issue: Restates interface name

---

### `src/quadlet/unit.ts`

**Line 39-42:** `/** Helper: create optional field from Option. Stays in Option until the final extraction. */`
- Issue: Restates function name; deferred extraction note is marginally useful

**Line 66-68:** `/** Build the [Unit] section for a quadlet file. */`
- Issue: Restates function name

**Line 74-77:** `/** Convert container names to systemd unit names. Quadlet containers become <name>.service units. */`
- Issue: Restates function name; clarification about .service suffix is marginally useful

**Line 82-84:** `/** Convert unit names back to container names. */`
- Issue: Restates function name

**Line 88-89:** `/** Build unit dependencies from container names. */`
- Issue: Restates function name

---

## Batch 15

### `src/quadlet/volume.ts`

**Line 28-30:** `/** Build the [Volume] section. */`
- Issue: Restates function name

**Line 36-38:** `/** Generate a complete volume quadlet file. */`
- Issue: Restates function name

**Line 42-44:** `/** Create a simple named volume configuration. */`
- Issue: Restates function name

**Line 50-52:** `/** Create a volume with specific driver options. */`
- Issue: Restates function name

---

### `src/services/actual/commands/backup.ts`

**Line 46-48:** `/** Create archive metadata for a backup. */`
- Issue: Restates function name

**Line 56-59:** `/** Create a backup of the Actual data directory. Creates a compressed tar archive using Bun.Archive. */`
- Issue: Restates function name and implementation detail

**Line 66:** `// Check data directory exists`
- Issue: Describes what the code does

**Line 84:** `// Ensure backup directory exists`
- Issue: Describes what the code does

**Line 91:** `// Create metadata and archive`
- Issue: Describes what the code does

**Line 101:** `// Get backup size using stat for accuracy`
- Issue: Describes what the code does

**Line 109-111:** `/** List available backups. */`
- Issue: Restates function name

**Line 124:** `// Use shared utility - returns files sorted by mtime (newest first)`
- Issue: Describes what the utility does

**Lines 129-131:** `// ============================================================================ // Restore Helper Functions // ============================================================================`
- Issue: Section markers

**Line 137:** `/** Predicate: parent dir differs from data dir and needs creation */`
- Issue: Describes what the predicate checks

**Line 141:** `/** Extract parent directory from path, None if at root */`
- Issue: Restates function name

**Line 147:** `/** Validate filename and fail with BackupError if unsafe */`
- Issue: Restates function name

**Line 162:** `/** Ensure parent directory exists if needed */`
- Issue: Restates function name

**Line 178:** `/** Write single file with validation */`
- Issue: Restates function name

**Lines 203-205:** `// ============================================================================ // Restore Command // ============================================================================`
- Issue: Section markers

**Line 207-209:** `/** Restore from a backup archive. */`
- Issue: Restates function name

**Line 218:** `// Check backup file exists`
- Issue: Describes what the code does

**Line 233:** `// Read and decompress archive`
- Issue: Describes what the code does

**Line 236:** `// Read and validate metadata`
- Issue: Describes what the code does

**Line 254:** `// Extract archive`
- Issue: Describes what the code does

**Line 257:** `// Filter metadata, then write files sequentially`
- Issue: Describes what the code does

---

### `src/services/actual/config.ts`

**Line 16-18:** `/** ActualConfigTag identifier type. */`
- Issue: Restates interface name

---

### `src/services/actual/index.ts`

**Line 45-47:** `/** Actual service definition. */`
- Issue: Restates constant name

**Line 70-72:** `/** Validate Actual configuration file. */`
- Issue: Restates function name

**Line 75-78:** `/** Generate all files for Actual service. Dependencies accessed via Effect context. */`
- Issue: Restates function name; "Dependencies accessed via Effect context" is repetitive boilerplate

**Line 88:** `// Build container quadlet`
- Issue: Describes what the code does

**Line 129:** `// Security`
- Issue: Section marker

**Lines 156-158:** `// ============================================================================ // Setup Step Output Types // ============================================================================`
- Issue: Section markers

**Line 160-161:** `/** Output from generate step */`
- Issue: Restates interface name

**Line 165-166:** `/** Output from create directories step */`
- Issue: Restates interface name

**Line 170-171:** `/** Output from write files step */`
- Issue: Restates interface name

**Line 175-176:** `/** Output from enable services step */`
- Issue: Restates interface name

**Lines 180-182:** `// ============================================================================ // Setup Steps // ============================================================================`
- Issue: Section markers

**Line 272-274:** `/** Full setup for Actual service. Dependencies accessed via Effect context. */`
- Issue: Restates function name with repetitive context note

**Line 288-290:** `/** Backup Actual data. Dependencies accessed via Effect context. */`
- Issue: Restates function name with repetitive context note

**Line 312-314:** `/** Restore Actual data from backup. Dependencies accessed via Effect context. */`
- Issue: Restates function name with repetitive context note

**Line 337-339:** `/** Actual service implementation. */`
- Issue: Restates constant name

---

### `src/services/actual/schema.ts`

**Line 17-19:** `/** Actual Budget configuration (output after decoding). */`
- Issue: Restates interface name

**Line 48-51:** `/** Actual Budget configuration (input before decoding). Fields with defaults are optional in input. */`
- Issue: Restates interface name; second sentence is marginally useful

**Line 102-104:** `/** Default configuration values. */`
- Issue: Restates constant name

---

## Batch 16

### `src/services/caddy/caddyfile/directives.ts`

**Lines 18-20:** `// ============================================================================ // String Rendering // ============================================================================`
- Issue: Section markers

**Line 22-24:** `/** Render a single directive. */`
- Issue: Restates function name

**Line 40-42:** `/** Render multiple directives. */`
- Issue: Restates function name

**Lines 46-48:** `// ============================================================================ // CaddyOp Functions // ============================================================================`
- Issue: Section markers

**Line 50-52:** `/** Convert a single directive to CaddyOp. */`
- Issue: Restates function name

**Line 69-71:** `/** Convert multiple directives to CaddyOp. */`
- Issue: Restates function name

**Lines 75-77:** `// ============================================================================ // Common Directive Builders // ============================================================================`
- Issue: Section markers

**Line 80-82:** `/** reverse_proxy directive */`
- Issue: Restates the key name

**Line 102-104:** `/** file_server directive */`
- Issue: Restates the key name

**Line 114-116:** `/** encode directive */`
- Issue: Restates the key name

**Line 122-124:** `/** header directive */`
- Issue: Restates the key name

**Line 133-135:** `/** respond directive */`
- Issue: Restates the key name

**Line 141-143:** `/** redir directive */`
- Issue: Restates the key name

**Line 149-151:** `/** rewrite directive */`
- Issue: Restates the key name

**Line 157-159:** `/** log directive */`
- Issue: Restates the key name

**Line 170-172:** `/** tls directive */`
- Issue: Restates the key name

**Line 194-196:** `/** basicauth directive */`
- Issue: Restates the key name

**Line 205-207:** `/** import directive (for snippets) */`
- Issue: Restates the key name

**Line 213-215:** `/** handle directive */`
- Issue: Restates the key name

**Line 221-223:** `/** handle_path directive (strips matched path prefix) */`
- Issue: Restates key name; parenthetical is marginally useful

**Line 230-232:** `/** route directive (maintains order) */`
- Issue: Restates key name; parenthetical is marginally useful

---

### `src/services/caddy/caddyfile/format.ts`

**Lines 20-22:** `// ============================================================================ // Value Escaping // ============================================================================`
- Issue: Section markers

**Line 24:** `/** Escape double quotes with backslash */`
- Issue: Describes what the map does; evident from the map content

**Line 28-30:** `/** Escape a value for Caddyfile format. */`
- Issue: Restates function name

**Line 44-46:** `/** Create indentation string. */`
- Issue: Restates function name

**Line 49-51:** `/** Join arguments with proper escaping. */`
- Issue: Restates function name

**Line 54-56:** `/** Format a block opening. */`
- Issue: Restates function name

**Line 62-64:** `/** Format a simple line (name + args). */`
- Issue: Restates function name

**Lines 68-70:** `// ============================================================================ // Immutable State // ============================================================================`
- Issue: Section markers

**Line 72-74:** `/** Caddyfile builder state. */`
- Issue: Restates interface name

**Line 80:** `/** Initial empty state */`
- Issue: Restates constant name

**Lines 86-88:** `// ============================================================================ // State Transformers // ============================================================================`
- Issue: Section markers

**Line 112:** `/** Render final output from state */`
- Issue: Restates function name

**Lines 116-118:** `// ============================================================================ // CaddyOp: State Transformer // ============================================================================`
- Issue: Section markers

**Line 133-135:** `/** Combine multiple CaddyOps into one. */`
- Issue: Restates function name

**Lines 138-140:** `// ============================================================================ // DSL Operations // ============================================================================`
- Issue: Section markers

**Line 143:** `/** Identity operation - does nothing. */`
- Issue: Restates constant name

**Line 146:** `/** Add a line at current indentation */`
- Issue: Restates function signature

**Line 149:** `/** Add an empty line */`
- Issue: Restates constant name

**Line 152:** `/** Add a comment */`
- Issue: Restates function name

**Line 155:** `/** Open a block: add opening line and increase indent */`
- Issue: Describes what the function does

**Line 159:** `/** Close a block: decrease indent and add closing brace */`
- Issue: Describes what the function does

**Line 162:** `/** Add a directive (name + optional args) */`
- Issue: Restates function signature

**Line 166:** `/** Add raw content (splits on newlines, each line indented) */`
- Issue: Describes what the function does

**Line 182-184:** `/** Conditional directive: add only if value is defined. */`
- Issue: Restates function name

**Line 194:** `/** Conditional directive with number conversion */`
- Issue: Restates function name

**Lines 204-207:** `/** Sequence operations (variadic). seq(a, b, c) applies a, then b, then c. */`
- Issue: Restates function behavior

**Lines 210-213:** `/** Sequence operations from array. Useful for dynamic operation lists. */`
- Issue: Restates function name

**Lines 216-218:** `/** Apply function to each item and combine results. */`
- Issue: Restates function behavior

**Lines 222-225:** `/** FlatMap over array and sequence results. Each item can produce multiple operations. */`
- Issue: Restates function behavior

**Lines 229-231:** `// ============================================================================ // Builder Function (main entry point) // ============================================================================`
- Issue: Section markers

---

### `src/services/caddy/caddyfile/global.ts`

**Lines 30-32:** `// ============================================================================ // Helper Functions // ============================================================================`
- Issue: Section markers

**Lines 34-37:** `/** Server config to operations. Uses flatMapEntries instead of for loop. */`
- Issue: Restates function name; implementation note

**Lines 52-55:** `/** Server block operations. Returns id (no-op) if no servers configured. */`
- Issue: Restates function name; behavior is evident from code

**Lines 65-67:** `/** Log block operations. */`
- Issue: Restates function name

**Lines 78-79:** `/** Admin block operations - uses pattern matching style. */`
- Issue: Restates function name; implementation note

**Lines 91-93:** `// ============================================================================ // Main Functions // ============================================================================`
- Issue: Section markers

**Lines 95-98:** `/** Generate global options operations. Returns CaddyOp for composition, not string. */`
- Issue: Restates function name; return type distinction is marginally useful

**Lines 117-120:** `/** Generate the global options block as string. Wrapper around globalOps for backward compatibility. */`
- Issue: Restates function name

**Lines 124-126:** `/** Check if global options block is needed. */`
- Issue: Restates function name

---

### `src/services/caddy/caddyfile/index.ts`

**Lines 20-23:** `/** Generate a complete Caddyfile from configuration. Composes operations from each module. */`
- Issue: Restates function name

**Line 29:** `// Header comment`
- Issue: Describes what follows

**Line 35:** `// Global options - use Option.match for exhaustive handling`
- Issue: Describes what; implementation note

**Line 45:** `// Snippets`
- Issue: Describes what follows

**Line 55:** `// Sites (always present)`
- Issue: Describes what follows

**Line 61:** `// Re-export all sub-modules`
- Issue: Describes what follows

**Line 63:** `// format.ts - CaddyOp DSL and utilities`
- Issue: Describes what the exports are

**Lines 75, 78, 87, 97, 106:** `// global.ts`, `// snippets.ts`, `// matchers.ts`, `// directives.ts`, `// sites.ts`
- Issue: Section markers naming modules

---

### `src/services/caddy/caddyfile/matchers.ts`

**Lines 21-23:** `// ============================================================================ // Record → CaddyOp[] Transformers // ============================================================================`
- Issue: Section markers

**Lines 25-28:** `/** Transform header record to operations. Uses mapEntries instead of for loop over Object.entries. */`
- Issue: Restates function name; implementation note

**Lines 34-36:** `/** Transform header regexp record to operations. */`
- Issue: Restates function name

**Lines 44-46:** `/** Transform query record to operations. */`
- Issue: Restates function name

**Lines 52-55:** `/** Negation block operations. Returns id (no-op) if not is undefined. */`
- Issue: Restates function name; behavior is evident from code

**Lines 67-69:** `/** Conditional directive for array-valued options. */`
- Issue: Restates function name

**Lines 79-81:** `// ============================================================================ // Main Functions // ============================================================================`
- Issue: Section markers

**Lines 83-86:** `/** Generate operations for a single named matcher. Returns CaddyOp for composition with other operations. */`
- Issue: Restates function name

**Lines 122-124:** `/** Generate operations for multiple matchers. */`
- Issue: Restates function name

**Lines 128-130:** `// ============================================================================ // String-returning functions // ============================================================================`
- Issue: Section markers

**Lines 132-135:** `/** Generate a named matcher definition as string. Wrapper around matcherOps for backward compatibility. */`
- Issue: Restates function name

**Lines 139-141:** `/** Generate all named matchers as string. */`
- Issue: Restates function name

**Lines 145-147:** `// ============================================================================ // Utilities // ============================================================================`
- Issue: Section markers

**Line 149:** `/** Generate a matcher reference for use in directives. */`
- Issue: Restates function name

**Lines 152-155:** `/** Check if a matcher is empty (has no conditions). Uses Option for null-safe checking. */`
- Issue: Restates function name; implementation note

---

## Batch 17

### `src/services/caddy/caddyfile/sites.ts`

**Lines 22-24:** `// ============================================================================ // CaddyOp Functions // ============================================================================`
- Issue: Section markers

**Lines 26-28:** `/** Determine the route opener based on route config. */`
- Issue: Restates function name

**Lines 43-45:** `/** Generate operations for a single route. */`
- Issue: Restates function name

**Lines 49-51:** `/** Generate operations for a single site. */`
- Issue: Restates function name

**Line 58:** `// Site address(es)`
- Issue: Describes what follows

**Line 61:** `// Named matchers (if any)`
- Issue: Describes what follows

**Line 71:** `// Routes (if any)`
- Issue: Describes what follows

**Line 85:** `// Direct directives (if any)`
- Issue: Describes what follows

**Lines 98-101:** `/** Generate operations for multiple sites. Intersperse with blank lines. */`
- Issue: Restates function name

**Lines 116-118:** `// ============================================================================ // String-returning functions (backward compatibility) // ============================================================================`
- Issue: Section markers

**Lines 120-122:** `/** Generate a route block as string. */`
- Issue: Restates function name

**Lines 125-127:** `/** Generate a site block as string. */`
- Issue: Restates function name

**Lines 130-132:** `/** Generate all sites as string. */`
- Issue: Restates function name

**Lines 136-138:** `// ============================================================================ // Site Factory Helpers // ============================================================================`
- Issue: Section markers

**Lines 141-143:** `/** Simple reverse proxy site */`
- Issue: Restates key name

**Lines 149-151:** `/** Static file server site */`
- Issue: Restates key name

**Lines 162-164:** `/** Redirect site */`
- Issue: Restates key name

**Lines 170-172:** `/** PHP-FPM site */`
- Issue: Restates key name

---

### `src/services/caddy/caddyfile/snippets.ts`

**Lines 21-23:** `// ============================================================================ // CaddyOp Functions // ============================================================================`
- Issue: Section markers

**Lines 25-27:** `/** Format snippet name with optional args. */`
- Issue: Restates function name

**Lines 37-39:** `/** Generate operations for a single snippet. */`
- Issue: Restates function name

**Lines 43-46:** `/** Generate operations for multiple snippets. Uses forEach for iteration. */`
- Issue: Restates function name; implementation note

**Lines 50-52:** `// ============================================================================ // String-returning functions // ============================================================================`
- Issue: Section markers

**Lines 54-56:** `/** Generate a snippet definition as string. */`
- Issue: Restates function name

**Lines 59-61:** `/** Generate all snippets as string. */`
- Issue: Restates function name

**Lines 65-67:** `/** Returns import directive string. */`
- Issue: Restates function name

---

### `src/services/caddy/commands/reload.ts`

**Line 48:** `// Caddyfile path inside the container`
- Issue: Describes what the variable is

**Line 53:** `// First, validate the Caddyfile using podman exec`
- Issue: Describes what the code does

**Line 81:** `// Reload via admin API using podman exec`
- Issue: Describes what the code does

**Lines 110-113:** `/** Validate a Caddyfile without reloading. Uses podman exec to run caddy validate inside the container. */`
- Issue: Restates function name; implementation note

**Lines 147-150:** `/** Format a Caddyfile using caddy fmt. Uses podman exec to run caddy fmt inside the container. */`
- Issue: Restates function name; implementation note

---

### `src/services/caddy/config.ts`

**Lines 16-18:** `/** CaddyConfigTag identifier type. */`
- Issue: Restates interface name

---

### `src/services/caddy/index.ts`

**Lines 50-52:** `/** Caddy service definition. */`
- Issue: Restates constant name

**Lines 66-69:** `/** Single-container operations for Caddy. Uses Effect context - no ctx parameter needed. */`
- Issue: Restates variable name; repetitive boilerplate

**Lines 75-77:** `/** Validate Caddy configuration file. */`
- Issue: Restates function name

**Lines 80-83:** `/** Generate all files for Caddy service. Dependencies accessed via Effect context. */`
- Issue: Restates function name; repetitive boilerplate

**Line 94:** `// Validate mapHostLoopback if provided`
- Issue: Describes what the code does

**Line 108:** `// Generate Caddyfile`
- Issue: Describes what the code does

**Line 111:** `// Generate volume quadlet for caddy data`
- Issue: Describes what the code does

**Line 117:** `// Generate volume quadlet for caddy config`
- Issue: Describes what the code does

**Line 123:** `// Generate container quadlet`
- Issue: Describes what the code does

**Line 172:** `// Return GeneratedFiles with pre-built Maps (no mutations)`
- Issue: Describes what; "(no mutations)" is marginally useful context

**Lines 185-187:** `// ============================================================================ // Setup Step Output Types // ============================================================================`
- Issue: Section markers

**Lines 189-191:** `/** Output from generate step */`
- Issue: Restates interface name

**Lines 194-196:** `/** Output from write files step */`
- Issue: Restates interface name

**Lines 199-201:** `/** Output from enable services step */`
- Issue: Restates interface name

**Lines 204-206:** `// ============================================================================ // Setup Steps // ============================================================================`
- Issue: Section markers

**Lines 261-264:** `/** Full setup for Caddy service. Dependencies accessed via Effect context. */`
- Issue: Restates function name; repetitive boilerplate

**Lines 276-279:** `/** Reload Caddy configuration. Dependencies accessed via Effect context. */`
- Issue: Restates function name; repetitive boilerplate

**Lines 297-299:** `/** Caddy service implementation. */`
- Issue: Restates constant name

---

## Batch 18

### `src/services/caddy/schema.ts`

**Lines 8-10:** `/** Caddy service configuration schema. */`
- Issue: Restates file name

**Lines 43-45:** `/** Directive schema - recursive for nested directives. */`
- Issue: Restates variable name

**Line 73:** `// Extract matcher fields for reuse in 'not' (without name)`
- Issue: Describes what the code does

**Lines 87-89:** `/** Named matcher schema. */`
- Issue: Restates variable name

**Lines 96-99:** `/** Snippet schema. */` and `/** Caddyfile snippet */`
- Issue: Restates schema/interface name

**Lines 112-114:** `/** Caddyfile route. */`
- Issue: Restates interface name

**Lines 127-129:** `/** Caddyfile site. */`
- Issue: Restates interface name

**Lines 144-146:** `/** Caddy global options. */`
- Issue: Restates interface name

**Lines 214-216:** `/** Caddyfile configuration. */`
- Issue: Restates interface name

**Lines 256-258:** `/** Caddy container configuration (input before decoding). */`
- Issue: Restates type name

**Lines 348-350:** `/** Network configuration schema. */`
- Issue: Restates variable name

**Lines 355-357:** `/** Full Caddy service configuration (output after decoding). */`
- Issue: Restates interface name

**Lines 371-373:** `/** Full Caddy service configuration (input before decoding). */`
- Issue: Restates interface name

---

### `src/services/context/index.ts`

**Lines 18-20:** `/** Service filesystem paths value type. */`
- Issue: Restates interface name

**Lines 28-30:** `/** ServicePaths tag identifier type. */`
- Issue: Restates interface name

**Lines 35-38:** `/** Service filesystem paths context. Provides paths to data, quadlet, config, and home directories. */`
- Issue: Describes what the constant is

**Lines 44-46:** `/** Service user value type. */`
- Issue: Restates interface name

**Lines 53-55:** `/** ServiceUser tag identifier type. */`
- Issue: Restates interface name

**Lines 60-62:** `/** Service user context. Provides user identity information for running operations as service user. */`
- Issue: Describes what the constant is

**Lines 69-71:** `/** Service options value type. */`
- Issue: Restates interface name

**Lines 78-80:** `/** ServiceOptions tag identifier type. */`
- Issue: Restates interface name

**Lines 85-87:** `/** Service options context. Provides global CLI options for controlling behavior. */`
- Issue: Describes what the constant is

**Lines 94-96:** `/** System capabilities value type. */`
- Issue: Restates interface name

**Lines 101-103:** `/** SystemCapabilities tag identifier type. */`
- Issue: Restates interface name

**Lines 108-110:** `/** System capabilities context. Provides runtime-detected system capabilities. */`
- Issue: Describes what the constant is

**Lines 115-117:** `/** AppLogger tag identifier type. */`
- Issue: Restates interface name

**Lines 122-124:** `/** Application logger context. Provides structured logging throughout the application. */`
- Issue: Describes what the constant is

---

### `src/services/helpers.ts`

**Lines 43-45:** `// ============================================================================ // Core Tracking Types // ============================================================================`
- Issue: Section markers

**Lines 47-50:** `/** Result of an acquisition that tracks whether we created the resource. Pure data - no effects. */`
- Issue: Describes what; "Pure data - no effects" is redundant with interface

**Lines 56-58:** `/** Constructor for Acquired - pure function. */`
- Issue: Describes what

**Lines 64-66:** `/** Result tracking for file operations. */`
- Issue: Restates type name

**Lines 72-73:** `/** Constructors for FileWriteResult - pure functions. */`
- Issue: Describes what

**Lines 84-85:** `/** Result of writing multiple files. */`
- Issue: Restates interface name

**Lines 90-91:** `/** Result of enabling services. */`
- Issue: Restates interface name

**Lines 98-100:** `// ============================================================================ // Derivation Functions // ============================================================================`
- Issue: Section markers

**Lines 102-104:** `/** Derive paths that were created (not modified) from file write results. */`
- Issue: Restates function name

**Lines 110-112:** `/** Derive paths that were modified (have backups) from file write results. */`
- Issue: Restates function name

**Lines 120-122:** `/** Backup path naming convention - pure function. */`
- Issue: Describes what

**Lines 125-127:** `// ============================================================================ // File Writing Helpers // ============================================================================`
- Issue: Section markers

**Lines 129-131:** `/** Write a file and set ownership. */`
- Issue: Restates function name

**Lines 142-144:** `/** Write all generated files to their destinations. Dependencies accessed via Effect context. */`
- Issue: Restates function name; repetitive boilerplate

**Line 173:** `// Execute all sequentially`
- Issue: Describes what the code does

**Lines 178-180:** `// ============================================================================ // Effectful Resource Operations // ============================================================================`
- Issue: Section markers

**Lines 182-184:** `/** Write a single file with tracking. */`
- Issue: Restates function name

**Lines 210-213:** `/** Write generated files with tracking using Effect.forEach. Dependencies accessed via Effect context. */`
- Issue: Restates function name; repetitive boilerplate

**Line 224:** `// Collect all file entries with their destinations`
- Issue: Describes what the code does

**Line 245:** `// Sequential write with tracking`
- Issue: Describes what the code does

**Lines 255-258:** `/** Rollback file writes - delete created, restore modified. Derives rollback actions from pure FileWriteResult data. */`
- Issue: Restates function name

**Lines 275-277:** `/** Cleanup backups on success. */`
- Issue: Restates function name

**Lines 285-289:** `/** Enable services with tracking. Returns only the services we actually changed. Dependencies accessed via Effect context. */`
- Issue: Restates function name; repetitive boilerplate

**Line 298:** `// Check and enable each service, collecting what we changed`
- Issue: Describes what the code does

**Lines 351-354:** `/** Rollback service changes. Dependencies accessed via Effect context. */`
- Issue: Restates function name; repetitive boilerplate

**Lines 376-378:** `// ============================================================================ // Config Copy Operations // ============================================================================`
- Issue: Section markers

**Lines 380-382:** `/** Result of copying a config file. */`
- Issue: Restates interface name

**Lines 388-390:** `/** Copy config file with tracking and backup. */`
- Issue: Restates function name

**Lines 427-429:** `/** Rollback config copy based on result. */`
- Issue: Restates function name

**Lines 442-444:** `/** Cleanup config backup on success. */`
- Issue: Restates function name

**Lines 451-453:** `// ============================================================================ // Single-Container Service Operations // ============================================================================`
- Issue: Section markers

**Lines 460-463:** `/** Operations returned by createSingleContainerOps. No ctx parameter - dependencies in R type, resolved via yield*. */`
- Issue: Restates interface name; repetitive boilerplate

**Lines 490-493:** `/** Create standard start/stop/restart/status/logs for single-container services. Returns operations that access dependencies via Effect context. */`
- Issue: Restates function name

**Lines 576-578:** `// ============================================================================ // Backup Helper // ============================================================================`
- Issue: Section markers

**Lines 580-583:** `/** Wrap a backup function to return BackupResult with file stats. Uses stat() for accurate file size instead of lazy .size property. */`
- Issue: Restates function name

**Lines 597-599:** `// ============================================================================ // Outcome Type (Typed Alternative to Exit<unknown, unknown>) // ============================================================================`
- Issue: Section markers

**Lines 647-649:** `// ============================================================================ // Setup Step with Explicit State Types // ============================================================================`
- Issue: Section markers

**Lines 651-654:** `/** Release function receives exact state shape at release time. Must not fail (Effect<void, never, R>). */`
- Issue: Describes what

**Lines 671-673:** `/** Constructors - explicit distinction between pure and resource steps. */`
- Issue: Describes what

**Lines 697-699:** `// ============================================================================ // Base State and Accumulation // ============================================================================`
- Issue: Section markers

**Lines 712-714:** `// ============================================================================ // Pipeline Builder Pattern // ============================================================================`
- Issue: Section markers

**Lines 716-725:** `/** Fluent builder for composing setup pipelines. Each .then() call accumulates state, errors, and requirements. */`
- Issue: Restates interface name

**Lines 727-731:** `/** Append a step to the pipeline. Step's input must be compatible with S & Acc. Named andThen to avoid creating a "thenable" object that interferes with Promises. */`
- Issue: Restates method name

**Lines 736-739:** `/** Execute the pipeline within a scope. Registers finalizers for resource cleanup. */`
- Issue: Restates method name

**Lines 741-745:** `/** Get the number of steps in the pipeline. Useful for progress logging. */`
- Issue: Restates method name

**Lines 763-768:** `/** Indexed step for execution - pairs step with its 1-based index. */`
- Issue: Restates interface name

**Line 820:** `// Create indexed steps using Arr.map (pure, no loop)`
- Issue: Describes what the code does; "(pure, no loop)" is marginally useful

**Lines 831-834:** `// Chain steps into sequential Effect using Arr.reduce // Initial accumulator is Effect.succeed(initialState) // Each step transforms: Effect<State> -> Effect<NewState>`
- Issue: Describes what the code does

**Lines 844-846:** `// Execute the chain, discarding final state (we only care about side effects)`
- Issue: Describes what the code does

**Line 848-849:** `// Log success`
- Issue: Describes what the code does

**Lines 886-898:** `/** Create a new pipeline builder starting from initial state S. */`
- Issue: Restates function name

**Lines 901-903:** `// ============================================================================ // Config Validator Factory // ============================================================================`
- Issue: Section markers

**Lines 905-908:** `/** Create a config validator function for a service. Reduces boilerplate for the identical validate function in each service. */`
- Issue: Restates function name

**Lines 916-918:** `// ============================================================================ // Preview File Writing // ============================================================================`
- Issue: Section markers

**Lines 920-922:** `/** Write generated files without ownership changes (for preview/generate commands). */`
- Issue: Describes what the function does

---

### `src/services/immich/commands/backup.ts`

**Lines 8-10:** `/** Immich database backup command. */`
- Issue: Restates file name

**Lines 39-41:** `/** Get file extension for the compression method. */`
- Issue: Restates function name

**Lines 46-48:** `/** Create archive metadata for a backup. */`
- Issue: Restates function name

**Line 57:** `/** Data directory */`
- Issue: Restates field name

**Line 59:** `/** Service user */`
- Issue: Restates field name

**Line 61:** `/** Service user UID */`
- Issue: Restates field name

**Line 63:** `/** Logger instance */`
- Issue: Restates field name

**Line 65:** `/** Database container name */`
- Issue: Restates field name

**Line 67:** `/** Database name */`
- Issue: Restates field name

**Line 69:** `/** Database user */`
- Issue: Restates field name

**Line 71:** `/** Compression method (default: zstd) */`
- Issue: Restates field name

**Lines 75-77:** `/** Create a PostgreSQL database backup. Uses Bun.Archive to create a tar archive containing SQL dump and metadata. */`
- Issue: Restates function name; implementation note

**Line 101:** `// Ensure backup directory exists`
- Issue: Describes what the code does

**Line 104:** `// Run pg_dumpall inside the postgres container`
- Issue: Describes what the code does

**Line 125:** `// Create metadata and archive`
- Issue: Describes what the code does

**Lines 146-148:** `/** List available backups. */`
- Issue: Restates function name

**Line 161:** `// Use shared utility - returns files sorted by mtime (newest first)`
- Issue: Describes what the code does

---

### `src/services/immich/commands/restore.ts`

**Lines 8-10:** `/** Immich database restore command. */`
- Issue: Restates file name

**Lines 22-24:** `/** Detect compression format from file extension. */`
- Issue: Restates function name

**Line 41:** `/** Path to backup file */`
- Issue: Restates field name

**Line 43:** `/** Service user */`
- Issue: Restates field name

**Line 45:** `/** Service user UID */`
- Issue: Restates field name

**Line 47:** `/** Logger instance */`
- Issue: Restates field name

**Line 49:** `/** Database container name */`
- Issue: Restates field name

**Line 51:** `/** Database name */`
- Issue: Restates field name

**Line 53:** `/** Database user */`
- Issue: Restates field name

**Line 75:** `// Check backup file exists`
- Issue: Describes what the code does

**Line 104:** `// Read the backup file`
- Issue: Describes what the code does

**Line 107:** `// Read and validate metadata`
- Issue: Describes what the code does

**Line 126:** `// Extract archive`
- Issue: Describes what the code does

**Line 140:** `// Restore using psql`
- Issue: Describes what the code does

**Line 206:** `// Read and decompress the archive`
- Issue: Describes what the code does

**Line 209:** `// Attempt to extract - this validates both compression and tar format`
- Issue: Describes what the code does

**Line 212:** `// Check for database.sql`
- Issue: Describes what the code does

---

## Batch 19

### `src/services/immich/config.ts`

**Lines 16-18:** `/** ImmichConfigTag identifier type. */`
- Issue: Restates interface name

**Lines 23-26:** `/** Immich configuration context. Used to access service configuration in Effect generators via yield* ImmichConfigTag. */`
- Issue: Describes what the constant is

---

### `src/services/immich/constants.ts`

**Lines 8-11:** `/** Centralized constants for Immich service. All container names, network names, and default images defined here. */`
- Issue: Restates file name; describes what

**Line 13:** `/** Container names for all Immich components */`
- Issue: Restates constant name

**Line 21:** `/** Internal network name */`
- Issue: Restates constant name

**Line 24:** `/** Default container images */`
- Issue: Restates constant name

**Line 32:** `/** Internal service URLs (container-to-container) */`
- Issue: Restates constant name

---

### `src/services/immich/hardware/index.ts`

**Lines 28-30:** `/** Combined hardware configuration. */`
- Issue: Restates interface name

**Lines 36-38:** `/** Get combined hardware configuration. */`
- Issue: Restates function name

**Lines 47-49:** `// ============================================================================ // Type-safe source handling // ============================================================================`
- Issue: Section markers

**Lines 51-53:** `/** Discriminated union for device sources. */`
- Issue: Restates type name

**Lines 58-61:** `/** Factory functions for DeviceSource. Prefer these over raw object literals. */`
- Issue: Restates constant name

**Lines 70-73:** `/** Extract devices from a source using pattern matching. Handles all DeviceSource cases. */`
- Issue: Restates function name

**Lines 90-92:** `/** Extract environment from a source using pattern matching. */`
- Issue: Restates function name

**Lines 111-113:** `/** Wrap a raw source in DeviceSource. */`
- Issue: Restates function name

**Lines 119-121:** `/** Merge devices from multiple sources. */`
- Issue: Restates function name

**Lines 126-128:** `/** Merge environment variables from multiple sources. */`
- Issue: Restates function name

---

### `src/services/immich/hardware/ml.ts`

**Lines 19-21:** `/** ML hardware configuration. */`
- Issue: Restates interface name

**Line 23:** `/** Device paths to mount */`
- Issue: Restates field name

**Line 25:** `/** Environment variables to set */`
- Issue: Restates field name

**Line 27:** `/** Additional volume mounts */`
- Issue: Restates field name

**Line 29:** `/** Image suffix for the ML container */`
- Issue: Restates field name

**Lines 33-35:** `/** Get configuration for NVIDIA CUDA ML acceleration. */`
- Issue: Restates function name

**Lines 49-51:** `/** Get configuration for Intel OpenVINO ML acceleration. */`
- Issue: Restates function name

**Lines 58-60:** `/** Get configuration for ARM NN ML acceleration. */`
- Issue: Restates function name

**Lines 67-69:** `/** Get configuration for Rockchip NPU ML acceleration. */`
- Issue: Restates function name

**Lines 76-78:** `/** Get configuration for AMD ROCm ML acceleration. */`
- Issue: Restates function name

**Lines 87-89:** `/** Get configuration for CPU-only ML (no acceleration). */`
- Issue: Restates function name

**Lines 96-98:** `/** Get ML device configuration for a config. */`
- Issue: Restates function name

**Lines 111-113:** `/** Get the full ML container image with suffix. */`
- Issue: Restates function name

**Lines 133-135:** `/** Check if ML config requires special devices. */`
- Issue: Restates function name

---

### `src/services/immich/hardware/transcoding.ts`

**Lines 19-21:** `/** Device mapping for hardware transcoding. */`
- Issue: Restates interface name

**Line 23:** `/** Device paths to mount */`
- Issue: Restates field name

**Line 25:** `/** Environment variables to set */`
- Issue: Restates field name

**Line 27:** `/** Additional volume mounts */`
- Issue: Restates field name

**Lines 31-33:** `/** Get device mappings for NVIDIA NVENC transcoding. */`
- Issue: Restates function name

**Lines 46-48:** `/** Get device mappings for Intel Quick Sync Video. */`
- Issue: Restates function name

**Lines 54-56:** `/** Get device mappings for VA-API (Intel/AMD). */`
- Issue: Restates function name

**Lines 62-64:** `/** Get device mappings for VA-API in WSL. */`
- Issue: Restates function name

**Lines 71-73:** `/** Get device mappings for Rockchip MPP. */`
- Issue: Restates function name

**Lines 79-81:** `/** Get device mappings for a transcoding configuration. */`
- Issue: Restates function name

**Lines 96-98:** `/** Check if a transcoding configuration requires special devices. */`
- Issue: Restates function name

---

## Batch 20

### `src/services/immich/index.ts`

**Lines 8-12:** `/** Immich photo management service implementation. Multi-container service with hardware acceleration support. Uses Effect's context system - dependencies accessed via yield*. */`
- Issue: Describes what the file is

**Lines 80-82:** `/** Immich service definition. */`
- Issue: Restates constant name

**Lines 96-98:** `/** Validate Immich configuration file. */`
- Issue: Restates function name

**Lines 101-103:** `/** Generate all files for Immich service. Dependencies accessed via Effect context. */`
- Issue: Restates function name; repetitive boilerplate

**Line 115:** `// Get hardware configuration`
- Issue: Describes what the code does

**Line 121:** `// Get external library mounts`
- Issue: Describes what the code does

**Line 125:** `// Paths`
- Issue: Describes what follows

**Line 175:** `// Build containers immutably using array literal with conditional spread`
- Issue: Describes what the code does

**Line 182:** `// Redis container`
- Issue: Describes what follows

**Line 193:** `// PostgreSQL container`
- Issue: Describes what follows

**Line 212:** `// Main server container`
- Issue: Describes what follows

**Line 240:** `// Machine Learning container (conditional)`
- Issue: Describes what follows

**Line 267:** `// Build containers array immutably`
- Issue: Describes what the code does

**Line 275:** `// Create stack and generate quadlets`
- Issue: Describes what the code does

**Line 288:** `// Return GeneratedFiles with pre-built Maps (no mutations)`
- Issue: Describes what the code does

**Lines 298-300:** `// ============================================================================ // Setup Step Output Types // ============================================================================`
- Issue: Section markers

**Line 302:** `/** Output from secrets step */`
- Issue: Restates interface name

**Lines 307-308:** `/** Output from generate step */`
- Issue: Restates interface name

**Lines 312-313:** `/** Output from create directories step */`
- Issue: Restates interface name

**Lines 317-318:** `/** Output from write files step */`
- Issue: Restates interface name

**Lines 322-323:** `/** Output from enable services step */`
- Issue: Restates interface name

**Lines 327-329:** `// ============================================================================ // Setup Steps // ============================================================================`
- Issue: Section markers

**Lines 461-463:** `/** Full setup for Immich service. Dependencies accessed via Effect context. */`
- Issue: Restates function name; repetitive boilerplate

**Lines 478-480:** `/** Start Immich service. Dependencies accessed via Effect context. */`
- Issue: Restates function name; repetitive boilerplate

**Lines 507-509:** `/** Stop Immich service. Dependencies accessed via Effect context. */`
- Issue: Restates function name; repetitive boilerplate

**Lines 536-538:** `/** Restart Immich service. Dependencies accessed via Effect context. */`
- Issue: Restates function name; repetitive boilerplate

**Lines 552-554:** `/** Get Immich status. Dependencies accessed via Effect context. */`
- Issue: Restates function name; repetitive boilerplate

**Lines 606-608:** `/** View Immich logs. Dependencies accessed via Effect context. */`
- Issue: Restates function name; repetitive boilerplate

**Lines 628-630:** `/** Backup Immich database. Dependencies accessed via Effect context. */`
- Issue: Restates function name; repetitive boilerplate

**Lines 654-656:** `/** Restore Immich database. Dependencies accessed via Effect context. */`
- Issue: Restates function name; repetitive boilerplate

**Lines 680-682:** `/** Immich service implementation. */`
- Issue: Restates constant name

---

### `src/services/immich/libraries.ts`

**Lines 21-23:** `/** Generate library name from index if not provided. */`
- Issue: Restates function name

**Lines 27-29:** `/** Generate mount path for a library. */`
- Issue: Restates function name

**Lines 33-35:** `/** Convert a single external library to a volume mount. */`
- Issue: Restates function name

**Lines 42-44:** `/** Convert external libraries to volume mounts. */`
- Issue: Restates function name

**Lines 63-66:** `/** Validate external library paths exist. Returns Option of missing paths (None if all exist or empty input). */`
- Issue: Restates function name

---

### `src/services/immich/schema.ts`

**Lines 8-10:** `/** Immich service configuration schema. */`
- Issue: Restates file name

**Lines 18-20:** `/** Hardware acceleration configuration for video transcoding. */`
- Issue: Describes what the type is

**Lines 47-49:** `/** Hardware acceleration configuration for machine learning. */`
- Issue: Describes what the type is

**Lines 76-78:** `/** Hardware acceleration configuration (output after decoding). */`
- Issue: Describes what the interface is

**Lines 84-86:** `/** Hardware acceleration configuration (input before decoding). */`
- Issue: Restates interface name

**Lines 101-103:** `/** External library configuration (output after decoding). */`
- Issue: Describes what the interface is

**Lines 110-112:** `/** External library configuration (input before decoding). */`
- Issue: Restates interface name

**Lines 135-137:** `/** Database configuration (input before decoding). */`
- Issue: Restates interface name

**Lines 148-150:** `/** Container-specific configuration (output after decoding). */`
- Issue: Describes what the interface is

**Lines 160-162:** `/** Container-specific configuration (input before decoding). */`
- Issue: Restates interface name

**Lines 199-201:** `/** Network configuration (output after decoding). */`
- Issue: Describes what the interface is

**Line 203:** `/** Host port to bind (default: 2283) */`
- Issue: Restates field name

**Lines 209-211:** `/** Network configuration (input before decoding). */`
- Issue: Restates interface name

**Lines 228-230:** `/** Full Immich service configuration (output after decoding). */`
- Issue: Describes what the interface is

**Lines 248-250:** `/** Full Immich service configuration (input before decoding). */`
- Issue: Restates interface name

---

### `src/services/immich/secrets.ts`

**Lines 8-10:** `/** Secret definitions for Immich service. */`
- Issue: Restates file name

**Lines 14-16:** `/** All secrets required by Immich. */`
- Issue: Restates constant name

**Lines 25-27:** `/** Secret names for type-safe access. */`
- Issue: Restates constant name

---

### `src/services/index.ts`

**Lines 8-10:** `/** Service registry and exports - Effect-based. */`
- Issue: Restates file name

**Line 22:** `// Service registry`
- Issue: Restates variable name

**Lines 25-27:** `/** Register a service in the registry. */`
- Issue: Restates function name

**Lines 34-36:** `/** Get a service by name. */`
- Issue: Restates function name

**Lines 51-53:** `/** List all registered services. */`
- Issue: Restates function name

**Lines 58-60:** `/** Check if a service is registered. */`
- Issue: Restates function name

**Lines 65-67:** `/** Get all service names. */`
- Issue: Restates function name

**Line 72:** `// Re-export types from Effect version`
- Issue: Describes what follows

**Line 85:** `// Re-export context tags for CLI usage`
- Issue: Describes what follows

**Lines 96-98:** `/** Initialize all built-in services. */`
- Issue: Restates function name

---

### `src/services/types.ts`

**Lines 33-35:** `/** Service definition metadata. */`
- Issue: Restates interface name

**Line 37:** `/** Service name (lowercase, no spaces) */`
- Issue: Describes field name

**Line 39:** `/** Human-readable description */`
- Issue: Describes field name

**Line 41:** `/** Service version */`
- Issue: Restates field name

**Line 43:** `/** Service capabilities */`
- Issue: Restates field name

**Line 45:** `/** Multi-container service (uses stack orchestration) */`
- Issue: Describes what field is

**Line 47:** `/** Supports reload without restart */`
- Issue: Describes what field is

**Line 49:** `/** Supports backup command */`
- Issue: Restates field name

**Line 51:** `/** Supports restore command */`
- Issue: Restates field name

**Line 53:** `/** Has hardware acceleration options */`
- Issue: Restates field name

**Lines 58-60:** `/** Generated files from a service. */`
- Issue: Restates interface name

**Lines 69-71:** `/** Container status discriminated union. */`
- Issue: Restates type name

**Lines 91-93:** `/** Health check status discriminated union. */`
- Issue: Describes what type is

**Lines 99-101:** `/** Container information with status. */`
- Issue: Restates interface name

**Lines 108-110:** `/** Service status information. */`
- Issue: Restates interface name

**Lines 116-118:** `/** Log viewing options. */`
- Issue: Restates interface name

**Lines 125-127:** `/** Backup result. */`
- Issue: Restates interface name

**Line 144:** `/** Service definition (metadata) */`
- Issue: Restates field name

**Lines 147-148:** `/** Context tag for accessing this service's configuration */`
- Issue: Describes what field is

**Lines 150-151:** `/** Effect Schema for validating and decoding service configuration */`
- Issue: Describes what field is

**Line 154:** `// === Lifecycle Methods ===`
- Issue: Section marker

**Lines 156-159:** `/** Validate a configuration file. @param configPath Path to configuration file */`
- Issue: Restates method name; @param redundant with type

**Lines 162-165:** `/** Generate all files for the service. Dependencies accessed via Effect context. */`
- Issue: Restates method name; repetitive boilerplate

**Lines 172-175:** `/** Full setup: create user, directories, generate files, install quadlets. Dependencies accessed via Effect context. */`
- Issue: Lists implementation details that belong in file header, not method doc

**Line 187:** `// === Runtime Methods ===`
- Issue: Section marker

**Lines 189-191:** `/** Start the service. Dependencies accessed via Effect context. */`
- Issue: Restates method name; repetitive boilerplate

**Lines 199-201:** `/** Stop the service. Dependencies accessed via Effect context. */`
- Issue: Restates method name; repetitive boilerplate

**Lines 209-211:** `/** Restart the service. Dependencies accessed via Effect context. */`
- Issue: Restates method name; repetitive boilerplate

**Lines 219-221:** `/** Get service status. Dependencies accessed via Effect context. */`
- Issue: Restates method name; repetitive boilerplate

**Lines 229-232:** `/** View service logs. @param options Log viewing options. Dependencies accessed via Effect context. */`
- Issue: Restates method name; @param redundant with type; repetitive boilerplate

**Line 242:** `// === Optional Methods ===`
- Issue: Section marker

**Lines 244-247:** `/** Reload configuration without restart (if supported). Dependencies accessed via Effect context. */`
- Issue: Restates method name; repetitive boilerplate

**Lines 254-256:** `/** Create a backup (if supported). Dependencies accessed via Effect context. */`
- Issue: Restates method name; repetitive boilerplate

**Lines 264-268:** `/** Restore from backup (if supported). @param backupPath Path to backup file. Dependencies accessed via Effect context. */`
- Issue: Restates method name; @param redundant with type; repetitive boilerplate

**Lines 338-340:** `// ============================================================================ // GeneratedFiles Operations // ============================================================================`
- Issue: Section markers

**Lines 342-344:** `/** Merge two ReadonlyMaps. Right-biased (later values win). */`
- Issue: Restates function name

**Lines 348-350:** `/** Empty GeneratedFiles object. */`
- Issue: Restates constant name

**Lines 365-367:** `/** Merge two GeneratedFiles. Right-biased (later values win). */`
- Issue: Restates function name

**Lines 379-381:** `/** Concatenate multiple GeneratedFiles into one. */`
- Issue: Restates function name

**Lines 385-387:** `/** Merge multiple GeneratedFiles objects (variadic). */`
- Issue: Restates function name

**Lines 391-393:** `/** Get total file count from GeneratedFiles. */`
- Issue: Restates function name

---

### `src/stack/dependencies.ts`

**Lines 20-22:** `// ============================================================================ // Pure Graph Helper Functions // ============================================================================`
- Issue: Section markers

**Line 24:** `/** Get all dependencies (requires + wants) for a node */`
- Issue: Restates function name

**Lines 27-28:** `/** Get all dependencies for a container */`
- Issue: Restates function name

**Lines 33-34:** `/** Build a name->node lookup map */`
- Issue: Restates function name

**Lines 37-38:** `/** Build a name->container lookup map */`
- Issue: Restates function name

**Lines 41-42:** `/** Check if all dependencies are in a given set */`
- Issue: Restates function name

**Lines 45-47:** `// ============================================================================ // Graph Construction // ============================================================================`
- Issue: Section markers

**Lines 49-51:** `/** Build dependency graph from container definitions. */`
- Issue: Restates function name

**Lines 59-61:** `// ============================================================================ // Validation Functions // ============================================================================`
- Issue: Section markers

**Lines 63-65:** `/** Validate that all dependencies exist in the stack. */`
- Issue: Restates function name

**Lines 90-92:** `/** Detect cycles in the dependency graph. */`
- Issue: Restates function name

**Lines 116-117:** `// Find first cycle in dependencies (short-circuit with reduce)`
- Issue: Describes what code does

**Lines 130-131:** `// Check all nodes as starting points`
- Issue: Describes what code does

**Lines 153-155:** `// ============================================================================ // Topological Sort // ============================================================================`
- Issue: Section markers

**Line 157:** `/** State for Kahn's algorithm iteration */`
- Issue: Restates interface name

**Lines 165-168:** `/** Topological sort using Kahn's algorithm. Returns containers in order of startup (dependencies first). */`
- Issue: Restates function name

**Line 174:** `// Build initial adjacency and in-degree using reduce`
- Issue: Describes what code does

**Line 184:** `// Add edges (dependency -> dependent)`
- Issue: Describes what code does

**Lines 200-201:** `// Initial queue: nodes with zero in-degree`
- Issue: Describes what code does

**Lines 248-250:** `// ============================================================================ // Start/Stop Order Resolution // ============================================================================`
- Issue: Section markers

**Lines 252-253:** `/** State for level computation iteration */`
- Issue: Restates interface name

**Lines 259-262:** `/** Resolve start order with parallelization levels. Containers in the same level can start in parallel. */`
- Issue: Restates function name

**Lines 277-278:** `// Partition: ready (all deps placed) vs not ready`
- Issue: Describes what code does

**Lines 300-302:** `/** Resolve stop order (reverse of start order). */`
- Issue: Restates function name

**Lines 311-313:** `// ============================================================================ // Dependency Query Functions // ============================================================================`
- Issue: Section markers

**Lines 315-317:** `/** Get all containers that depend on a given container. */`
- Issue: Restates function name

**Lines 323-325:** `/** Get all dependencies of a container (transitive). */`
- Issue: Restates function name

**Lines 332-333:** `// Tail-recursive BFS with immutable state`
- Issue: Describes implementation detail

---

### `src/stack/environment.ts`

**Line 19:** `/** Characters requiring quoting in shell environment values */`
- Issue: Describes what constant is

**Lines 22-24:** `// ============================================================================ // Escape/Unescape State Machine // ============================================================================`
- Issue: Section markers

**Lines 26-27:** `/** Escape mapping: char -> escaped representation */`
- Issue: Restates constant name

**Lines 35-36:** `/** Unescape mapping: char after backslash -> unescaped char */`
- Issue: Restates constant name

**Lines 47-55:** `/** State for unescape processing. - escaped: true if previous char was backslash - result: accumulated output characters */`
- Issue: Restates interface name; describes fields

**Lines 57-59:** `/** Step function for unescape state machine. */`
- Issue: Restates function name

**Line 62:** `// We're in escape mode: look up the char, or pass through`
- Issue: Describes what code does

**Line 66-67:** `// Enter escape mode`
- Issue: Describes what code does

**Line 70-71:** `// Normal char: accumulate`
- Issue: Describes what code does

**Lines 84-86:** `/** Environment variable group. */`
- Issue: Restates interface name

**Lines 88-89:** `/** Group name (used in comment) */`
- Issue: Restates field name

**Lines 90-91:** `/** Environment variables */`
- Issue: Restates field name

**Lines 94-96:** `/** Environment file configuration. */`
- Issue: Restates interface name

**Lines 98-99:** `/** Header comment */`
- Issue: Restates field name

**Lines 100-101:** `/** Variable groups */`
- Issue: Restates field name

**Lines 104-106:** `/** Type-safe value-to-string conversion. */`
- Issue: Restates function name

**Lines 113-115:** `/** Unquote and unescape a parsed env value. */`
- Issue: Restates function name

**Lines 117-118:** `// Remove surrounding quotes if present`
- Issue: Describes what code does

**Lines 126-129:** `/** Escape a value for environment file format. Maps each character through ESCAPE_MAP. */`
- Issue: Restates function name; describes implementation

**Lines 131-132:** `// Early exit: no special chars -> return as-is`
- Issue: Describes what code does

**Lines 135-136:** `// Escape by mapping each char through ESCAPE_MAP`
- Issue: Describes what code does

**Lines 140-142:** `/** Format a single environment variable line. */`
- Issue: Restates function name

**Lines 146-148:** `/** Generate an environment file with grouped variables. */`
- Issue: Restates function name

**Lines 183-185:** `/** Generate an environment file from a flat record. */`
- Issue: Restates function name

**Lines 196-198:** `/** Parse an environment file into a record. */`
- Issue: Restates function name

**Lines 216-218:** `/** Merge multiple environment records. */`
- Issue: Restates function name

**Lines 235-237:** `/** Create common environment groups. */`
- Issue: Restates constant name

**Lines 242-243:** `/** Database connection */`
- Issue: Restates field name

**Lines 260-261:** `/** Redis connection */`
- Issue: Restates field name

**Lines 270-271:** `/** Basic server config */`
- Issue: Restates field name

---

### `src/stack/generator.ts`

**Lines 29-31:** `// ============================================================================ // Types // ============================================================================`
- Issue: Section markers

**Lines 33-35:** `/** Context for generating stack files. */`
- Issue: Restates interface name

**Lines 37-38:** `/** Environment file path (if using shared env file) */`
- Issue: Describes field

**Lines 39-40:** `/** User namespace configuration for all containers */`
- Issue: Describes field

**Lines 41-42:** `/** Default auto-update setting */`
- Issue: Restates field name

**Lines 43-44:** `/** Whether SELinux is in enforcing mode (for volume relabeling) */`
- Issue: Describes field

**Lines 47-49:** `// ============================================================================ // Helper Functions // ============================================================================`
- Issue: Section markers

**Line 51:** `/** Convert array of quadlets to Map (filename → content) */`
- Issue: Restates function name

**Lines 56-57:** `/** Build environment files list from context and container config */`
- Issue: Restates function name

**Lines 67-69:** `// ============================================================================ // Container Quadlet Conversion // ============================================================================`
- Issue: Section markers

**Lines 71-73:** `/** Convert a stack container to a full container quadlet config. */`
- Issue: Restates function name

**Lines 88-89:** `// Dependencies`
- Issue: Section marker within function

**Lines 91-92:** `// Network - use stack network`
- Issue: Describes what code does

**Lines 96-97:** `// Volumes (apply SELinux relabeling if enforcing)`
- Issue: Describes what code does

**Lines 99-100:** `// Environment`
- Issue: Section marker within function

**Lines 103-104:** `// Secrets`
- Issue: Section marker within function

**Lines 106-107:** `// User namespace`
- Issue: Section marker within function

**Lines 109-110:** `// Health check`
- Issue: Section marker within function

**Lines 112-113:** `// Security`
- Issue: Section marker within function

**Lines 119-120:** `// Resources`
- Issue: Section marker within function

**Lines 124-125:** `// Devices`
- Issue: Section marker within function

**Lines 127-128:** `// Misc`
- Issue: Section marker within function

**Lines 133-134:** `// Auto-update`
- Issue: Section marker within function

**Lines 136-137:** `// Service config`
- Issue: Section marker within function

**Lines 140-142:** `// ============================================================================ // Quadlet Generation Functions // ============================================================================`
- Issue: Section markers

**Line 144:** `/** Generate primary network quadlet if defined */`
- Issue: Restates function name

**Lines 157-158:** `/** Generate additional network quadlets */`
- Issue: Restates function name

**Line 168:** `/** Generate all network quadlets (primary + additional) */`
- Issue: Restates function name

**Lines 174-175:** `/** Generate all volume quadlets */`
- Issue: Restates function name

**Lines 184-185:** `/** Generate all container quadlets */`
- Issue: Restates function name

**Lines 193-195:** `// ============================================================================ // Public API // ============================================================================`
- Issue: Section markers

**Lines 197-199:** `/** Generate all quadlet files for a stack. */`
- Issue: Restates function name

**Lines 211-213:** `/** Get all filenames that would be generated for a stack. */`
- Issue: Restates function name

**Lines 221-223:** `/** Create a basic stack from a list of container configs. */`
- Issue: Restates function name

---

### `src/stack/index.ts`

**Line 13:** `// Types`
- Issue: Section marker

**Line 24:** `// Dependencies`
- Issue: Section marker

**Line 36:** `// Orchestrator`
- Issue: Section marker

**Line 49:** `// Environment`
- Issue: Section marker

**Line 61:** `// Generator`
- Issue: Section marker

---

### `src/stack/orchestrator.ts`

**Lines 44-46:** `// ============================================================================ // Helper Functions // ============================================================================`
- Issue: Section markers

**Line 48:** `/** Build service unit name from container name */`
- Issue: Restates function name

**Lines 51-53:** `// ============================================================================ // Level Processing // ============================================================================`
- Issue: Section markers

**Line 55:** `/** Process levels sequentially, containers within level based on parallel flag */`
- Issue: Describes what function does

**Lines 81-83:** `// ============================================================================ // Stack Operations // ============================================================================`
- Issue: Section markers

**Lines 85-87:** `/** Start all containers in a stack in dependency order. */`
- Issue: Restates function name

**Lines 112-114:** `/** Stop all containers in a stack in reverse dependency order. */`
- Issue: Restates function name

**Lines 136-138:** `/** Restart all containers in a stack. */`
- Issue: Restates function name

**Line 148:** `// Stop then start (to maintain proper order)`
- Issue: Describes what code does

**Lines 153-155:** `/** Enable all containers in a stack to start on boot. */`
- Issue: Restates function name

**Lines 175-177:** `/** Get status of all containers in a stack. */`
- Issue: Restates function name

**Lines 198-200:** `/** Check if all containers in a stack are running. */`
- Issue: Restates function name

**Lines 210-212:** `// ============================================================================ // Single Container Operations // ============================================================================`
- Issue: Section markers

**Lines 214-216:** `/** Start a single container in a stack. */`
- Issue: Restates function name

**Lines 245-247:** `/** Stop a single container in a stack. */`
- Issue: Restates function name

---

### `src/stack/types.ts`

**Lines 24-26:** `/** Container definition within a stack. */`
- Issue: Restates interface name

**Line 28:** `/** Container name (unique within stack) */`
- Issue: Describes field

**Lines 30-31:** `/** Human-readable description */`
- Issue: Describes field name

**Lines 32-33:** `/** Container image reference */`
- Issue: Describes field

**Lines 34-35:** `/** Optional image digest for pinning */`
- Issue: Describes field

**Lines 42-43:** `/** Port mappings (for externally exposed containers) */`
- Issue: Describes field

**Lines 44-45:** `/** Volume mounts */`
- Issue: Restates field name

**Lines 46-47:** `/** Environment variables */`
- Issue: Restates field name

**Lines 48-49:** `/** Environment file paths */`
- Issue: Restates field name

**Lines 50-51:** `/** Podman secrets to mount or inject */`
- Issue: Describes field

**Lines 53-54:** `/** User namespace configuration */`
- Issue: Restates field name

**Lines 55-56:** `/** Health check configuration */`
- Issue: Restates field name

**Line 58:** `/** Security options */`
- Issue: Section-like grouping comment

**Lines 59-63:** `/** readOnlyRootfs/noNewPrivileges/capAdd/capDrop/seccompProfile */`
- Issue: Field comments restate field names

**Line 65:** `/** Resource limits */`
- Issue: Section-like grouping comment

**Lines 66-68:** `/** shmSize/memory/pidsLimit */`
- Issue: Field comments restate field names

**Lines 70-71:** `/** Devices to mount */`
- Issue: Restates field name

**Line 73:** `/** Misc options */`
- Issue: Section-like grouping comment

**Lines 74-78:** `/** init/hostname/workdir/entrypoint/exec */`
- Issue: Field comments restate field names

**Lines 80-81:** `/** Auto-update configuration */`
- Issue: Restates field name

**Lines 82-83:** `/** Service configuration */`
- Issue: Restates field name

**Lines 86-88:** `/** Network definition within a stack. */`
- Issue: Restates interface name

**Lines 90-91:** `/** Network name */`
- Issue: Restates field name

**Lines 94-95:** `/** Additional network options */`
- Issue: Describes field

**Lines 98-100:** `/** Volume definition within a stack. */`
- Issue: Restates interface name

**Lines 102-103:** `/** Volume name */`
- Issue: Restates field name

**Lines 104-105:** `/** Volume options */`
- Issue: Restates field name

**Lines 108-110:** `/** Complete stack definition. */`
- Issue: Restates interface name

**Lines 112-113:** `/** Stack name (used as prefix for resources) */`
- Issue: Describes field

**Lines 114-115:** `/** Human-readable description */`
- Issue: Describes field name

**Lines 117-118:** `/** Internal network for stack communication */`
- Issue: Describes field

**Lines 119-120:** `/** Additional networks */`
- Issue: Describes field

**Lines 122-123:** `/** Named volumes */`
- Issue: Restates field name

**Lines 125-126:** `/** Container definitions */`
- Issue: Restates field name

**Lines 128-129:** `/** Default service configuration for all containers */`
- Issue: Describes field

**Lines 130-131:** `/** Default auto-update setting */`
- Issue: Restates field name

**Lines 134-136:** `/** Generated files from a stack. */`
- Issue: Restates interface name

**Lines 138-139:** `/** Container quadlet files */`
- Issue: Describes field

**Lines 140-141:** `/** Network quadlet files */`
- Issue: Describes field

**Lines 142-143:** `/** Volume quadlet files */`
- Issue: Describes field

**Lines 144-145:** `/** Environment files */`
- Issue: Restates field name

**Lines 146-147:** `/** Other generated files */`
- Issue: Restates field name

**Lines 150-152:** `/** Container dependency node for graph operations. */`
- Issue: Restates interface name

**Lines 154-155:** `/** Container name */`
- Issue: Restates field name

**Lines 156-157:** `/** Hard dependencies */`
- Issue: Restates field name

**Lines 158-159:** `/** Soft dependencies */`
- Issue: Restates field name

**Lines 162-164:** `/** Resolved start order for containers. */`
- Issue: Restates interface name

**Lines 166-167:** `/** Containers in order of startup */`
- Issue: Describes field

---

### `src/system/age.ts`

**Lines 24-26:** `/** Age keypair (public key for encryption, secret key for decryption). */`
- Issue: Restates interface name

**Lines 34-36:** `/** Generate a new age X25519 keypair. */`
- Issue: Restates function name

**Lines 68-69:** `// Use Bun's native Uint8Array.toBase64() extension`
- Issue: Describes what code uses

**Lines 91-92:** `// Use Bun's native Uint8Array.fromBase64() static method`
- Issue: Describes what code uses

**Lines 104-106:** `/** Load existing keypair from file. */`
- Issue: Restates function name

**Lines 150-152:** `/** Encrypt secrets map to a file. */`
- Issue: Restates function name

**Lines 159-160:** `// Format as KEY=VALUE lines`
- Issue: Describes what code does

**Lines 168-170:** `/** Decrypt secrets from a file. */`
- Issue: Restates function name

---

### `src/system/archive.ts`

**Lines 24-26:** `/** Safe JSON parse that returns Option instead of throwing. */`
- Issue: Restates function name

**Lines 44-45:** `// Convert all file contents to string or Uint8Array using Promise.all`
- Issue: Describes what code does

**Lines 60-61:** `// Create archive with optional gzip compression using Bun.Archive constructor`
- Issue: Describes what code does

**Lines 67-68:** `// For zstd or no compression, create uncompressed archive first`
- Issue: Describes what code does

**Lines 71-72:** `// Apply zstd compression manually if requested`
- Issue: Describes what code does

**Lines 108-110:** `/** List contents of a tar archive without extracting. */`
- Issue: Restates function name

**Lines 165-166:** `// Pure filter using Arr.filter`
- Issue: Describes what code does

**Lines 173-174:** `// Parallel file reading`
- Issue: Describes what code does

**Lines 184-185:** `// Prepare files object with metadata`
- Issue: Describes what code does

**Lines 190-191:** `// Create archive with optional compression`
- Issue: Describes what code does

---

### `src/system/compress.ts`

**Line 51-52:** `/** Compression level (0-9, default 6) */`
- Issue: Describes field

**Lines 55-57:** `/** Compression level (1-22, default 3) */`
- Issue: Describes field

**Lines 60-62:** `// ============================================================================ // GZIP Compression (RFC 1952) // ============================================================================`
- Issue: Section markers

**Lines 75-77:** `/** Decompress gzip data (synchronous). */`
- Issue: Restates function name

**Lines 82-84:** `/** Compress a string using gzip and return as Uint8Array. */`
- Issue: Restates function name

**Lines 89-91:** `/** Decompress gzip data and return as string. */`
- Issue: Restates function name

**Lines 97-99:** `// ============================================================================ // DEFLATE Compression (RFC 1951) // ============================================================================`
- Issue: Section markers

**Lines 115-117:** `/** Decompress deflate data (synchronous). */`
- Issue: Restates function name

**Lines 122-124:** `// ============================================================================ // Zstandard Compression (RFC 8878) // ============================================================================`
- Issue: Section markers

**Lines 137-139:** `/** Compress data using Zstandard (synchronous). */`
- Issue: Restates function name

**Lines 147-149:** `/** Decompress Zstandard data (async). */`
- Issue: Restates function name

**Lines 154-156:** `/** Decompress Zstandard data (synchronous). */`
- Issue: Restates function name

**Lines 161-163:** `/** Compress a string using Zstandard and return as Uint8Array. */`
- Issue: Restates function name

**Lines 171-173:** `/** Decompress Zstandard data and return as string. */`
- Issue: Restates function name

**Lines 179-181:** `// ============================================================================ // File Compression Utilities // ============================================================================`
- Issue: Section markers

**Lines 183-185:** `/** Compress a file using gzip and write to destination. */`
- Issue: Restates function name

**Lines 196-198:** `/** Decompress a gzip file and write to destination. */`
- Issue: Restates function name

**Lines 219-221:** `/** Decompress a Zstandard file and write to destination. */`
- Issue: Restates function name

**Lines 228-230:** `// ============================================================================ // Compression Ratio Utilities // ============================================================================`
- Issue: Section markers

---

### `src/system/directories.ts`

**Lines 27-29:** `/** Ensure a directory exists with proper ownership and permissions. */`
- Issue: Restates function name

**Lines 62-64:** `/** Ensure multiple directories exist with the same ownership. */`
- Issue: Restates function name

**Lines 77-79:** `/** Change ownership of a file or directory. */`
- Issue: Restates function name

**Lines 106-108:** `/** Change permissions of a file or directory. */`
- Issue: Restates function name

**Lines 133-135:** `/** Get standard directories for a service. */`
- Issue: Restates function name

**Lines 151-153:** `/** Ensure all standard service directories exist. */`
- Issue: Restates function name

**Lines 166-167:** `// Create data dirs and config parent in parallel`
- Issue: Describes what code does

**Lines 171-172:** `// Now create containers directory and quadlet directory sequentially`
- Issue: Describes what code does

**Lines 176-178:** `/** Remove a directory and its contents. */`
- Issue: Restates function name

**Lines 202-204:** `// ============================================================================ // Tracked Directory Operations (Functional Pattern) // ============================================================================`
- Issue: Section markers

**Lines 206-209:** `/** Ensure directories with tracking. Uses Effect.forEach for functional iteration over paths. */`
- Issue: Restates function name

**Lines 238-241:** `/** Remove directories in reverse order. Functional composition with reversed array. */`
- Issue: Restates function name

**Lines 249-251:** `/** Ensure service directories with tracking. */`
- Issue: Restates function name

---

### `src/system/exec.ts`

**Lines 37-39:** `/** Helper to create a SystemError for exec failures. */`
- Issue: Restates function name

**Lines 47-49:** `/** Execute a command and return the result. */`
- Issue: Restates function name

**Lines 128-130:** `/** Execute a command and check for success (exit code 0). */`
- Issue: Restates function name

**Lines 151-153:** `/** Execute a command and return stdout on success. */`
- Issue: Restates function name

**Lines 160-162:** `/** Check if a command exists in PATH. */`
- Issue: Restates function name

**Lines 165-167:** `/** Run command as a specific user with proper environment. */`
- Issue: Restates function name

**Lines 202-204:** `/** Execute a shell command with piping support using Bun Shell. */`
- Issue: Restates function name

**Lines 229-231:** `/** Execute a shell command and return stdout as text. */`
- Issue: Restates function name

**Lines 251-253:** `/** Execute a shell command and return stdout as lines. */`
- Issue: Restates function name

**Lines 273-275:** `/** Escape a string for safe use in shell commands. */`
- Issue: Restates function name

**Lines 278-280:** `/** Expand brace expressions in a string. */`
- Issue: Restates function name

**Lines 283-285:** `/** Execute shell command as another user via sudo. */`
- Issue: Restates function name

**Lines 303-305:** `/** Build shell command with options applied via Option.match (no conditionals). */`
- Issue: Restates function name

**Line 338:** `// Step 1: Execute command, get raw JSON (unknown at boundary)`
- Issue: Describes what code does

**Line 344:** `// Step 2: Validate unknown → A via schema`
- Issue: Describes what code does

**Lines 358-360:** `/** Execute a shell command and return stdout as a Blob. */`
- Issue: Restates function name

---

### `src/system/fs.ts`

**Lines 22-24:** `/** Helper to create a SystemError for file read failures. */`
- Issue: Restates function name

**Lines 32-34:** `/** Helper to create a SystemError for file write failures. */`
- Issue: Restates function name

**Lines 42-44:** `/** Helper to create a SystemError for directory creation failures. */`
- Issue: Restates function name

**Lines 52-54:** `/** Read file contents as text. */`
- Issue: Restates function name

**Lines 78-80:** `/** Read file contents as lines. */`
- Issue: Restates function name

**Lines 84-86:** `/** Read file contents as bytes (Uint8Array). */`
- Issue: Restates function name

**Lines 110-112:** `/** Write binary content to a file. */`
- Issue: Restates function name

**Lines 124-126:** `/** Write content to a file. */`
- Issue: Restates function name

**Lines 150-152:** `// Return success with None - file already exists is not an error`
- Issue: Describes what code does

**Lines 170-172:** `/** Create a file writer for incremental writes. */`
- Issue: Restates function name

**Lines 187-189:** `/** Append content to a file. */`
- Issue: Restates function name

**Lines 201-203:** `/** Check if a file exists. */`
- Issue: Restates function name

**Lines 207-209:** `/** Check if a path is a directory. */`
- Issue: Restates function name

**Lines 220-222:** `/** Copy a file using kernel-level operations. */`
- Issue: Restates function name

**Lines 254-256:** `/** Create a backup of a file (adds .bak extension). */`
- Issue: Restates function name

**Lines 264-266:** `/** Read file if it exists, return empty string otherwise. */`
- Issue: Restates function name

**Lines 270-272:** `/** Atomically write a file by writing to a temp file first. */`
- Issue: Restates function name

**Lines 287-289:** `/** Atomically rename a file. */`
- Issue: Restates function name

**Lines 304-306:** `/** Compare two files for equality. */`
- Issue: Restates function name

**Lines 316-318:** `/** Get file size in bytes. */`
- Issue: Restates function name

**Lines 339-341:** `/** Check if a directory exists. */`
- Issue: Restates function name

**Lines 353-355:** `/** Ensure a directory exists (mkdir -p equivalent). */`
- Issue: Restates function name

**Lines 362-364:** `/** List files in a directory. */`
- Issue: Restates function name

**Lines 374-376:** `/** Find files matching a glob pattern. */`
- Issue: Restates function name

**Lines 391-393:** `/** Check if a path matches a glob pattern. */`
- Issue: Restates function name

**Lines 418-421:** `/** Delete a file only if it exists. Returns true if file was deleted, false if it didn't exist. */`
- Issue: Restates function name

**Lines 439-441:** `/** Delete a directory recursively. */`
- Issue: Restates function name

**Lines 459-461:** `/** Hash content using Bun.hash() for fast non-cryptographic hashing. */`
- Issue: Restates function name

**Lines 464-466:** `/** Compute SHA-256 hash of a file. */`
- Issue: Restates function name

**Lines 494-496:** `/** Deep equality comparison using Bun.deepEquals. */`
- Issue: Restates function name

**Lines 500-502:** `/** Supported hash algorithms for hashContentWith. */`
- Issue: Restates type name

**Lines 505-507:** `/** Hash content with a specified algorithm. */`
- Issue: Restates function name

**Lines 518-521:** `/** Watch a file for changes. Returns a cleanup function to stop watching. */`
- Issue: Restates function name

---

### `src/system/index.ts`

**Lines 8-10:** `/** System operations module exports. */`
- Issue: Restates file purpose

**Line 12:** `// Archive - Native tar archive operations using Bun.Archive`
- Issue: Section marker

**Line 23:** `// Exec - Command execution`
- Issue: Section marker

**Line 41:** `// FS - Filesystem operations`
- Issue: Section marker

**Line 72:** `// Compress - Compression utilities (gzip, deflate, zstd)`
- Issue: Section marker

**Line 95:** `// UID Allocator - Dynamic UID/subuid allocation`
- Issue: Section marker

**Line 110:** `// User - Service user management`
- Issue: Section marker

**Line 121:** `// Linger - User linger management`
- Issue: Section marker

**Line 130:** `// Directories - Directory management`
- Issue: Section marker

**Line 142:** `// Systemctl - Systemd integration`
- Issue: Section marker

**Line 159:** `// Sysctl - System configuration for unprivileged ports`
- Issue: Section marker

**Line 168:** `// SELinux - SELinux detection for volume relabeling`
- Issue: Section marker

---

### `src/system/linger.ts`

**Lines 51-54:** `/** Check if user session socket exists. Fails if socket not found (for retry). */`
- Issue: Restates function name

**Lines 69-72:** `/** Wait for the systemd user session to be ready. Uses Effect.retry with polling schedule instead of manual loop. */`
- Issue: Restates function name

**Lines 84-86:** `/** Check if linger is enabled for a user. */`
- Issue: Restates function name

**Lines 90-93:** `/** Enable linger for a user. This allows their systemd user services to run without an active login session. */`
- Issue: Restates function name

**Lines 99-100:** `// Check if already enabled`
- Issue: Describes what code does

**Lines 102-103:** `// Still need to ensure user service is running and session is ready`
- Issue: Describes what code does

**Lines 132-133:** `// Verify it was enabled`
- Issue: Describes what code does

**Lines 146-147:** `// Wait for user session to be ready`
- Issue: Describes what code does

**Lines 158-160:** `/** Disable linger for a user. */`
- Issue: Restates function name

**Lines 165-166:** `// Check if already disabled`
- Issue: Describes what code does

**Lines 187-189:** `/** Get list of users with linger enabled. */`
- Issue: Restates function name

**Lines 209-211:** `/** Ensure linger is enabled for a service user, with proper error context. */`
- Issue: Restates function name

**Lines 228-230:** `// ============================================================================ // Tracked Linger Operations (Functional Pattern) // ============================================================================`
- Issue: Section markers

**Lines 244-246:** `// Already enabled - ensure session ready, mark as not created by us`
- Issue: Describes what code does

**Lines 259-260:** `// Not enabled - enable it, mark as created by us`
- Issue: Describes what code does

---

### `src/system/lock.ts`

**File header (lines 8-13):** EXCELLENT - Explains WHY O_EXCL is used (atomic lock acquisition guaranteed by kernel), WHY stale lock detection exists (crashed processes leave orphan locks), and the dual detection strategy (PID liveness + timestamp).

**Line 31:** `/** Validate resource name doesn't contain path traversal characters */`
- Issue: Restates function name

**Lines 35-39:** `/** Lock file content: PID and timestamp */` and interface fields
- Issue: Describes interface structure

**Lines 41-43:** `/** Parse lock file content into structured form. */`
- Issue: Restates function name

**Lines 54-56:** `/** Check if a process is alive. */`
- Issue: Restates function name

**Lines 66-68:** `/** Determine if lock info represents a stale lock. */`
- Issue: Restates function name

**Lines 72-74:** `/** Check if a lock file is stale. */`
- Issue: Restates function name

**Lines 97-99:** `/** Atomically take over a stale lock using rename. */`
- Issue: Restates function name

**Line 108:** `// Write our PID to temp file`
- Issue: Describes what code does

**Line 114:** `// Use ensuring to guarantee temp file cleanup`
- Issue: Describes what code does

**Line 117:** `// Re-read current lock to verify it's still stale`
- Issue: Describes what code does

**Line 132:** `// Atomic rename to take over the lock`
- Issue: Describes what code does

**Line 142:** `// Cleanup: delete temp file if it still exists (rename succeeded = no file)`
- Issue: Describes what code does

**Lines 148-150:** `/** Single attempt to acquire a lock. */`
- Issue: Restates function name

**Line 163:** `// Lock file exists - check if stale`
- Issue: Describes what code does

**Lines 176-178:** `/** Execute an operation with an exclusive lock. */`
- Issue: Restates function name

**Line 198:** `// Ensure lock directory exists`
- Issue: Describes what code does

**Line 210:** `// Acquire lock with retry`
- Issue: Describes what code does

**Line 228:** `// Execute operation with guaranteed lock release`
- Issue: Describes what code does

---

### `src/system/secrets.ts`

**File header (lines 8-13):** EXCELLENT - Explains the three-phase workflow (generate → Podman → encrypted backup), WHY Podman secrets are used (runtime injection as files), WHY Age-encrypted backups exist (recovery after container reset), and the idempotency guarantee.

**Lines 32-35:** `/** Secret definition for a service. */`
- Issue: Restates interface name

**Lines 36-37:** `/** Secret name (e.g., "db-password") */`
- Issue: Describes field with example

**Lines 38-39:** `/** Description for logging */`
- Issue: Describes field

**Lines 40-41:** `/** Password length (default: 32) */`
- Issue: Describes field

**Lines 44-46:** `/** Generated secrets for a service. */`
- Issue: Restates interface name

**Lines 47-48:** `/** Map of secret name to value */`
- Issue: Describes field

**Lines 49-50:** `/** Age keypair used for encryption */`
- Issue: Describes field

**Lines 54-56:** `/** Paths for secret storage. */`
- Issue: Restates interface name

**Lines 63-65:** `/** Get paths for secret storage. */`
- Issue: Restates function name

**Lines 75-77:** `/** Get the podman secret name for a service secret. */`
- Issue: Restates function name

**Lines 81-83:** `/** Check if a podman secret exists. */`
- Issue: Restates function name

**Lines 97-99:** `/** Check if error indicates secret already exists. */`
- Issue: Restates function name

**Lines 102-106:** `/** Create a podman secret from a value. ... */`
- Issue: First sentence restates function name

**Line 164:** `// Ensure age key directory exists`
- Issue: Describes what code does

**Line 167:** `// Ensure age keypair exists`
- Issue: Describes what code does

**Line 170:** `// Check if we have existing encrypted secrets`
- Issue: Describes what code does

**Line 182:** `// Generate or reuse secrets using Effect.forEach`
- Issue: Describes what code does

**Line 204:** `// Pure transformation: readonly array → Record`
- Issue: Describes what code does

**Line 211:** `// Write encrypted backup`
- Issue: Describes what code does

**Lines 217-220:** `/** Get a secret value for display. Decrypts from the backup file. */`
- Issue: Restates function name

**Line 229:** `// Read secret key`
- Issue: Describes what code does

**Line 242:** `// Decrypt secrets`
- Issue: Describes what code does

**Lines 259-261:** `/** List available secrets for a service. */`
- Issue: Restates function name

**Lines 287-289:** `// ============================================================================ // Tracked Secret Operations (Functional Pattern) // ============================================================================`
- Issue: Section markers

**Lines 291-294:** `/** Ensure secrets with tracking. Returns created secret names for rollback. */`
- Issue: Restates function name

**Line 313:** `// Load existing secrets if available`
- Issue: Describes what code does

**Line 328:** `// Process each secret definition, tracking which we create`
- Issue: Describes what code does

**Line 343:** `// Reuse existing`
- Issue: Describes what code does

**Line 353:** `// Secret exists in podman, just track value`
- Issue: Describes what code does

**Line 362:** `// Create new secret`
- Issue: Describes what code does

**Line 376:** `// Build secrets record - pure transformation`
- Issue: Describes what code does

**Lines 396-398:** `/** Delete podman secrets. */`
- Issue: Restates function name

---

### `src/system/selinux.ts`

**File header (lines 8-13):** EXCELLENT - Explains WHY :Z labeling is needed (SELinux blocks container access to host files), WHICH systems need it (RHEL/Fedora vs Debian/Ubuntu), and the harmless no-op behavior on non-SELinux systems.

**Lines 18-21:** `/** SELinux enforcement mode. */`
- Issue: Restates type name

**Lines 23-26:** `/** Get the current SELinux enforcement mode. Returns "disabled" if SELinux/getenforce is not available (non-SELinux systems). */`
- Issue: First sentence restates function name

**Lines 54-57:** `/** Check if SELinux is in enforcing mode. ... */`
- Issue: First sentence restates function name

---

### `src/system/services/age.ts`

**File header (lines 8-12):** Good - Explains the Context.Tag pattern purpose (dependency injection) and isolatedDeclarations compatibility.

**Lines 24-27:** `/** Age service interface - provides age encryption utilities via Effect DI. ... */`
- Issue: "provides age encryption utilities" restates interface name

**Lines 37-42:** `/** Age service identifier for Effect dependency injection. */`
- Issue: Restates interface purpose

**Lines 44-47:** `/** Age context tag. ... */`
- Issue: "Age context tag" restates constant name

**Lines 50-52:** `/** Age live layer with all implementations. */`
- Issue: Restates constant name

---

### `src/system/services/archive.ts`

**File header (lines 8-12):** Good - Explains the Context.Tag pattern purpose (dependency injection) and isolatedDeclarations compatibility.

**Lines 24-27:** `/** Archive service interface - provides tar archive operations via Effect DI. ... */`
- Issue: "provides tar archive operations" restates interface name

**Lines 37-42:** `/** Archive service identifier for Effect dependency injection. */`
- Issue: Restates interface purpose

**Lines 44-47:** `/** Archive context tag. ... */`
- Issue: "Archive context tag" restates constant name

**Lines 53-55:** `/** Archive live layer with all implementations. */`
- Issue: Restates constant name

---

### `src/system/services/compress.ts`

**File header (lines 8-12):** Good - Explains Context.Tag pattern, DI purpose, isolatedDeclarations compatibility.

**Lines 36-39:** `/** Compress service interface - provides compression utilities via Effect DI. ... */`
- Issue: "provides compression utilities" restates interface name

**Line 41:** `// Gzip`
- Issue: Section comment

**Line 49:** `// Deflate`
- Issue: Section comment

**Line 53:** `// Zstd`
- Issue: Section comment

**Line 63:** `// Utilities`
- Issue: Section comment

**Lines 68-70:** `/** Compress service identifier for Effect dependency injection. */`
- Issue: Restates interface purpose

**Lines 75-78:** `/** Compress context tag. ... */`
- Issue: "Compress context tag" restates constant name

**Lines 84-86:** `/** Compress live layer with all implementations. */`
- Issue: Restates constant name

**Line 88:** `// Gzip`
- Issue: Section comment

**Line 96:** `// Deflate`
- Issue: Section comment

**Line 100:** `// Zstd`
- Issue: Section comment

**Line 110:** `// Utilities`
- Issue: Section comment

---

### `src/system/services/directory.ts`

**File header (lines 8-12):** Good - Explains Context.Tag pattern, DI purpose, isolatedDeclarations compatibility.

**Lines 28-30:** `/** Directory service interface - provides directory management via Effect DI. */`
- Issue: "provides directory management" restates interface name

**Line 39:** `// Tracked operations`
- Issue: Section comment

**Lines 45-47:** `/** Directory service identifier for Effect dependency injection. */`
- Issue: Restates interface purpose

**Lines 52-55:** `/** Directory context tag. ... */`
- Issue: "Directory context tag" restates constant name

**Lines 61-63:** `/** Directory live layer with all implementations. */`
- Issue: Restates constant name

**Line 72:** `// Tracked operations`
- Issue: Section comment

---

### `src/system/services/executor.ts`

**File header (lines 8-12):** Good - Explains Context.Tag pattern, DI purpose, isolatedDeclarations compatibility.

**Lines 31-34:** `/** CommandExecutor service interface - provides command execution via Effect DI. ... */`
- Issue: "provides command execution" restates interface name

**Line 36:** `// Core execution`
- Issue: Section comment

**Line 42:** `// Shell operations`
- Issue: Section comment

**Line 50:** `// Utilities`
- Issue: Section comment

**Lines 56-58:** `/** CommandExecutor service identifier for Effect dependency injection. */`
- Issue: Restates interface purpose

**Lines 63-66:** `/** CommandExecutor context tag. ... */`
- Issue: "CommandExecutor context tag" restates constant name

**Lines 70-72:** `/** CommandExecutor live layer with all implementations. */`
- Issue: Restates constant name

**Line 74:** `// Core execution`
- Issue: Section comment

**Line 80:** `// Shell operations`
- Issue: Section comment

**Line 88:** `// Utilities`
- Issue: Section comment

---

### `src/system/services/filesystem.ts`

**File header (lines 8-12):** Good - Explains Context.Tag pattern, DI purpose, isolatedDeclarations compatibility.

**Lines 49-52:** `/** FileSystem service interface - provides filesystem operations via Effect DI. ... */`
- Issue: "provides filesystem operations" restates interface name

**Line 54:** `// Core read operations`
- Issue: Section comment

**Line 60:** `// Core write operations`
- Issue: Section comment

**Line 68:** `// Existence/info checks`
- Issue: Section comment

**Line 74:** `// File operations`
- Issue: Section comment

**Line 83:** `// Directory operations`
- Issue: Section comment

**Line 87:** `// Glob operations`
- Issue: Section comment

**Line 91:** `// Hashing`
- Issue: Section comment

**Line 97:** `// Utilities`
- Issue: Section comment

**Lines 102-104:** `/** FileSystem service identifier for Effect dependency injection. */`
- Issue: Restates interface purpose

**Lines 109-112:** `/** FileSystem context tag. ... */`
- Issue: "FileSystem context tag" restates constant name

**Lines 118-120:** `/** FileSystem live layer with all implementations. */`
- Issue: Restates constant name

**Line 122:** `// Core read operations`
- Issue: Section comment

**Line 128:** `// Core write operations`
- Issue: Section comment

**Line 136:** `// Existence/info checks`
- Issue: Section comment

**Line 142:** `// File operations`
- Issue: Section comment

**Line 151:** `// Directory operations`
- Issue: Section comment

**Line 155:** `// Glob operations`
- Issue: Section comment

**Line 159:** `// Hashing`
- Issue: Section comment

**Line 165:** `// Utilities`
- Issue: Section comment

---

### `src/system/services/index.ts`

**File header (lines 8-11):** Good - Explains purpose (re-exports Context.Tag wrappers) and composed layer.

**Line 29:** `// Re-export all services for convenient importing`
- Issue: Section comment

**Lines 45-47:** `/** Composed layer with all system services. Layer memoization prevents duplicate construction automatically. */`
- Issue: First two sentences restate what the constant is

**Lines 100-104:** `/** Type alias for all system services context requirement. ... */`
- Issue: Restates type alias purpose

---

### `src/system/services/linger.ts`

**File header (lines 8-12):** Good - Explains Context.Tag pattern, DI purpose, isolatedDeclarations compatibility.

**Lines 24-27:** `/** Linger service interface - provides user linger management via Effect DI. ... */`
- Issue: "provides user linger management" restates interface name

**Line 34:** `// Tracked operations`
- Issue: Section comment

**Lines 38-40:** `/** Linger service identifier for Effect dependency injection. */`
- Issue: Restates interface purpose

**Lines 45-48:** `/** Linger context tag. ... */`
- Issue: "Linger context tag" restates constant name

**Lines 53-55:** `/** Linger live layer with all implementations. */`
- Issue: Restates constant name

**Line 62:** `// Tracked operations`
- Issue: Section comment

---

### `src/system/services/lock.ts`

**File header (lines 8-12):** Good - Explains Context.Tag pattern, DI purpose, isolatedDeclarations compatibility.

**Lines 17-20:** `/** Lock service interface - provides file-based locking via Effect DI. ... */`
- Issue: "provides file-based locking" restates interface name

**Lines 25-27:** `/** Lock service identifier for Effect dependency injection. */`
- Issue: Restates interface purpose

**Lines 32-35:** `/** Lock context tag. ... */`
- Issue: "Lock context tag" restates constant name

**Lines 40-42:** `/** Lock live layer with all implementations. */`
- Issue: Restates constant name

---

### `src/system/services/secrets.ts`

**File header (lines 8-12):** Good - Explains Context.Tag pattern, DI purpose, isolatedDeclarations compatibility.

**Lines 25-28:** `/** Secrets service interface - provides secret management via Effect DI. ... */`
- Issue: "provides secret management" restates interface name

**Line 35:** `// Tracked operations`
- Issue: Section comment

**Lines 40-42:** `/** Secrets service identifier for Effect dependency injection. */`
- Issue: Restates interface purpose

**Lines 47-50:** `/** Secrets context tag. ... */`
- Issue: "Secrets context tag" restates constant name

**Lines 56-58:** `/** Secrets live layer with all implementations. */`
- Issue: Restates constant name

**Line 65:** `// Tracked operations`
- Issue: Section comment

---

### `src/system/services/selinux.ts`

**File header (lines 8-12):** Good - Explains Context.Tag pattern, DI purpose, isolatedDeclarations compatibility.

**Lines 17-20:** `/** SELinux service interface - provides SELinux detection via Effect DI. ... */`
- Issue: "provides SELinux detection" restates interface name

**Lines 26-28:** `/** SELinux service identifier for Effect dependency injection. */`
- Issue: Restates interface purpose

**Lines 33-36:** `/** SELinux context tag. ... */`
- Issue: "SELinux context tag" restates constant name

**Lines 42-44:** `/** SELinux live layer with all implementations. */`
- Issue: Restates constant name

---

### `src/system/services/sysctl.ts`

**File header (lines 8-12):** Good - Explains Context.Tag pattern, DI purpose, isolatedDeclarations compatibility.

**Lines 23-26:** `/** Sysctl service interface - provides sysctl configuration via Effect DI. ... */`
- Issue: "provides sysctl configuration" restates interface name

**Lines 35-37:** `/** Sysctl service identifier for Effect dependency injection. */`
- Issue: Restates interface purpose

**Lines 42-45:** `/** Sysctl context tag. ... */`
- Issue: "Sysctl context tag" restates constant name

**Lines 50-52:** `/** Sysctl live layer with all implementations. */`
- Issue: Restates constant name

---

### `src/system/services/systemctl.ts`

**File header (lines 8-12):** Good - Explains Context.Tag pattern, DI purpose, isolatedDeclarations compatibility.

**Lines 30-32:** `/** SystemCtl service interface - provides systemd systemctl operations via Effect DI. */`
- Issue: "provides systemd systemctl operations" restates interface name

**Line 34:** `// Base systemctl`
- Issue: Section comment

**Line 37:** `// Service lifecycle`
- Issue: Section comment

**Line 43:** `// Enable/disable`
- Issue: Section comment

**Line 47:** `// Status checks`
- Issue: Section comment

**Line 52:** `// Daemon management`
- Issue: Section comment

**Lines 57-59:** `/** SystemCtl service identifier for Effect dependency injection. */`
- Issue: Restates interface purpose

**Lines 64-67:** `/** SystemCtl context tag. ... */`
- Issue: "SystemCtl context tag" restates constant name

**Lines 73-75:** `/** SystemCtl live layer with all implementations. */`
- Issue: Restates constant name

**Line 77:** `// Base systemctl`
- Issue: Section comment

**Line 80:** `// Service lifecycle`
- Issue: Section comment

**Line 86:** `// Enable/disable`
- Issue: Section comment

**Line 90:** `// Status checks`
- Issue: Section comment

**Line 95:** `// Daemon management`
- Issue: Section comment

---

### `src/system/services/uid-allocator.ts`

**File header (lines 8-12):** Good - Explains Context.Tag pattern, DI purpose, isolatedDeclarations compatibility.

**Lines 28-31:** `/** UidAllocator service interface - provides UID/subuid allocation via Effect DI. ... */`
- Issue: "provides UID/subuid allocation" restates interface name

**Line 33:** `// Range constants`
- Issue: Section comment

**Line 37:** `// Query functions`
- Issue: Section comment

**Line 45:** `// Allocation functions`
- Issue: Section comment

**Lines 50-52:** `/** UidAllocator service identifier for Effect dependency injection. */`
- Issue: Restates interface purpose

**Lines 57-60:** `/** UidAllocator context tag. ... */`
- Issue: "UidAllocator context tag" restates constant name

**Lines 66-68:** `/** UidAllocator live layer with all implementations. */`
- Issue: Restates constant name

**Line 70:** `// Range constants`
- Issue: Section comment

**Line 74:** `// Query functions`
- Issue: Section comment

**Line 82:** `// Allocation functions`
- Issue: Section comment

---

### `src/system/services/user.ts`

**File header (lines 8-12):** Good - Explains Context.Tag pattern, DI purpose, isolatedDeclarations compatibility.

**Lines 27-30:** `/** UserService interface - provides user management via Effect DI. ... */`
- Issue: "provides user management" restates interface name

**Line 39:** `// Tracked operations`
- Issue: Section comment

**Lines 44-46:** `/** UserService service identifier for Effect dependency injection. */`
- Issue: Restates interface purpose

**Lines 51-54:** `/** UserService context tag. ... */`
- Issue: "UserService context tag" restates constant name

**Lines 60-62:** `/** UserService live layer with all implementations. */`
- Issue: Restates constant name

**Line 71:** `// Tracked operations`
- Issue: Section comment

---

### `src/system/sysctl.ts`

**File header (lines 8-13):** EXCELLENT - Explains WHY sysctl is needed (Linux restricts ports < 1024 to root by default), WHAT problem it solves (rootless containers binding HTTP/HTTPS ports), and the alternative it avoids (CAP_NET_BIND_SERVICE).

**Line 22:** `/** Default port threshold for unprivileged port binding */`
- Issue: Describes constant

**Line 25:** `/** Sysctl key for unprivileged port start */`
- Issue: Describes constant

**Lines 28-30:** `/** Get current value of net.ipv4.ip_unprivileged_port_start. */`
- Issue: Restates function name

**Lines 57-59:** `/** Check if unprivileged port binding is enabled for the given threshold. */`
- Issue: Restates function name

**Lines 71-73:** `/** Configure unprivileged port start persistently. ... */`
- Issue: First sentence restates function name

**Line 79:** `// Check if already configured`
- Issue: Describes what code does

**Line 90:** `// Write persistent configuration`
- Issue: Describes what code does

**Line 102:** `// Apply immediately`
- Issue: Describes what code does

**Lines 115-117:** `/** Ensure unprivileged port binding is configured for a service. */`
- Issue: Restates function name

---

### `src/system/systemctl.ts`

**File header (lines 8-12):** EXCELLENT - Explains WHY it runs with --user flag (user session scope for rootless services), and the Quadlet auto-enable behavior (explains why enable is skipped for generated units).

**Lines 38-40:** `/** Check if a systemd unit is generated (e.g., by Quadlet). */`
- Issue: Restates function name

**Lines 61-63:** `/** Run a systemctl --user command as a service user. */`
- Issue: Restates function name

**Lines 94-96:** `/** Start a systemd user service. */`
- Issue: Restates function name

**Lines 119-121:** `/** Stop a systemd user service. */`
- Issue: Restates function name

**Lines 144-146:** `/** Restart a systemd user service. */`
- Issue: Restates function name

**Lines 169-171:** `/** Reload a systemd user service (if supported). */`
- Issue: Restates function name

**Lines 194-197:** `/** Enable a systemd user service. ... */`
- Issue: First sentence restates function name

**Lines 216-218:** `/** Disable a systemd user service. */`
- Issue: Restates function name

**Lines 232-234:** `/** Check if a service is active. */`
- Issue: Restates function name

**Lines 247-249:** `/** Check if a service is enabled. */`
- Issue: Restates function name

**Lines 262-264:** `/** Get service status output. */`
- Issue: Restates function name

**Lines 270-272:** `/** Reload systemd daemon to pick up new unit files. */`
- Issue: Restates function name

**Lines 285-287:** `/** Stream logs from journalctl. */`
- Issue: Restates function name

---

### `src/system/uid-allocator.ts`

**File header (lines 8-11):** Brief mention of cross-distribution compatibility. Could explain WHY dynamic UID allocation is needed.

**Lines 31-43:** Multi-line JSDoc for DEFAULT_UID_RANGE - GOOD example of WHY documentation: explains why each UID range is chosen and what could go wrong with other ranges.

**Line 51:** `/** Canonical UID range constants - used throughout the codebase */`
- Issue: Describes constant purpose

**Lines 55-57:** `/** UID allocation settings from global config. */`
- Issue: Restates interface name

**Line 65:** `/** Pure function returning ReadonlySet (immutable type) */`
- Issue: Describes what code does

**Lines 68-71:** `/** Fetch UIDs from multiple sources in parallel. ... */`
- Issue: First sentence restates function name

**Lines 85-87:** `/** Parse subuid file into range list. */`
- Issue: Restates function name

**Lines 91-94:** `/** Allocate the next available UID in the range. ... */`
- Issue: First sentence restates function name

**Lines 186-188:** `/** Get UID for an existing user by name. */`
- Issue: Restates function name

**Lines 218-220:** `/** Check if a user exists. */`
- Issue: Restates function name

**Lines 230-232:** `/** Get existing subuid start for a user. */`
- Issue: Restates function name

**Lines 257-259:** `/** Get nologin shell path (distribution-independent). */`
- Issue: Restates function name

---

### `src/system/user.ts`

**File header (lines 8-13):** EXCELLENT - Explains WHY (process isolation), WHAT (dedicated system user with nologin shell for security), and WHY rootless namespaces are used (container isolation without root privileges).

**Lines 45-48:** `/** Verify existing user has correct configuration. ... */`
- Issue: Restates function name

**Line 82:** `// Verify UID matches`
- Issue: Describes what code does

**Line 92:** `// Verify home directory matches`
- Issue: Describes what code does

**Lines 122-124:** `/** Check if error indicates UID conflict (already in use by concurrent process). */`
- Issue: Restates function name

**Lines 130-133:** `/** Attempt cleanup, logging failures but not propagating errors. ... */`
- Issue: First sentence restates function name

**Lines 145-147:** `/** Atomically append entry to subuid/subgid file if not already present. */`
- Issue: Restates function name

**Line 161:** `// Atomic write entire file with appended entry`
- Issue: Describes what code does

**Lines 174-177:** `/** Configure subordinate UIDs and GIDs for a user. ... */`
- Issue: First sentence restates function name

**Lines 194-197:** `/** Remove a single user entry from a subid file. ... */`
- Issue: First sentence restates function name

**Line 210:** `// Filter out the user's line(s)`
- Issue: Describes what code does

**Line 216:** `// Preserve trailing newline if content remains`
- Issue: Describes what code does

**Lines 231-235:** `/** Remove a user's entries from /etc/subuid and /etc/subgid. ... */`
- Issue: First sentence restates function name

**Lines 247-251:** `/** Delete a service user and their home directory. ... */`
- Issue: First sentence restates function name

**Line 268:** `// Delete the user account and home directory`
- Issue: Describes what code does

**Lines 287-290:** `/** Create a system user with the given UID. Returns the UID on success. */`
- Issue: Restates function name

**Lines 322-327:** `/** Create a service user with dynamically allocated UID. ... */`
- Issue: First sentence restates function name

**Line 333:** `// Derive username from service name`
- Issue: Describes what code does

**Line 337:** `// 1. Check if user already exists (idempotent with verification)`
- Issue: Describes what code does

**Line 342:** `// Verify existing user configuration is correct`
- Issue: Describes what code does

**Line 357:** `// 2. Get nologin shell (auto-detected per distro)`
- Issue: Describes what code does

**Line 360:** `// 3. Allocate UID and create user atomically with retry on conflict`
- Issue: Describes what code does

**Line 370-371:** `// Acquire: allocate UID and create user // Release: delete user on failure`
- Issue: Describes what code does

**Line 391:** `// 5. Dynamically allocate next available subuid range`
- Issue: Describes what code does

**Line 397:** `// 6. Configure subuid/subgid`
- Issue: Describes what code does

**Lines 412-414:** `/** Get user information if they exist. */`
- Issue: Restates function name

**Lines 439-442:** `/** Get user information by username. ... */`
- Issue: Restates function name

**Lines 475-477:** `/** Check if current process is running as root. */`
- Issue: Restates function name

**Lines 482-484:** `/** Require root privileges, returning an error if not root. */`
- Issue: Restates function name

**Lines 497-499:** `// ============================================================================ // Tracked User Operations // ============================================================================`
- Issue: Section markers

**Lines 501-504:** `/** Acquire service user with creation tracking. ... */`
- Issue: First sentence restates function name

**Line 516:** `// User exists - verify and return with wasCreated: false`
- Issue: Describes what code does

**Line 534:** `// Create new user`
- Issue: Describes what code does

**Lines 539-541:** `/** Release function - conditional cleanup based on wasCreated. */`
- Issue: Restates function name
