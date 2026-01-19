// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { Ok, asyncFlatMapResult } from "../../src/lib/result.ts";
import { path, pathJoin } from "../../src/lib/types.ts";
import { ensureDirectory, writeFile } from "../../src/system/fs.ts";
import { withLock } from "../../src/system/lock.ts";

const LOCK_DIR = path("/var/lock/divban");
const TEST_RESOURCE = "test-resource";

// Check if we can create the lock directory and write to it (requires root or specific permissions)
let canCreateLockDir = false;

describe("withLock", () => {
  beforeAll(async () => {
    // Chain: ensure directory exists → write test file
    // Only proceeds to write if directory creation succeeded
    const testFile = pathJoin(LOCK_DIR, ".write-test");
    const result = await asyncFlatMapResult(await ensureDirectory(LOCK_DIR), () =>
      writeFile(testFile, "test")
    );

    canCreateLockDir = result.ok;

    // Cleanup test file if created (best effort)
    if (result.ok) {
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
    const result = await withLock(TEST_RESOURCE, () => Promise.resolve(Ok("success")));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("success");
    }
  });

  test("releases lock after operation completes", async () => {
    if (!canCreateLockDir) {
      // Skipping: requires root privileges to create lock directory
      return;
    }
    await withLock(TEST_RESOURCE, () => Promise.resolve(Ok(undefined)));

    // Should be able to acquire lock again immediately
    const result = await withLock(TEST_RESOURCE, () => Promise.resolve(Ok("second")), {
      maxWaitMs: 100,
    });

    expect(result.ok).toBe(true);
  });

  test("releases lock even if operation throws", async () => {
    if (!canCreateLockDir) {
      // Skipping: requires root privileges to create lock directory
      return;
    }
    // First operation throws
    try {
      await withLock(TEST_RESOURCE, () => Promise.reject(new Error("Operation failed")));
    } catch {
      // Expected
    }

    // Should be able to acquire lock again
    const secondResult = await withLock(TEST_RESOURCE, () => Promise.resolve(Ok("recovered")), {
      maxWaitMs: 100,
    });

    expect(secondResult.ok).toBe(true);
  });

  test("handles stale lock from dead process", async () => {
    if (!canCreateLockDir) {
      // Skipping: requires root privileges to create lock directory
      return;
    }
    // Create a lock file with non-existent PID
    const lockPath = pathJoin(LOCK_DIR, `${TEST_RESOURCE}.lock`);
    await writeFile(lockPath, "99999999\n0\n"); // Very old timestamp, fake PID

    // Should detect stale lock and acquire
    const result = await withLock(TEST_RESOURCE, async () => Ok("acquired"), { maxWaitMs: 500 });

    expect(result.ok).toBe(true);
  });

  test("times out when lock is held by active process", async () => {
    if (!canCreateLockDir) {
      // Skipping: requires root privileges to create lock directory
      return;
    }
    // This test simulates a held lock by creating a file with current process
    const lockPath = pathJoin(LOCK_DIR, "timeout-test.lock");
    await writeFile(lockPath, `${process.pid}\n${Date.now()}\n`);

    const result = await withLock("timeout-test", async () => Ok("should not run"), {
      maxWaitMs: 200,
      retryIntervalMs: 50,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("Timeout");
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

    await withLock(TEST_RESOURCE, () => {
      results.push("first");
      return Promise.resolve(Ok(undefined));
    });

    await withLock(TEST_RESOURCE, () => {
      results.push("second");
      return Promise.resolve(Ok(undefined));
    });

    await withLock(TEST_RESOURCE, () => {
      results.push("third");
      return Promise.resolve(Ok(undefined));
    });

    expect(results).toEqual(["first", "second", "third"]);
  });
});
