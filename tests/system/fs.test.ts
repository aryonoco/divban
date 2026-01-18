// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
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
} from "../../src/system/fs.ts";

const TEST_DIR = path("/tmp/divban-test");
const TEST_FILE = pathJoin(TEST_DIR, "test.txt");

describe("fs", () => {
  beforeAll(async () => {
    await ensureDirectory(TEST_DIR);
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
      const writeResult = await writeFile(TEST_FILE, "Hello, Bun!");
      expect(writeResult.ok).toBe(true);

      const readResult = await readFile(TEST_FILE);
      expect(readResult.ok).toBe(true);
      if (readResult.ok) {
        expect(readResult.value).toBe("Hello, Bun!");
      }
    });

    test("handles unicode content", async () => {
      const content = "Hello 世界 🌍";
      const unicodePath = pathJoin(TEST_DIR, "unicode.txt");

      await writeFile(unicodePath, content);
      const result = await readFile(unicodePath);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(content);
      }
    });

    test("readFile returns error for non-existent file", async () => {
      const result = await readFile(path("/tmp/divban-nonexistent.txt"));
      expect(result.ok).toBe(false);
    });
  });

  describe("fileExists", () => {
    test("returns true for existing file", async () => {
      await writeFile(TEST_FILE, "test");
      expect(await fileExists(TEST_FILE)).toBe(true);
    });

    test("returns false for non-existent file", async () => {
      expect(await fileExists(path("/tmp/divban-nonexistent.txt"))).toBe(false);
    });
  });

  describe("directoryExists", () => {
    test("returns true for existing directory", async () => {
      expect(await directoryExists(TEST_DIR)).toBe(true);
    });

    test("returns false for non-existent directory", async () => {
      expect(await directoryExists(path("/tmp/divban-nonexistent-dir"))).toBe(false);
    });

    test("returns false for file path", async () => {
      await writeFile(TEST_FILE, "test");
      expect(await directoryExists(TEST_FILE)).toBe(false);
    });
  });

  describe("ensureDirectory", () => {
    test("creates new directory", async () => {
      const newDir = pathJoin(TEST_DIR, "new-dir");
      const result = await ensureDirectory(newDir);

      expect(result.ok).toBe(true);
      expect(await directoryExists(newDir)).toBe(true);
    });

    test("creates nested directories", async () => {
      const nestedDir = pathJoin(TEST_DIR, "a", "b", "c");
      const result = await ensureDirectory(nestedDir);

      expect(result.ok).toBe(true);
      expect(await directoryExists(nestedDir)).toBe(true);
    });

    test("succeeds if directory already exists", async () => {
      const result = await ensureDirectory(TEST_DIR);
      expect(result.ok).toBe(true);
    });
  });

  describe("listDirectory", () => {
    test("lists files in directory", async () => {
      const listDir = pathJoin(TEST_DIR, "list-test");
      await ensureDirectory(listDir);
      await writeFile(pathJoin(listDir, "file1.txt"), "1");
      await writeFile(pathJoin(listDir, "file2.txt"), "2");

      const result = await listDirectory(listDir);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain("file1.txt");
        expect(result.value).toContain("file2.txt");
      }
    });

    test("returns error for non-existent directory", async () => {
      const result = await listDirectory(path("/tmp/divban-nonexistent"));
      expect(result.ok).toBe(false);
    });
  });

  describe("globFiles", () => {
    test("finds files matching pattern", async () => {
      const globDir = pathJoin(TEST_DIR, "glob-test");
      await ensureDirectory(globDir);
      await writeFile(pathJoin(globDir, "test1.ts"), "");
      await writeFile(pathJoin(globDir, "test2.ts"), "");
      await writeFile(pathJoin(globDir, "other.js"), "");

      const files = await globFiles("*.ts", { cwd: globDir });
      expect(files).toContain("test1.ts");
      expect(files).toContain("test2.ts");
      expect(files).not.toContain("other.js");
    });

    test("returns empty array when no matches", async () => {
      const files = await globFiles("*.xyz", { cwd: TEST_DIR });
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
      const result = await atomicWrite(atomicPath, "atomic content");

      expect(result.ok).toBe(true);

      const readResult = await readFile(atomicPath);
      expect(readResult.ok).toBe(true);
      if (readResult.ok) {
        expect(readResult.value).toBe("atomic content");
      }
    });
  });
});
