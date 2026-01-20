// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { Effect, Exit, Option } from "effect";
import { path, pathJoin } from "../../src/lib/types.ts";
import {
  atomicWrite,
  directoryExists,
  ensureDirectory,
  fileExists,
  globFiles,
  globMatch,
  listDirectory,
  readFile,
  writeFile,
  writeFileExclusive,
} from "../../src/system/fs.ts";

const TEST_DIR = path("/tmp/divban-test");
const TEST_FILE = pathJoin(TEST_DIR, "test.txt");

describe("fs", () => {
  beforeAll(async () => {
    await Effect.runPromise(ensureDirectory(TEST_DIR));
  });

  afterAll(async () => {
    try {
      await rm(TEST_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("writeFile and readFile", () => {
    test("writes and reads text file correctly", async () => {
      await Effect.runPromise(writeFile(TEST_FILE, "Hello, Bun!"));

      const content = await Effect.runPromise(readFile(TEST_FILE));
      expect(content).toBe("Hello, Bun!");
    });

    test("handles unicode content", async () => {
      const content = "Hello 世界 🌍";
      const unicodePath = pathJoin(TEST_DIR, "unicode.txt");

      await Effect.runPromise(writeFile(unicodePath, content));
      const result = await Effect.runPromise(readFile(unicodePath));

      expect(result).toBe(content);
    });

    test("readFile returns error for non-existent file", async () => {
      const exit = await Effect.runPromiseExit(readFile(path("/tmp/divban-nonexistent.txt")));
      expect(Exit.isFailure(exit)).toBe(true);
    });
  });

  describe("fileExists", () => {
    test("returns true for existing file", async () => {
      await Effect.runPromise(writeFile(TEST_FILE, "test"));
      const exists = await Effect.runPromise(fileExists(TEST_FILE));
      expect(exists).toBe(true);
    });

    test("returns false for non-existent file", async () => {
      const exists = await Effect.runPromise(fileExists(path("/tmp/divban-nonexistent.txt")));
      expect(exists).toBe(false);
    });
  });

  describe("directoryExists", () => {
    test("returns true for existing directory", async () => {
      const exists = await Effect.runPromise(directoryExists(TEST_DIR));
      expect(exists).toBe(true);
    });

    test("returns false for non-existent directory", async () => {
      const exists = await Effect.runPromise(directoryExists(path("/tmp/divban-nonexistent-dir")));
      expect(exists).toBe(false);
    });

    test("returns false for file path", async () => {
      await Effect.runPromise(writeFile(TEST_FILE, "test"));
      const exists = await Effect.runPromise(directoryExists(TEST_FILE));
      expect(exists).toBe(false);
    });
  });

  describe("ensureDirectory", () => {
    test("creates new directory", async () => {
      const newDir = pathJoin(TEST_DIR, "new-dir");
      await Effect.runPromise(ensureDirectory(newDir));

      const exists = await Effect.runPromise(directoryExists(newDir));
      expect(exists).toBe(true);
    });

    test("creates nested directories", async () => {
      const nestedDir = pathJoin(TEST_DIR, "a", "b", "c");
      await Effect.runPromise(ensureDirectory(nestedDir));

      const exists = await Effect.runPromise(directoryExists(nestedDir));
      expect(exists).toBe(true);
    });

    test("succeeds if directory already exists", async () => {
      // Should not throw
      await Effect.runPromise(ensureDirectory(TEST_DIR));
    });
  });

  describe("listDirectory", () => {
    test("lists files in directory", async () => {
      const listDir = pathJoin(TEST_DIR, "list-test");
      await Effect.runPromise(ensureDirectory(listDir));
      await Effect.runPromise(writeFile(pathJoin(listDir, "file1.txt"), "1"));
      await Effect.runPromise(writeFile(pathJoin(listDir, "file2.txt"), "2"));

      const files = await Effect.runPromise(listDirectory(listDir));
      expect(files).toContain("file1.txt");
      expect(files).toContain("file2.txt");
    });

    test("returns error for non-existent directory", async () => {
      const exit = await Effect.runPromiseExit(listDirectory(path("/tmp/divban-nonexistent")));
      expect(Exit.isFailure(exit)).toBe(true);
    });
  });

  describe("globFiles", () => {
    test("finds files matching pattern", async () => {
      const globDir = pathJoin(TEST_DIR, "glob-test");
      await Effect.runPromise(ensureDirectory(globDir));
      await Effect.runPromise(writeFile(pathJoin(globDir, "test1.ts"), ""));
      await Effect.runPromise(writeFile(pathJoin(globDir, "test2.ts"), ""));
      await Effect.runPromise(writeFile(pathJoin(globDir, "other.js"), ""));

      const files = await Effect.runPromise(globFiles("*.ts", { cwd: globDir }));
      expect(files).toContain("test1.ts");
      expect(files).toContain("test2.ts");
      expect(files).not.toContain("other.js");
    });

    test("returns empty array when no matches", async () => {
      const files = await Effect.runPromise(globFiles("*.xyz", { cwd: TEST_DIR }));
      expect(files).toEqual([]);
    });
  });

  describe("globMatch", () => {
    test("matches glob pattern", () => {
      expect(globMatch("*.ts", "file.ts")).toBe(true);
      expect(globMatch("*.ts", "file.js")).toBe(false);
      expect(globMatch("src/**/*.ts", "src/lib/result.ts")).toBe(true);
    });
  });

  describe("atomicWrite", () => {
    test("writes file atomically", async () => {
      const atomicPath = pathJoin(TEST_DIR, "atomic.txt");
      await Effect.runPromise(atomicWrite(atomicPath, "atomic content"));

      const content = await Effect.runPromise(readFile(atomicPath));
      expect(content).toBe("atomic content");
    });
  });

  describe("writeFileExclusive", () => {
    test("creates new file and returns Some", async () => {
      const exclusivePath = pathJoin(TEST_DIR, "exclusive-new.txt");
      const result = await Effect.runPromise(
        writeFileExclusive(exclusivePath, "exclusive content")
      );

      expect(Option.isSome(result)).toBe(true);

      const content = await Effect.runPromise(readFile(exclusivePath));
      expect(content).toBe("exclusive content");
    });

    test("returns None if file already exists", async () => {
      const existingPath = pathJoin(TEST_DIR, "exclusive-existing.txt");
      await Effect.runPromise(writeFile(existingPath, "original content"));

      const result = await Effect.runPromise(writeFileExclusive(existingPath, "new content"));

      expect(Option.isNone(result)).toBe(true);

      // Verify original content unchanged
      const content = await Effect.runPromise(readFile(existingPath));
      expect(content).toBe("original content");
    });

    test("returns Err for other errors (e.g., invalid path)", async () => {
      const invalidPath = path("/nonexistent-dir/file.txt");
      const exit = await Effect.runPromiseExit(writeFileExclusive(invalidPath, "content"));
      expect(Exit.isFailure(exit)).toBe(true);
    });
  });
});
