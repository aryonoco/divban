# Comprehensive Bun Optimization Plan for Divban

This plan identifies all opportunities to leverage Bun's standard library and compatible Node.js APIs throughout the codebase, ensuring correct, optimal, and idiomatic usage.

---

## Current State Assessment

### Already Using (Excellent Coverage)

The codebase already leverages many Bun APIs effectively:

| Module | Bun APIs Used | Status |
|--------|--------------|--------|
| `src/system/exec.ts` | `Bun.spawn()`, `Bun.$`, `Bun.env`, `Bun.readableStreamToText()` | Optimal |
| `src/system/fs.ts` | `Bun.file()`, `Bun.write()`, `Bun.Glob`, `Bun.hash()`, `Bun.CryptoHasher`, `Bun.nanoseconds()`, `Bun.deepEquals()` | Optimal |
| `src/system/compress.ts` | `Bun.gzipSync()`, `Bun.gunzipSync()`, `Bun.deflateSync()`, `Bun.inflateSync()`, `Bun.zstdCompress()`, `Bun.zstdDecompress()` | Optimal |
| `src/lib/utils.ts` | `Bun.randomUUIDv7()`, `Bun.sleep()`, `Bun.sleepSync()`, `Bun.stringWidth()`, `Bun.escapeHTML()`, `Bun.fileURLToPath()`, `Bun.pathToFileURL()`, `Bun.color()`, `Bun.readableStreamTo*()`, `peek()` | Optimal |
| `src/lib/semver.ts` | `Bun.semver` | Optimal |
| `src/lib/timing.ts` | `Bun.nanoseconds()`, `Bun.sleep()` | Optimal |
| `src/config/loader.ts` | `Bun.file()`, `Bun.TOML.parse()`, `Bun.env` | Optimal |
| `src/services/immich/commands/backup.ts` | `Bun.zstdCompressSync()`, `Bun.gzipSync()`, `Bun.Glob`, `Bun.write()`, `Bun.file()` | Optimal |

---

## Optimization Opportunities

### 1. HIGH PRIORITY: Bun.Archive for Backup Operations

**Files affected:** `src/services/immich/commands/backup.ts`, `src/services/actual/commands/backup.ts`

**Current:** Database dumps are compressed and written as single files
**Opportunity:** Use `Bun.Archive` for creating tar archives when backing up multiple files/directories

```typescript
// Before: Individual file compression
const compressed = Bun.gzipSync(data);
await Bun.write(path, compressed);

// After: Native tar archive creation with multiple files
import { Archive } from "bun";

const archive = new Bun.Archive({
  "database.sql": dumpData,
  "config.toml": configData,
  "metadata.json": JSON.stringify(metadata),
}, { compress: "gzip" });

await Bun.write("backup.tar.gz", archive);
```

**Benefits:**
- Single atomic backup file containing multiple components
- Native tar support without external dependencies
- Automatic compression with gzip or no compression
- Extractable with standard `tar` command

**Implementation tasks:**
- [ ] Create `src/system/archive.ts` with `Bun.Archive` wrappers
- [ ] Update backup commands to create tar archives with metadata
- [ ] Update restore commands to extract using `Bun.Archive`

---

### 2. HIGH PRIORITY: FileSink for Incremental Log Writing

**Files affected:** `src/lib/logger.ts`, potential new `src/system/logfile.ts`

**Current:** Not using incremental file writing
**Opportunity:** Use `Bun.file().writer()` for high-performance incremental log writing

```typescript
// Create incremental file writer
const logFile = Bun.file("/var/log/divban/service.log");
const writer = logFile.writer({ highWaterMark: 64 * 1024 }); // 64KB buffer

// Write log entries incrementally (auto-flushes at high water mark)
writer.write(`[${timestamp}] ${level}: ${message}\n`);

// Explicit flush when needed
await writer.flush();

// Close when done
await writer.end();
```

**Benefits:**
- Buffered writes reduce syscall overhead
- Auto-flush at configurable high water mark
- Perfect for high-throughput logging scenarios

**Implementation tasks:**
- [ ] Add `FileSink` wrapper in `src/system/fs.ts`
- [ ] Consider using for service log aggregation

---

### 3. HIGH PRIORITY: Bun.inspect for Debug Output

**Files affected:** `src/lib/logger.ts`, error handling throughout

**Current:** Using `JSON.stringify` or manual object formatting
**Opportunity:** Use `Bun.inspect()` for pretty-printing objects in debug mode

```typescript
// Before
console.log(JSON.stringify(obj, null, 2));

// After
console.log(Bun.inspect(obj));

// With table formatting
console.log(Bun.inspect.table(services));
```

**Benefits:**
- Matches `console.log` output exactly
- Custom inspection via `Bun.inspect.custom` symbol
- Table formatting with `Bun.inspect.table()`
- Proper handling of circular references, Buffers, etc.

**Implementation tasks:**
- [ ] Add `inspect()` utility in `src/lib/utils.ts`
- [ ] Update logger to use `Bun.inspect` for object formatting
- [ ] Add custom inspection to key classes using `[Bun.inspect.custom]`

---

### 4. MEDIUM PRIORITY: Bun.stripANSI for Clean Output

**Files affected:** `src/lib/logger.ts`, `src/cli/help.ts`

**Current:** Not stripping ANSI codes when needed
**Opportunity:** Use `Bun.stripANSI()` for log file output and diff comparison

```typescript
// Strip ANSI for file output or when piping
const cleanText = Bun.stripANSI(coloredText);

// Use in logger for file output (no colors in log files)
const fileMessage = Bun.stripANSI(formattedMessage);
```

**Benefits:**
- 6-57x faster than `strip-ansi` npm package
- Useful for log files, CI output comparison
- Clean text comparison without color codes affecting diffs

**Implementation tasks:**
- [ ] Add `stripANSI()` export in `src/lib/utils.ts`
- [ ] Use in logger for file output mode

---

### 5. MEDIUM PRIORITY: ArrayBufferSink for Buffer Construction

**Files affected:** `src/services/*/commands/backup.ts`

**Current:** Using string concatenation or array joins
**Opportunity:** Use `Bun.ArrayBufferSink` for building large binary buffers

```typescript
const sink = new Bun.ArrayBufferSink();
sink.start({ asUint8Array: true, highWaterMark: 1024 * 1024 });

// Write chunks incrementally
sink.write(chunk1);
sink.write(chunk2);
sink.write(chunk3);

// Get final result
const result = sink.end(); // Uint8Array
```

**Benefits:**
- Efficient incremental buffer construction
- Pre-allocated internal buffer
- Streaming mode with periodic flush
- No intermediate array allocations

**Implementation tasks:**
- [ ] Add `BufferBuilder` class wrapping `ArrayBufferSink` in `src/lib/utils.ts`
- [ ] Use for backup file construction where applicable

---

### 6. MEDIUM PRIORITY: Direct ReadableStream for Performance

**Files affected:** `src/system/exec.ts`

**Current:** Using standard ReadableStream
**Opportunity:** Use direct ReadableStream for zero-copy data handling

```typescript
const stream = new ReadableStream({
  type: "direct", // Enable direct mode
  pull(controller) {
    controller.write(data); // Zero-copy write
  },
});
```

**Benefits:**
- No queueing overhead
- Zero-copy writes directly to consumer
- Better performance for large data transfers

**Implementation tasks:**
- [ ] Evaluate if any streaming operations would benefit
- [ ] Add utility for creating direct streams

---

### 7. MEDIUM PRIORITY: Shell Utilities

**Files affected:** `src/system/exec.ts`

**Current:** Using raw shell commands
**Opportunity:** Leverage Bun Shell utilities for safer command construction

```typescript
import { $ } from "bun";

// Brace expansion for multiple commands
const expanded = await $.braces("echo {1,2,3}");
// => ["echo 1", "echo 2", "echo 3"]

// Safe escaping
const safe = $.escape('dangerous; rm -rf /');
// => "dangerous\\; rm -rf /"

// Raw insertion when needed (bypass escaping)
await $`echo ${{ raw: unsafeButTrusted }}`;
```

**Benefits:**
- Built-in escaping prevents injection
- Brace expansion support
- Cross-platform compatibility

**Implementation tasks:**
- [ ] Add `shellEscape()` utility wrapping `$.escape()`
- [ ] Add `shellBraces()` utility wrapping `$.braces()`

---

### 8. LOW PRIORITY: Password Hashing (If Needed)

**Files affected:** Future authentication features

**Current:** Not applicable (no authentication)
**Opportunity:** Use `Bun.password` for secure password hashing

```typescript
// Hash password with argon2id (default, most secure)
const hash = await Bun.password.hash(password);

// Or use bcrypt for compatibility
const bcryptHash = await Bun.password.hash(password, {
  algorithm: "bcrypt",
  cost: 10,
});

// Verify (auto-detects algorithm from hash)
const isMatch = await Bun.password.verify(password, hash);
```

**Benefits:**
- Native argon2id and bcrypt support
- No external dependencies
- Auto-detects algorithm during verification
- SHA-512 pre-hashing for bcrypt with long passwords

**Implementation tasks:**
- [ ] Reserve for future authentication needs

---

### 9. LOW PRIORITY: More Hash Algorithms

**Files affected:** `src/system/fs.ts`

**Current:** Using `Bun.hash()` (wyhash) and `Bun.CryptoHasher` (sha256)
**Opportunity:** Expose more hash algorithms for specific use cases

```typescript
// Already using
Bun.hash("data"); // wyhash (fast, default)
Bun.hash.xxHash64("data"); // Also fast

// Could add
Bun.hash.crc32("data");     // CRC32 for checksums
Bun.hash.cityHash64("data"); // CityHash for strings
Bun.hash.murmur32v3("data"); // MurmurHash for hash tables
Bun.hash.rapidhash("data");  // Rapidhash (very fast)
```

**Implementation tasks:**
- [ ] Add hash algorithm options to `hashContent()` function
- [ ] Export specific hash functions as needed

---

### 10. LOW PRIORITY: Enhanced Glob Patterns

**Files affected:** `src/system/fs.ts`

**Current:** Basic glob support
**Opportunity:** Use more glob features for complex patterns

```typescript
// Node.js fs.glob compatibility (array of patterns, exclude)
import { promises } from "node:fs";

const files = await promises.glob(["**/*.ts", "**/*.js"], {
  exclude: ["node_modules/**", "*.test.*"],
});
```

**Implementation tasks:**
- [ ] Add `globFilesWithExclude()` function using Node.js fs.glob

---

## Implementation Checklist

### Phase 1: High Priority (Week 1)

- [ ] **1.1** Create `src/system/archive.ts`
  ```typescript
  export const createArchive = (files: Record<string, string | Blob | Uint8Array>, options?: { compress?: "gzip" }) => ...
  export const extractArchive = (data: Uint8Array, destPath: string, options?: { glob?: string }) => ...
  export const readArchive = (data: Uint8Array) => ... // Returns Map<string, File>
  ```

- [ ] **1.2** Update backup commands to use Bun.Archive
  - Include metadata.json with backup info
  - Include config snapshots in backup archive

- [ ] **1.3** Add `Bun.inspect` utilities
  ```typescript
  export const inspect = (obj: unknown) => Bun.inspect(obj)
  export const inspectTable = (data: unknown[], cols?: string[]) => Bun.inspect.table(data, cols)
  ```

- [ ] **1.4** Add `Bun.stripANSI` utility
  ```typescript
  export const stripANSI = (text: string) => Bun.stripANSI(text)
  ```

### Phase 2: Medium Priority (Week 2)

- [ ] **2.1** Add FileSink utilities for incremental writing
  ```typescript
  export const createWriter = (path: string, options?: { highWaterMark?: number }) => ...
  ```

- [ ] **2.2** Add ArrayBufferSink utilities
  ```typescript
  export const createBufferBuilder = (options?: { asUint8Array?: boolean }) => ...
  ```

- [ ] **2.3** Add shell escape utilities
  ```typescript
  export const shellEscape = (str: string) => $.escape(str)
  export const shellBraces = (template: string) => $.braces(template)
  ```

### Phase 3: Low Priority (Week 3+)

- [ ] **3.1** Add extended hash algorithm support
- [ ] **3.2** Add glob exclude pattern support
- [ ] **3.3** Document password hashing for future use
- [ ] **3.4** Consider direct ReadableStream for streaming operations

---

## API Coverage Summary

| Bun API | Current Usage | Recommended Action |
|---------|--------------|-------------------|
| `Bun.file()` | Yes | Maintain |
| `Bun.write()` | Yes | Maintain |
| `Bun.spawn()` | Yes | Maintain |
| `Bun.$` | Yes | Add $.escape(), $.braces() |
| `Bun.Glob` | Yes | Add exclude patterns |
| `Bun.TOML.parse()` | Yes | Maintain |
| `Bun.semver` | Yes | Maintain |
| `Bun.gzipSync/gunzipSync` | Yes | Maintain |
| `Bun.deflateSync/inflateSync` | Yes | Maintain |
| `Bun.zstdCompress/Decompress` | Yes | Maintain |
| `Bun.hash()` | Yes | Expose more algorithms |
| `Bun.CryptoHasher` | Yes | Maintain |
| `Bun.nanoseconds()` | Yes | Maintain |
| `Bun.sleep/sleepSync` | Yes | Maintain |
| `Bun.which()` | Yes | Maintain |
| `Bun.stringWidth()` | Yes | Maintain |
| `Bun.deepEquals()` | Yes | Maintain |
| `Bun.escapeHTML()` | Yes | Maintain |
| `Bun.randomUUIDv7()` | Yes | Maintain |
| `Bun.readableStreamTo*()` | Yes | Maintain |
| `Bun.env` | Yes | Maintain |
| `Bun.color()` | Yes | Maintain |
| `peek()` | Yes | Maintain |
| **`Bun.Archive`** | **No** | **Add for backups** |
| **`Bun.inspect()`** | **No** | **Add for debug** |
| **`Bun.stripANSI()`** | **No** | **Add utility** |
| **`FileSink`** | **No** | **Add for logging** |
| **`ArrayBufferSink`** | **No** | **Consider** |
| `Bun.password` | No | Reserve for future |
| `Direct ReadableStream` | No | Evaluate need |

---

## Performance Impact Estimates

| Optimization | Expected Benefit |
|-------------|-----------------|
| Bun.Archive for backups | Atomic multi-file backups, no external tar dependency |
| Bun.inspect for debugging | Cleaner debug output, custom inspection |
| Bun.stripANSI | 6-57x faster ANSI stripping |
| FileSink for logging | Reduced syscalls, better I/O performance |
| ArrayBufferSink | Zero-copy buffer construction |
| Shell utilities | Safer command construction |

---

## Conclusion

The divban codebase already demonstrates **excellent Bun API adoption**. The main opportunities are:

1. **Bun.Archive** - New API that provides native tar archive support, perfect for backup operations
2. **Bun.inspect** - Better debug output formatting
3. **Bun.stripANSI** - Fast ANSI code removal for log files
4. **FileSink/ArrayBufferSink** - Incremental writing for performance-critical paths

These optimizations will further reduce external dependencies and improve performance while maintaining the idiomatic Bun patterns already established.
