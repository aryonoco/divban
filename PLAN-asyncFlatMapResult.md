# Plan: Implement `asyncFlatMapResult` and Refactor Codebase

## Summary

Add an async variant of `flatMapResult` to enable functional chaining of async Result operations, then refactor 5 identified instances across 4 files.

**Total changes:** 1 new function + 5 refactored call sites across 4 files.

---

## Part 1: Implementation

### File: `src/lib/result.ts`

Add the new function after `flatMapResult` (around line 48).

#### Design Rationale

**Naming:** `asyncFlatMapResult` follows the existing naming convention (`mapResult`, `flatMapResult`, `mapErr`) with an `async` prefix to clearly indicate the async nature.

**Signature Options Considered:**

1. **Option A - Async continuation only (RECOMMENDED):**
   ```typescript
   asyncFlatMapResult<T, U, E>(
     result: Result<T, E>,
     fn: (value: T) => Promise<Result<U, E>>
   ): Promise<Result<U, E>>
   ```
   - Takes a sync `Result`, async continuation
   - Caller awaits the first result before calling
   - Simple, explicit, matches existing patterns

2. **Option B - Accept Promise input:**
   ```typescript
   asyncFlatMapResult<T, U, E>(
     result: Result<T, E> | Promise<Result<T, E>>,
     fn: (value: T) => Promise<Result<U, E>>
   ): Promise<Result<U, E>>
   ```
   - More flexible but adds complexity
   - Overloads needed for proper typing

3. **Option C - Fully polymorphic:**
   ```typescript
   asyncFlatMapResult<T, U, E>(
     result: Result<T, E> | Promise<Result<T, E>>,
     fn: (value: T) => Result<U, E> | Promise<Result<U, E>>
   ): Promise<Result<U, E>>
   ```
   - Maximum flexibility
   - Complex implementation, harder to reason about

**Recommendation:** Option A is cleanest. The caller can simply `await` the first operation before passing to `asyncFlatMapResult`. This matches how the existing sync `flatMapResult` works and keeps the API predictable.

#### Implementation

```typescript
/**
 * Async FlatMap (chain) over a successful result.
 * Allows sequencing operations where the continuation returns a Promise<Result>.
 *
 * @example
 * // Chain sync result to async operation
 * return asyncFlatMapResult(toAbsolute(path), (p) => loadServiceConfig(p, schema));
 *
 * @example
 * // Chain two async operations
 * return asyncFlatMapResult(await stopStack(stack, opts), () => startStack(stack, opts));
 */
export const asyncFlatMapResult = async <T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Promise<Result<U, E>>
): Promise<Result<U, E>> => (result.ok ? fn(result.value) : result);
```

**Properties:**
- Returns early with error if input result is `Err` (no async operation executed)
- Type-safe: error type `E` is preserved through the chain
- Minimal implementation: 1 line of actual logic
- Matches FP conventions (monadic bind/flatMap for async)

---

## Part 2: Refactoring Instances

### Change 1: `src/system/fs.ts` - `atomicWrite`

**Lines:** 169-187

**Current:**
```typescript
export const atomicWrite = async (
  filePath: AbsolutePath,
  content: string
): Promise<Result<void, DivbanError>> => {
  const tempPath = pathWithSuffix(
    filePath,
    `.tmp.${Bun.nanoseconds()}.${Math.random().toString(36).slice(2, 8)}`
  );

  const writeResult = await writeFile(tempPath, content);
  if (!writeResult.ok) {
    return writeResult;
  }

  return tryCatch(
    () => rename(tempPath, filePath),
    (e) => wrapError(e, ErrorCode.FILE_WRITE_FAILED, `Failed to atomically write: ${filePath}`)
  );
};
```

**Refactored:**
```typescript
export const atomicWrite = async (
  filePath: AbsolutePath,
  content: string
): Promise<Result<void, DivbanError>> => {
  const tempPath = pathWithSuffix(
    filePath,
    `.tmp.${Bun.nanoseconds()}.${Math.random().toString(36).slice(2, 8)}`
  );

  return asyncFlatMapResult(await writeFile(tempPath, content), () =>
    tryCatch(
      () => rename(tempPath, filePath),
      (e) => wrapError(e, ErrorCode.FILE_WRITE_FAILED, `Failed to atomically write: ${filePath}`)
    )
  );
};
```

**Import update:** Add `asyncFlatMapResult` to the import from `"../lib/result"`.

---

### Change 2: `src/cli/commands/utils.ts` - `resolveServiceConfig` (first occurrence)

**Lines:** 67-72

**Current:**
```typescript
if (explicitPath) {
  const pathResult = toAbsolute(explicitPath);
  if (!pathResult.ok) {
    return pathResult;
  }
  return loadServiceConfig(pathResult.value, service.definition.configSchema);
}
```

**Refactored:**
```typescript
if (explicitPath) {
  return asyncFlatMapResult(toAbsolute(explicitPath), (path) =>
    loadServiceConfig(path, service.definition.configSchema)
  );
}
```

**Import update:** Add `asyncFlatMapResult` to the import from `"../../lib/result"`.

---

### Change 3: `src/cli/commands/utils.ts` - `resolveServiceConfig` (second occurrence)

**Lines:** 80-85

**Current:**
```typescript
for (const p of searchPaths) {
  const file = Bun.file(p);
  if (await file.exists()) {
    const pathResult = toAbsolute(p);
    if (!pathResult.ok) {
      return pathResult;
    }
    return loadServiceConfig(pathResult.value, service.definition.configSchema);
  }
}
```

**Refactored:**
```typescript
for (const p of searchPaths) {
  const file = Bun.file(p);
  if (await file.exists()) {
    return asyncFlatMapResult(toAbsolute(p), (path) =>
      loadServiceConfig(path, service.definition.configSchema)
    );
  }
}
```

---

### Change 4: `src/stack/orchestrator.ts` - `restartStack`

**Lines:** 166-171

**Current:**
```typescript
export const restartStack = async (
  stack: Stack,
  options: OrchestratorOptions
): Promise<Result<void, DivbanError>> => {
  const { logger } = options;

  logger.info(`Restarting stack '${stack.name}'...`);

  // Stop then start (to maintain proper order)
  const stopResult = await stopStack(stack, options);
  if (!stopResult.ok) {
    return stopResult;
  }

  return startStack(stack, options);
};
```

**Refactored:**
```typescript
export const restartStack = async (
  stack: Stack,
  options: OrchestratorOptions
): Promise<Result<void, DivbanError>> => {
  const { logger } = options;

  logger.info(`Restarting stack '${stack.name}'...`);

  // Stop then start (to maintain proper order)
  return asyncFlatMapResult(await stopStack(stack, options), () =>
    startStack(stack, options)
  );
};
```

**Import update:** Add `asyncFlatMapResult` to the import from `"../lib/result"`.

---

### Change 5: `src/services/immich/index.ts` - `restart`

**Lines:** 377-384

**Current:**
```typescript
const restart = async (ctx: ServiceContext<ImmichConfig>): Promise<Result<void, DivbanError>> => {
  ctx.logger.info("Restarting Immich...");
  const stopResult = await stop(ctx);
  if (!stopResult.ok) {
    return stopResult;
  }
  return start(ctx);
};
```

**Refactored:**
```typescript
const restart = async (ctx: ServiceContext<ImmichConfig>): Promise<Result<void, DivbanError>> => {
  ctx.logger.info("Restarting Immich...");
  return asyncFlatMapResult(await stop(ctx), () => start(ctx));
};
```

**Import update:** Add `asyncFlatMapResult` to the import from `"../../lib/result"`.

---

## Part 3: Summary of File Changes

| File | Changes |
|------|---------|
| `src/lib/result.ts` | Add `asyncFlatMapResult` function (~10 lines) |
| `src/system/fs.ts` | Update import, refactor `atomicWrite` |
| `src/cli/commands/utils.ts` | Update import, refactor 2 instances in `resolveServiceConfig` |
| `src/stack/orchestrator.ts` | Update import, refactor `restartStack` |
| `src/services/immich/index.ts` | Update import, refactor `restart` |

---

## Part 4: Verification

Run the following after making changes:

```bash
# Full CI (format, lint, typecheck, test)
just ci
```

All checks must pass with no errors.

---

## Part 5: Future Considerations

### Additional FP Utilities (Not in Scope)

If more async Result patterns emerge, consider:

1. **`asyncMapResult`** - Transform value with async function:
   ```typescript
   asyncMapResult<T, U, E>(
     result: Result<T, E>,
     fn: (value: T) => Promise<U>
   ): Promise<Result<U, E>>
   ```

2. **`asyncSequence`** - Already exists but could be enhanced

3. **`pipe` / `flow` utilities** - For chaining multiple operations

### Patterns NOT Addressed

These patterns exist but are deliberately excluded:

- **Error transformation chains** - Need `mapErr` or custom handling
- **Multi-value extraction** - Value used multiple times, can't be chained
- **Side-effect interleaving** - Logging between operations breaks purity
