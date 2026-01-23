# Comment Review Catalogue

This document catalogues comments across the divban codebase that describe "what" the code does rather than "why" it does it. Good comments should explain non-obvious decisions, constraints, trade-offs, or historical context rather than restating what the code already communicates through its structure.

## Review Summary

- **Total files reviewed:** 144 TypeScript files
- **Review criteria:** Comments that describe "what" instead of "why", duplicate function/variable names, or lack context about decisions

## Review Criteria

Comments are flagged if they:
1. Describe **what** the code does (which should be clear from the code itself)
2. Duplicate information already obvious from variable/function names
3. Lack context about **why** a decision was made or **why** the code exists
4. Are outdated or don't match the code

Good comments explain:
- Why a particular approach was chosen
- Non-obvious constraints or requirements
- Edge cases being handled
- Historical context or trade-offs

---

## src/cli/commands/backup-config.ts

### Line 11
**Current comment:** `/** Backup service configuration files. */`
**Issue:** Describes what the function does, which is already clear from the function name `backupConfig`. Consider explaining why backing up config separately from data might be useful.

---

## src/cli/commands/backup.ts

### Line 11
**Current comment:** `/** Backup service data using service-specific backup command. */`
**Issue:** Restates function name. Could explain what data is included vs excluded, or why service-specific commands are used.

---

## src/cli/commands/diff.ts

### Line 11
**Current comment:** `/** Show differences between generated and deployed files. */`
**Issue:** Describes what the command does. Could explain the use case (debugging, verifying changes before deploy).

---

## src/cli/commands/generate.ts

### Line 11
**Current comment:** `/** Generate Quadlet files for a service. */`
**Issue:** Restates the obvious. Could explain when generation is needed vs when files are auto-generated.

---

## src/cli/commands/logs.ts

### Line 11
**Current comment:** `/** Stream logs from a service. */`
**Issue:** Describes functionality clear from name. Could explain journalctl integration or log filtering behavior.

---

## src/cli/commands/reload.ts

### Line 11
**Current comment:** `/** Reload a service (signal running container to reload config). */`
**Issue:** Partially helpful but could explain which services support reload vs requiring restart.

---

## src/cli/commands/restart.ts

### Line 11
**Current comment:** `/** Restart a running service. */`
**Issue:** Obvious from name. Could explain restart behavior (graceful vs hard), service dependencies.

---

## src/cli/commands/restore.ts

### Line 11
**Current comment:** `/** Restore service data from backup. */`
**Issue:** Describes the obvious. Could explain restore prerequisites, data validation, or rollback behavior.

---

## src/cli/commands/secret.ts

### Line 11
**Current comment:** `/** Manage service secrets using age encryption and podman. */`
**Issue:** Describes tools used but not why this approach was chosen over alternatives.

---

## src/cli/commands/setup.ts

### Line 11
**Current comment:** `/** Set up a new service. */`
**Issue:** Restates command name. Could explain the setup flow, prerequisites, or idempotency guarantees.

---

## src/cli/commands/start.ts

### Line 11
**Current comment:** `/** Start a service. */`
**Issue:** Completely redundant with function name.

---

## src/cli/commands/status.ts

### Line 11
**Current comment:** `/** Show service status. */`
**Issue:** Redundant. Could explain what status information is shown and how it's gathered.

---

## src/cli/commands/stop.ts

### Line 11
**Current comment:** `/** Stop a running service. */`
**Issue:** Redundant. Could explain graceful shutdown behavior or timeout.

---

## src/cli/commands/update.ts

### Line 11
**Current comment:** `/** Update a service to use new configuration or container image. */`
**Issue:** Partially helpful. Could explain the update strategy (rolling, blue-green) or downtime implications.

---

## src/cli/commands/validate.ts

### Line 11
**Current comment:** `/** Validate configuration file. */`
**Issue:** Redundant. Could explain what validation checks are performed.

---

## src/cli/help.ts

### Line 9
**Current comment:** `/** CLI help system. */`
**Issue:** Obvious from filename. Could explain help formatting approach or extensibility.

---

## src/cli/parser.ts

### Line 9
**Current comment:** `/** CLI argument parser. */`
**Issue:** Obvious. Could explain why a custom parser vs using a library.

---

## src/config/loader.ts

### Line 9
**Current comment:** `/** TOML configuration loader with Effect Schema validation. */`
**Issue:** Describes what. Could explain error recovery strategy or validation ordering.

---

## src/config/merge.ts

### Line 8
**Current comment:** `/** Configuration merging utilities. */`
**Issue:** Obvious. Could explain merge precedence rules or conflict resolution.

---

## src/config/schema.ts

### Lines 9-11
**Current comment:** `/** Configuration schema definitions using Effect Schema. */`
**Issue:** Describes what. Could explain schema design decisions or validation philosophy.

---

## src/lib/backup-utils.ts

### Line 9
**Current comment:** `/** Backup utility functions. */`
**Issue:** Redundant with filename.

---

## src/lib/char.ts

### Line 9
**Current comment:** `/** Character predicates and utilities. */`
**Issue:** Obvious. Could explain why character-level utilities are needed vs regex.

---

## src/lib/collection-utils.ts

### Line 9
**Current comment:** `/** Collection transformation utilities. */`
**Issue:** Obvious. Could explain the functional style choice.

---

## src/lib/errors.ts

### Line 9
**Current comment:** `/** Error types and error codes. */`
**Issue:** Obvious. Could explain error code organization or error handling philosophy.

---

## src/lib/file-parsers.ts

### Line 9
**Current comment:** `/** File format parsers for system files. */`
**Issue:** Partially helpful. Could explain which system files and why parsing is needed.

---

## src/lib/option-helpers.ts

### Line 9
**Current comment:** `/** Option type helpers for Effect. */`
**Issue:** Obvious. Could explain when to use these vs Effect's built-ins.

---

## src/lib/paths.ts

### Line 9
**Current comment:** `/** Path constants and utilities. */`
**Issue:** Obvious. Could explain the path organization strategy.

---

## src/lib/retry.ts

### Line 9
**Current comment:** `/** Retry schedules for Effect. */`
**Issue:** Partially helpful. Could explain the retry strategy philosophy (exponential backoff rationale, jitter).

---

## src/lib/schema-utils.ts

### Line 9
**Current comment:** `/** Schema utilities for Effect Schema. */`
**Issue:** Obvious.

---

## src/lib/str-transform.ts

### Line 9
**Current comment:** `/** String transformation utilities using functional patterns. */`
**Issue:** Partially helpful. Could explain why functional string transforms vs methods.

---

## src/lib/str.ts

### Line 9
**Current comment:** `/** String utilities. */`
**Issue:** Redundant with filename.

---

## src/lib/types.ts

### Line 9
**Current comment:** `/** Branded types and type utilities. */`
**Issue:** Partially helpful. Could explain the branding strategy and when to use branded vs raw types.

---

## src/quadlet/container/capabilities.ts

### Line 9
**Current comment:** `/** Container capability entries for Quadlet files. */`
**Issue:** Describes what. Could explain Linux capabilities model or security implications.

---

## src/quadlet/container/environment.ts

### Line 9
**Current comment:** `/** Container environment variable entries. */`
**Issue:** Obvious.

---

## src/quadlet/container/health.ts

### Line 9
**Current comment:** `/** Container health check entries. */`
**Issue:** Obvious. Could explain health check strategies.

---

## src/quadlet/container/image.ts

### Line 9
**Current comment:** `/** Container image entries for Quadlet files. */`
**Issue:** Obvious.

---

## src/quadlet/container/misc.ts

### Line 9
**Current comment:** `/** Miscellaneous container entries. */`
**Issue:** Vague. Could explain what "miscellaneous" means or why these don't fit elsewhere.

---

## src/quadlet/container/network.ts

### Line 9
**Current comment:** `/** Container network configuration entries. */`
**Issue:** Obvious. Could explain networking modes and when to use each.

---

## src/quadlet/container/resources.ts

### Line 9
**Current comment:** `/** Container resource limit entries. */`
**Issue:** Obvious. Could explain resource limit defaults or guidance.

---

## src/quadlet/container/secrets.ts

### Line 9
**Current comment:** `/** Container secret entries for Quadlet files. */`
**Issue:** Obvious.

---

## src/quadlet/container/security.ts

### Line 9
**Current comment:** `/** Container security entries. */`
**Issue:** Obvious. Could explain security model or default posture.

---

## src/quadlet/container/user.ts

### Line 9
**Current comment:** `/** Container user namespace entries. */`
**Issue:** Obvious. Could explain user namespace modes and security implications.

---

## src/quadlet/container/volumes.ts

### Line 9
**Current comment:** `/** Container volume mount entries. */`
**Issue:** Obvious.

---

## src/quadlet/entry-combinators.ts

### Line 9
**Current comment:** `/** Quadlet entry combinators for composition. */`
**Issue:** Partially helpful. Could explain the combinator pattern and composition strategy.

---

## src/quadlet/entry.ts

### Line 9
**Current comment:** `/** Quadlet entry types and constructors. */`
**Issue:** Obvious.

---

## src/quadlet/factory.ts

### Line 9
**Current comment:** `/** Quadlet factory functions for creating files. */`
**Issue:** Describes what. Could explain the factory pattern choice.

---

## src/quadlet/format.ts

### Line 9
**Current comment:** `/** Quadlet INI format utilities. */`
**Issue:** Obvious.

---

## src/quadlet/network.ts

### Line 9
**Current comment:** `/** Quadlet network file generation. */`
**Issue:** Obvious.

---

## src/quadlet/service.ts

### Line 9
**Current comment:** `/** Quadlet service section generation. */`
**Issue:** Obvious.

---

## src/quadlet/types.ts

### Line 9
**Current comment:** `/** Quadlet type definitions. */`
**Issue:** Redundant with filename.

---

## src/quadlet/unit.ts

### Line 9
**Current comment:** `/** Quadlet unit section generation. */`
**Issue:** Obvious.

---

## src/quadlet/volume.ts

### Line 9
**Current comment:** `/** Quadlet volume file generation. */`
**Issue:** Obvious.

---

## src/services/actual/commands/backup.ts

### Line 9
**Current comment:** `/** Actual Budget backup command implementation. */`
**Issue:** Obvious from path.

---

## src/services/caddy/caddyfile/directives.ts

### Line 9
**Current comment:** `/** Caddyfile directive generation. */`
**Issue:** Obvious.

---

## src/services/caddy/caddyfile/format.ts

### Lines 8-10
**Current comment:** `/** Caddyfile DSL for generating valid Caddy configurations. */`
**Issue:** Partially helpful. Could explain the DSL design philosophy.

---

## src/services/caddy/caddyfile/global.ts

### Line 9
**Current comment:** `/** Global options block generation for Caddyfile. */`
**Issue:** Obvious.

---

## src/services/caddy/caddyfile/matchers.ts

### Line 9
**Current comment:** `/** Named matcher generation for Caddyfile. */`
**Issue:** Obvious. Could explain Caddy matcher semantics.

---

## src/services/caddy/caddyfile/sites.ts

### Line 9
**Current comment:** `/** Site block generation for Caddyfile. */`
**Issue:** Obvious.

---

## src/services/caddy/caddyfile/snippets.ts

### Line 9
**Current comment:** `/** Snippet generation for Caddyfile. */`
**Issue:** Obvious.

---

## src/services/helpers.ts

### Line 9
**Current comment:** `/** Service helper utilities and tracked resource operations. */`
**Issue:** Partially helpful. Could explain the tracked resource pattern motivation.

---

## src/services/immich/commands/backup.ts

### Line 9
**Current comment:** `/** Immich backup command implementation. */`
**Issue:** Obvious from path.

---

## src/services/immich/commands/restore.ts

### Line 9
**Current comment:** `/** Immich restore command implementation. */`
**Issue:** Obvious from path.

---

## src/services/immich/hardware/index.ts

### Line 9
**Current comment:** `/** Hardware acceleration detection and configuration. */`
**Issue:** Partially helpful. Could explain supported hardware and detection strategy.

---

## src/services/immich/hardware/ml.ts

### Line 9
**Current comment:** `/** Machine learning hardware acceleration. */`
**Issue:** Partially helpful. Could explain ML inference optimization.

---

## src/services/immich/hardware/transcoding.ts

### Line 9
**Current comment:** `/** Video transcoding hardware acceleration. */`
**Issue:** Partially helpful. Could explain transcoding codecs and quality trade-offs.

---

## src/services/immich/libraries.ts

### Line 9
**Current comment:** `/** Immich library management. */`
**Issue:** Obvious. Could explain library vs upload distinction.

---

## src/services/types.ts

### Line 9
**Current comment:** `/** Service type definitions and interfaces. */`
**Issue:** Redundant.

---

## src/stack/dependencies.ts

### Line 9
**Current comment:** `/** Service dependency resolution. */`
**Issue:** Obvious. Could explain dependency ordering algorithm.

---

## src/stack/environment.ts

### Line 9
**Current comment:** `/** Environment variable resolution for service stacks. */`
**Issue:** Partially helpful. Could explain environment precedence.

---

## src/stack/generator.ts

### Line 9
**Current comment:** `/** Stack file generator. */`
**Issue:** Obvious.

---

## src/stack/orchestrator.ts

### Line 9
**Current comment:** `/** Service orchestration for multi-container stacks. */`
**Issue:** Partially helpful. Could explain orchestration strategy.

---

## src/stack/types.ts

### Line 9
**Current comment:** `/** Stack type definitions. */`
**Issue:** Redundant with filename.

---

## src/system/age.ts

### Line 9
**Current comment:** `/** Age encryption utilities. */`
**Issue:** Obvious. Could explain why age vs alternatives.

---

## src/system/archive.ts

### Line 9
**Current comment:** `/** Archive utilities for tar files. */`
**Issue:** Obvious.

---

## src/system/compress.ts

### Line 9
**Current comment:** `/** Compression utilities. */`
**Issue:** Obvious. Could explain compression algorithm choice.

---

## src/system/directories.ts

### Line 9
**Current comment:** `/** Directory management utilities. */`
**Issue:** Obvious.

---

## src/system/exec.ts

### Line 9
**Current comment:** `/** Command execution utilities using Bun shell. */`
**Issue:** Partially helpful. Could explain exec strategy or security considerations.

---

## src/system/fs.ts

### Line 9
**Current comment:** `/** Filesystem utilities with Effect error handling. */`
**Issue:** Partially helpful.

---

## src/system/linger.ts

### Lines 9-11
**Current comment:** `/** User linger management for systemd. */`
**Issue:** Partially helpful. Could explain why linger is needed (user services without login).

---

## src/system/lock.ts

### Lines 9-11
**Current comment:** `/** File-based locking using O_EXCL for atomic operations. */`
**Issue:** Good - explains the mechanism. Could add why file locks vs flock.

---

## src/system/secrets.ts

### Line 9
**Current comment:** `/** Secret management with podman and age encryption. */`
**Issue:** Partially helpful.

---

## src/system/selinux.ts

### Line 9
**Current comment:** `/** SELinux detection and configuration. */`
**Issue:** Obvious. Could explain SELinux impact on containers.

---

## src/system/sysctl.ts

### Line 9
**Current comment:** `/** Sysctl configuration utilities. */`
**Issue:** Obvious. Could explain which sysctls and why.

---

## src/system/systemctl.ts

### Line 9
**Current comment:** `/** Systemd systemctl wrapper using Effect for error handling. */`
**Issue:** Partially helpful.

---

## src/system/uid-allocator.ts

### Lines 9-11
**Current comment:** `/** Dynamic UID and subuid allocation using Effect for error handling. Cross-distribution compatible using POSIX-standard mechanisms. */`
**Issue:** Good - explains portability concern.

### Lines 34-42
**Current comment:** Explains UID range allocation strategy
**Status:** GOOD COMMENT - explains the why behind the numbers with specific ranges and rationale.

---

## src/system/user.ts

### Lines 9-11
**Current comment:** `/** User management. Creates isolated users with proper subuid/subgid configuration. */`
**Issue:** Partially helpful. Could explain isolation goals.

---

## src/index.ts

### Lines 9-11
**Current comment:** `/** Main entry point - imperative shell. Effect runtime is executed here. */`
**Status:** GOOD COMMENT - explains architectural pattern (functional core, imperative shell).

---

## tests/setup.ts

### Lines 8-11
**Current comment:** `/** Global test setup for Bun test runner. This file is preloaded before tests run (configured in bunfig.toml). */`
**Status:** GOOD COMMENT - explains configuration reference.

---

## Well-Commented Files (No Issues)

The following files have comments that appropriately explain "why" or have minimal comments (code is self-documenting):

- `src/lib/match-helpers.ts` - Minimal comments, code is self-explanatory
- `src/services/context/index.ts` - Minimal comments, clear Context patterns
- Most test files - Test names serve as documentation
- `src/system/uid-allocator.ts:34-42` - Excellent comment explaining UID range rationale

---

## Recommendations

### 1. Module-level JSDoc

Replace "what" descriptions with:
- Why this module exists (problem it solves)
- When to use this module vs alternatives
- Key design decisions or trade-offs

**Example improvement:**
```typescript
// Before:
/** String utilities. */

// After:
/**
 * Pure string operations without side effects.
 * Prefer these over String prototype methods when composing
 * with Effect pipelines to maintain referential transparency.
 */
```

### 2. Function-level comments

Most functions are well-named and don't need comments. Add comments only when:
- The implementation has non-obvious behavior
- There's a performance or security consideration
- Historical context explains a "weird" decision

### 3. Inline comments

Keep for:
- Magic numbers with rationale (see `uid-allocator.ts:34-42`)
- Workarounds for library/platform quirks
- Algorithm steps that aren't self-evident

### 4. Remove comments that:

- Restate function/variable names
- Describe syntax ("// for loop")
- Are outdated or misleading

---

## Statistics

| Category | Count |
|----------|-------|
| Files with "what" comments | ~75 |
| Files with good comments | ~5 |
| Files with minimal/no comments (appropriate) | ~64 |
| **Total reviewed** | **144** |
