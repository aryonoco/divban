# Branded Types Analysis

Comprehensive analysis of all branded types in the divban codebase, examining consistency of enforcement, escape hatches, and potential issues.

## Executive Summary

The codebase defines **18 branded types** across multiple modules. Overall enforcement is **strong**, with only **2 identified issues** requiring fixes. The architecture demonstrates excellent discipline with Effect Schema validation and compile-time literal constructors.

---

## Branded Type Inventory

### Core Types (`src/lib/types.ts`)

| Type | Underlying | Validation | Status |
|------|-----------|------------|--------|
| `UserId` | `number` | Schema: 0-65534 | Consistently enforced |
| `GroupId` | `number` | Schema: 0-65534 | Consistently enforced |
| `SubordinateId` | `number` | Schema: 100000-4294967294 | Consistently enforced |
| `AbsolutePath` | `string` | Schema: starts with `/` | Consistently enforced |
| `Username` | `string` | Schema: `[a-z_][a-z0-9_-]*`, max 32 | Consistently enforced |
| `ServiceName` | `string` | Schema: `[a-z][a-z0-9-]*` | Consistently enforced |
| `ContainerName` | `string` | Schema: `[a-z][a-z0-9_.-]*` | **Issue #1** |
| `NetworkName` | `string` | Schema: `[a-z][a-z0-9_.-]*` | Consistently enforced |
| `VolumeName` | `string` | Schema: `[a-z][a-z0-9_.-]*` | Consistently enforced |
| `PrivateIP` | `string` | Schema: RFC 1918/4193 | Consistently enforced |
| `ContainerImage` | `string` | Schema: image ref format | Consistently enforced |
| `DurationString` | `string` | Schema: `\d+(ms\|s\|m\|h\|d)` | Consistently enforced |

### Database Types (`src/lib/db-backup/types.ts`)

| Type | Underlying | Validation | Status |
|------|-----------|------------|--------|
| `DatabaseName` | `string` | Schema-based | Consistently enforced |
| `DatabaseUser` | `string` | Schema-based | Consistently enforced |

### Versioning Types (`src/lib/versioning/types.ts`)

| Type | Underlying | Validation | Status |
|------|-----------|------------|--------|
| `SemVer` | `string` | Schema: semver format | Consistently enforced |
| `DivbanConfigSchemaVersion` | `string` | Schema: semver | **Issue #2** |
| `DivbanBackUpSchemaVersion` | `string` | Schema: semver | Consistently enforced |
| `DivbanProducerVersion` | `string` | Schema: semver | Consistently enforced |

---

## Constructor Patterns

### Pattern A: Runtime Validation (Effect/Option-returning)

Used for untrusted input from external sources.

```typescript
// Effect-based (throws typed error)
export const decodeUserId: (i: number) => Effect.Effect<UserId, ParseResult.ParseError>
export const decodeUsername: (i: string) => Effect.Effect<Username, ParseResult.ParseError>
export const decodeAbsolutePath: (i: string) => Effect.Effect<AbsolutePath, ParseResult.ParseError>

// Option-based (returns None on failure)
export const divbanConfigSchemaVersion: (s: string) => Option.Option<DivbanConfigSchemaVersion>
```

**Usage sites:** Config loading, user input parsing, external API responses.

### Pattern B: Compile-time Validation (Literal constructors)

Used for hardcoded values where validity is guaranteed by TypeScript's type system.

```typescript
export const path = <const S extends AbsolutePathLiteral>(literal: S): AbsolutePath
export const serviceName = <const S extends string>(literal: S): ServiceName
export const duration = <const S extends DurationLiteral>(literal: S): DurationString
```

**Safety mechanism:** Template literal types restrict input to valid patterns at compile time. Variables cannot be passed - only string literals are accepted.

**Internal implementation:** Uses `as string as TypeName` which appears unsafe but is protected by the template literal constraint on the input parameter.

---

## Detailed Analysis by Module

### System Modules (`src/system/`) - WELL ENFORCED

**`user.ts`**
- All user operations correctly typed with `Username`, `UserId`, `GroupId`
- Range validation on UID allocation
- No escape hatches

**`systemctl.ts`**
- Service management properly uses `Username`, `UserId`
- No raw string substitution for user identities

**`directories.ts`**
- Path operations consistently use `AbsolutePath`
- Ownership uses `UserId`, `GroupId`
- `pathJoin()` preserves brand information

**`uid-allocator.ts`**
- Contains justified casts with detailed comments
- Line 118, 148, 217: Cast UIDs from validated ranges
- Line 183, 256: Cast SubordinateIds from validated search results
- All casts follow validation - safe pattern

### Configuration (`src/config/`) - MOSTLY WELL ENFORCED

**`schema.ts`**
- Effect Schema validation for all branded types
- Proper decode paths for external input
- Defaults use literal constructors: `path("/srv")`, `duration("30s")`

**`loader.ts`** - **ISSUE #2**
- Line 72: Unchecked cast to `DivbanConfigSchemaVersion`
- See Issues section below

### Path Operations (`src/lib/paths.ts`) - WELL ENFORCED

**`resolveToAbsolute`** (Line 124)
- Cast occurs after `startsWith("/")` validation
- Safe pattern with runtime check before brand application

### Service Layer (`src/services/`) - WELL ENFORCED

- Function signatures properly typed with `ServiceName`, `UserId`, `Username`
- No escapes to raw strings for domain values
- Config schemas use Effect Schema for branded type validation

### Quadlet Generation (`src/quadlet/`) - ISSUE IDENTIFIED

**`unit.ts`** - **ISSUE #1**
- Line 73: `fromUnitName` casts without validation
- See Issues section below

---

## Identified Issues

### Issue #1: Unchecked Cast in `quadlet/unit.ts`

**Location:** `src/quadlet/unit.ts:73`

```typescript
export const fromUnitName = (unitName: string): ContainerName =>
  pipe(unitName, stripSuffix(".service")) as string as ContainerName;
```

**Problem:**
- Accepts arbitrary string input
- Strips `.service` suffix
- Casts result to `ContainerName` without validating the pattern `[a-z][a-z0-9_.-]*`

**Impact:** Low - function is exported but grep shows it is **never used** in the codebase.

**Recommendation:**
1. Remove the function if truly unused, OR
2. Add validation:
```typescript
export const fromUnitName = (unitName: string): Option.Option<ContainerName> =>
  pipe(
    unitName,
    stripSuffix(".service"),
    decodeContainerName,
    Effect.option
  );
```

---

### Issue #2: Unchecked Cast in `config/loader.ts`

**Location:** `src/config/loader.ts:72`

```typescript
const version = (decoded as { divbanConfigSchemaVersion?: unknown }).divbanConfigSchemaVersion;
if (version !== undefined) {
  yield* validateConfigCompatibility(version as DivbanConfigSchemaVersion, filePath);
}
```

**Problem:**
- Extracts `version` as `unknown` via unsafe property access
- Casts directly to `DivbanConfigSchemaVersion` without validation
- Bypasses the `divbanConfigSchemaVersion()` smart constructor

**Impact:** Medium - malformed version strings could reach `validateConfigCompatibility`.

**Recommendation:**
```typescript
const versionField = (decoded as { divbanConfigSchemaVersion?: unknown }).divbanConfigSchemaVersion;
yield* pipe(
  versionField,
  Option.fromNullable,
  Option.flatMap((v) =>
    typeof v === "string" ? divbanConfigSchemaVersion(v) : Option.none()
  ),
  Option.match({
    onNone: () => Effect.void,
    onSome: (version) => validateConfigCompatibility(version, filePath),
  })
);
```

---

### Issue #3: Unused Type Guards

**Location:** `src/lib/types.ts:178-189`

```typescript
export const isUserId: (u: unknown) => u is UserId = Schema.is(UserIdSchema);
export const isGroupId: (u: unknown) => u is GroupId = Schema.is(GroupIdSchema);
// ... etc for all 10 branded types
```

**Finding:** None of these type guards are used anywhere in the codebase.

**Impact:** Low - dead code, not a type safety issue.

**Recommendation:** Either document intended use cases or remove to reduce API surface.

---

### Issue #4: Optional Config Empty Object Pattern

**Location:** Multiple CLI commands (`start.ts`, `stop.ts`, `restart.ts`, `logs.ts`, etc.)

```typescript
type ConfigType = Parameters<(typeof s.configTag)["of"]>[0];
const config = Either.match(configResult, {
  onLeft: (): ConfigType => ({}) as ConfigType,
  onRight: (cfg): ConfigType => cfg,
});
```

**Analysis:**
- Creates empty `{}` and casts to service config type
- Intentional pattern for CLI commands where config is optional
- Services must handle missing config gracefully

**Impact:** Low - intentional design decision, not a type safety bug.

**Recommendation:** Document this pattern in code comments explaining the design rationale.

---

## Cast Analysis Summary

| Category | Count | Safety |
|----------|-------|--------|
| Literal constructor casts (`as string as T`) | 16 | Safe - compile-time validated |
| Range-validated casts (UID allocation) | 5 | Safe - runtime checked with comments |
| Path validation cast (`startsWith("/")`) | 1 | Safe - runtime checked |
| Empty config casts | 6 | Intentional - documented pattern |
| Type alias imports | 20+ | Safe - aliasing only |
| Unchecked casts | 2 | **Issues #1, #2** |

**Total casts analyzed:** 50+
**Unsafe casts requiring fixes:** 2

---

## Enforcement Mechanisms

### Strong Mechanisms (Working Well)

1. **Effect Schema validation** - All public APIs use schema-based decode functions
2. **Decode functions universally available** - `decodeUsername`, `decodeAbsolutePath`, etc.
3. **Literal constructors** - Compile-time validation for hardcoded values
4. **Justified cast comments** - `uid-allocator.ts` explains all casts
5. **NoUncheckedIndexedAccess** - TypeScript config enforces safe array access

### Potential Improvements

1. **Type guards unused** - Available but not utilized
2. **No static analysis** - No enforcement that decode functions must be used for untrusted input
3. **Pattern documentation** - Empty config pattern not formally documented

---

## Recommendations

### Priority 1: Must Fix

1. **`config/loader.ts:72`** - Use `divbanConfigSchemaVersion()` with proper Option matching instead of direct cast

2. **`quadlet/unit.ts:73`** - Either remove `fromUnitName` (unused) or add validation

### Priority 2: Should Fix

3. **Document optional config pattern** - Add code comments explaining the empty object cast rationale in CLI commands

4. **Review type guards** - Decide whether to use them or remove as dead code

### Priority 3: Nice to Have

5. **Add ESLint rule** - Custom rule to flag `as BrandedType` casts without adjacent validation

6. **Conversion function documentation** - Document when to use `userIdToGroupId` vs casting

---

## Conclusion

The divban codebase demonstrates **excellent branded type discipline**:

- Comprehensive type definitions covering all domain concepts
- Proper separation between compile-time and runtime validation
- Consistent patterns across modules
- Recent commit history shows ongoing improvement (084f376: "branded type tightening")

**Only 2 actionable issues identified**, both minor and easily fixed. The architecture strongly enforces type safety and serves as a good reference implementation for Effect-based TypeScript projects.
