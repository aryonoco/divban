// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { Effect, Exit } from "effect";
import { path, pathJoin } from "../../src/lib/types.ts";
import { ensureDirectory, writeFile } from "../../src/system/fs.ts";
import { withLock } from "../../src/system/lock.ts";
import { runTest, runTestExit } from "../helpers/layers.ts";

const LOCK_DIR = path("/var/lock/divban");
const TEST_RESOURCE = "test-resource";

// Check if we can create the lock directory and write to it (requires root or specific permissions)
let canCreateLockDir = false;

describe("withLock", () => {
  beforeAll(async () => {
    // Chain: ensure directory exists → write test file
    // Only proceeds to write if directory creation succeeded
    const testFile = pathJoin(LOCK_DIR, ".write-test");
    const program = Effect.gen(function* () {
      yield* ensureDirectory(LOCK_DIR);
      yield* writeFile(testFile, "test");
    });

    const exit = await runTestExit(program);
    canCreateLockDir = Exit.isSuccess(exit);

    // Cleanup test file if created (best effort)
    if (canCreateLockDir) {
      try {
        await rm(testFile, { force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  afterAll(async () => {
    if (!canCreateLockDir) {
      return;
    }
    try {
      await rm(pathJoin(LOCK_DIR, `${TEST_RESOURCE}.lock`), { force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  test("executes operation and returns result", async () => {
    if (!canCreateLockDir) {
      // Skipping: requires root privileges to create lock directory
      return;
    }
    const result = await runTest(withLock(TEST_RESOURCE, Effect.succeed("success")));

    expect(result).toBe("success");
  });

  test("releases lock after operation completes", async () => {
    if (!canCreateLockDir) {
      // Skipping: requires root privileges to create lock directory
      return;
    }
    await runTest(withLock(TEST_RESOURCE, Effect.succeed(undefined)));

    // Should be able to acquire lock again immediately
    const result = await runTest(
      withLock(TEST_RESOURCE, Effect.succeed("second"), {
        maxWaitMs: 100,
      })
    );

    expect(result).toBe("second");
  });

  test("releases lock even if operation throws", async () => {
    if (!canCreateLockDir) {
      // Skipping: requires root privileges to create lock directory
      return;
    }
    // First operation fails
    const exit = await runTestExit(
      withLock(TEST_RESOURCE, Effect.fail(new Error("Operation failed")))
    );
    expect(Exit.isFailure(exit)).toBe(true);

    // Should be able to acquire lock again
    const secondResult = await runTest(
      withLock(TEST_RESOURCE, Effect.succeed("recovered"), {
        maxWaitMs: 100,
      })
    );

    expect(secondResult).toBe("recovered");
  });

  test("handles stale lock from dead process", async () => {
    if (!canCreateLockDir) {
      // Skipping: requires root privileges to create lock directory
      return;
    }
    // Create a lock file with non-existent PID
    const lockPath = pathJoin(LOCK_DIR, `${TEST_RESOURCE}.lock`);
    await runTest(writeFile(lockPath, "99999999\n0\n")); // Very old timestamp, fake PID

    // Should detect stale lock and acquire
    const result = await runTest(
      withLock(TEST_RESOURCE, Effect.succeed("acquired"), { maxWaitMs: 500 })
    );

    expect(result).toBe("acquired");
  });

  test("times out when lock is held by active process", async () => {
    if (!canCreateLockDir) {
      // Skipping: requires root privileges to create lock directory
      return;
    }
    // This test simulates a held lock by creating a file with current process
    const lockPath = pathJoin(LOCK_DIR, "timeout-test.lock");
    await runTest(writeFile(lockPath, `${process.pid}\n${Date.now()}\n`));

    const exit = await runTestExit(
      withLock("timeout-test", Effect.succeed("should not run"), {
        maxWaitMs: 200,
        retryIntervalMs: 50,
      })
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const error = exit.cause;
      // Check that error message contains "Timeout"
      expect(String(error)).toContain("Timeout");
    }

    // Cleanup
    await rm(lockPath, { force: true });
  });

  test("multiple sequential operations work correctly", async () => {
    if (!canCreateLockDir) {
      // Skipping: requires root privileges to create lock directory
      return;
    }
    const results: string[] = [];

    await runTest(
      withLock(
        TEST_RESOURCE,
        Effect.sync(() => {
          results.push("first");
        })
      )
    );

    await runTest(
      withLock(
        TEST_RESOURCE,
        Effect.sync(() => {
          results.push("second");
        })
      )
    );

    await runTest(
      withLock(
        TEST_RESOURCE,
        Effect.sync(() => {
          results.push("third");
        })
      )
    );

    expect(results).toEqual(["first", "second", "third"]);
  });
});
