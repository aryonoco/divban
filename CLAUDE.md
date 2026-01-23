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

**Service Pattern:** All services implement `ServiceEffect<C, I, ConfigTag>` with lifecycle methods (validate, generate, setup) and runtime methods (start, stop, restart, status, logs). Setup uses `SetupStep<StateIn, Output, E, R>` with a fluent `pipeline().andThen().execute()` builder for type-safe composition with automatic rollback.

**Error Codes:** Organised exit codes in `src/lib/errors.ts` - General (0-9), Config (10-19), System (20-29), Service (30-39), Container (40-49), Backup (50-59).

## Coding Standards

Code must follow these constraints strictly. They are non-negotiable.

### Functional Style
- **No loops**: Use `Arr.map`, `Arr.filter`, `Arr.reduce`, `Arr.filterMap`, `Effect.forEach` instead of `for`/`while`
- **No conditionals**: Use `Match.value().pipe(Match.when(...), Match.exhaustive)`, `Option.match`, `Exit.match` instead of `if`/`switch`
  - **Exceptions**: Type guards (`value is T`), try-catch at API boundaries, and state machine parsers where Match would significantly reduce readability
- **Immutable data**: All interfaces use `readonly`, collections use `ReadonlyMap`/`ReadonlyArray`
- **Composition**: Use `pipe()` for chaining, `Effect.gen` for sequential operations

### Type Safety
- **No `any`/`unknown` in business logic**: Only acceptable at validation boundaries (type guards, Schema decode, catch variables)
- **Branded types required**: Use types from `src/lib/types.ts` (AbsolutePath, Username, UserId, etc.) - never raw strings/numbers for domain values
- **Strict tsconfig**: Code must compile with all strict flags enabled (see `tsconfig.json`)

### String Handling
- **No RegExp**: Use character predicates from `src/lib/char.ts` (`isLower`, `isDigit`, `isAlphaNum`, etc.) composed with `all`/`any` from `src/lib/str.ts`
- **Parsing**: Use Option-chained pipelines with `split`, `indexOf`, `slice`, and character predicates - see `src/lib/schema-utils.ts` for examples (IPv4/IPv6, email, container image parsing)
- **Transformations**: Use fold-based utilities from `src/lib/str-transform.ts` (`collapseChar`, `stripPrefix`, `mapCharsToString`)

### Effect Patterns
- **Error handling**: Use `Effect.either` + pattern match, `Effect.mapError` for transformation
- **Resources**: Use `Effect.acquireRelease` + `Effect.scoped`, track with `Acquired<A>` pattern
- **Exhaustive matching**: Use `Match.exhaustive` for discriminated unions
- **Retries**: Use schedules from `src/lib/retry.ts`

### Service Registration & DI
- **New services**: Implement `ServiceEffect<C, I, ConfigTag>` from `src/services/types.ts`
- **Config tag**: Create identifier interface + tag (see `src/services/caddy/config.ts` for pattern)
- **Dependencies**: Declare in R type parameter, access via `yield* Tag` in `Effect.gen`
- **Registration**: Add to `initializeServices()` in `src/services/index.ts`
- **Runtime provision**: Use `createServiceLayer()` + `Effect.provide(layer)`

### Verification Requirements
- **`just ci` must pass**: All compiler errors, warnings, linter errors, and linter warnings must be fixed
- **No exceptions**: Never add linter ignore comments, disable rules, or loosen tsconfig - if code won't pass, revert with `git checkout` and find a different solution
- **Spelling**: If cspell fails on technical terms, add them to `project-words.txt` (alphabetically in appropriate section) and re-run `just ci`

## Key Patterns

**Setup Flow:** `setup.ts` orchestrates service setup using `Effect.scoped` with nested `acquireRelease` calls for user creation, linger enablement, directory creation, config copying, and service-specific setup.

**Service Setup Steps:** Each service defines setup steps as `SetupStep<StateIn, Output, E, R>` with acquire/release pairs. State accumulates via intersection types (`EmptyState & A & B & C`). The `pipeline().andThen().execute()` builder runs steps sequentially with per-step progress logging, calling release functions in reverse order on failure using the `Outcome` sum type.

**File Write Tracking:** `FileWriteResult` discriminated union tracks whether files were `Created` (delete on rollback) or `Modified` (restore from `.bak` backup on rollback, delete backup on success).

## Advanced Type Patterns

The codebase uses  some patterns to achieve type safety while working around TypeScript's limitations.

### Branded Types (Phantom Brands)

**Location:** `src/lib/types.ts`

**Pattern:** `type UserId = number & Brand.Brand<"UserId">`

**Purpose:** Prevent mixing incompatible values at compile time. The brand exists only in the type system (phantom) - no runtime overhead.

**When to use:**
- Domain identifiers: `UserId`, `GroupId`, `ServiceName`, `ContainerName`
- Validated strings: `AbsolutePath`, `Username`, `PrivateIP`, `ContainerImage`
- Any value that should not be interchangeable with its underlying primitive

**Example:**
```typescript
// These are compile-time errors:
const uid: UserId = 1000;              // Error: number not assignable to UserId
const gid: GroupId = uid;              // Error: UserId not assignable to GroupId
functionExpectingGroupId(uid);         // Error: type mismatch

// Correct usage:
const uid = yield* decodeUserId(1000); // Runtime validation + brand
const gid = userIdToGroupId(uid);      // Explicit conversion
```

### Context Tag Phantom Types

**Location:** `src/services/context/index.ts`, `src/services/*/config.ts`

**Pattern:**
```typescript
interface ServicePaths { readonly _tag: "ServicePaths" }  // Phantom identifier
const ServicePaths: Context.Tag<ServicePaths, ServicePathsValue> =
  Context.GenericTag<ServicePaths, ServicePathsValue>("divban/ServicePaths");
```

**Purpose:** Type-safe dependency injection via Effect's context system. The `_tag` interface is purely compile-time - it distinguishes tags at the type level without runtime representation.

**When to use:**
- Per-invocation data: `ServiceUser`, `ServicePaths`, `ServiceOptions`, `SystemCapabilities`
- Service configuration: `CaddyConfigTag`, `ImmichConfigTag`, `ActualConfigTag`
- Any dependency that should be provided via `Layer.succeed()` and accessed via `yield* Tag`

### Existential Types (Type Hiding)

**Location:** `src/services/types.ts` (`ExistentialService`, `mkExistentialService`)

**Problem:** `ServiceEffect<C, I, Tag>` has type parameters. You cannot store `ServiceEffect<CaddyConfig, ...>` and `ServiceEffect<ImmichConfig, ...>` in the same `Map` without losing type information or using `any`.

**Solution:** Wrap services in `ExistentialService` which hides type parameters externally but preserves them internally.

**Pattern:**
```typescript
// Registration: concrete types are hidden
registerService(caddyService);   // ServiceEffect<CaddyConfig, ...> → ExistentialService
registerService(immichService);  // ServiceEffect<ImmichConfig, ...> → ExistentialService

// Storage: homogeneous collection
const services = new Map<string, ExistentialService>();

// Recovery: full types available inside callback
service.apply((s) =>
  Effect.gen(function* () {
    const config = yield* loadServiceConfig(path, s.configSchema);  // typed!
    const layer = Layer.succeed(s.configTag, config);               // typed!
    yield* s.start().pipe(Effect.provide(layer));
  })
);
```

**When to use:**
- Heterogeneous collections of typed services
- Plugin/registry patterns where types vary
- Any situation requiring "exists C. ServiceEffect<C, ...>" semantics

### Type Erasure in Builders

**Location:** `src/services/helpers.ts` (`PipelineBuilder`, `StoredStep`)

**Problem:** TypeScript cannot express dependent types (step N's input = accumulated output of steps 0..N-1) for arbitrary-length collections.

**Solution:** Builder API preserves full types at each `.andThen()` call; internal storage uses `object`/`unknown`. Type safety is enforced at the API boundary, not the storage layer.

**Pattern:**
```typescript
// Public API: fully typed
pipeline<EmptyState>()
  .andThen(step1)  // PipelineBuilder<EmptyState, EmptyState & A, E1, R1>
  .andThen(step2)  // PipelineBuilder<EmptyState, EmptyState & A & B, E1|E2, R1|R2>
  .execute(emptyState);

// Internal: type-erased for storage
interface StoredStep {
  acquire: (state: object) => Effect.Effect<object, unknown, unknown>;
  release: Option.Option<(state: object, outcome: Outcome) => Effect.Effect<void, never, unknown>>;
}
```

**When to use:**
- Fluent builders with accumulating state
- Chains where each step depends on previous outputs
- Any pattern requiring type-safe API over heterogeneous internal storage

## References

- `README.md` - Usage documentation and supported services
- `examples/` - Example TOML configurations
- `justfile` - All available development commands
