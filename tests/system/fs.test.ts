// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import type { AbsolutePath } from "../../src/lib/types";
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
} from "../../src/system/fs";

const TEST_DIR = "/tmp/divban-test" as AbsolutePath;
const TEST_FILE = `${TEST_DIR}/test.txt` as AbsolutePath;

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
      const path = `${TEST_DIR}/unicode.txt` as AbsolutePath;

      await writeFile(path, content);
      const result = await readFile(path);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(content);
      }
    });

    test("readFile returns error for non-existent file", async () => {
      const result = await readFile("/tmp/divban-nonexistent.txt" as AbsolutePath);
      expect(result.ok).toBe(false);
    });
  });

  describe("fileExists", () => {
    test("returns true for existing file", async () => {
      await writeFile(TEST_FILE, "test");
      expect(await fileExists(TEST_FILE)).toBe(true);
    });

    test("returns false for non-existent file", async () => {
      expect(await fileExists("/tmp/divban-nonexistent.txt" as AbsolutePath)).toBe(false);
    });
  });

  describe("directoryExists", () => {
    test("returns true for existing directory", async () => {
      expect(await directoryExists(TEST_DIR)).toBe(true);
    });

    test("returns false for non-existent directory", async () => {
      expect(await directoryExists("/tmp/divban-nonexistent-dir" as AbsolutePath)).toBe(false);
    });

    test("returns false for file path", async () => {
      await writeFile(TEST_FILE, "test");
      expect(await directoryExists(TEST_FILE)).toBe(false);
    });
  });

  describe("ensureDirectory", () => {
    test("creates new directory", async () => {
      const newDir = `${TEST_DIR}/new-dir` as AbsolutePath;
      const result = await ensureDirectory(newDir);

      expect(result.ok).toBe(true);
      expect(await directoryExists(newDir)).toBe(true);
    });

    test("creates nested directories", async () => {
      const nestedDir = `${TEST_DIR}/a/b/c` as AbsolutePath;
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
      const listDir = `${TEST_DIR}/list-test` as AbsolutePath;
      await ensureDirectory(listDir);
      await writeFile(`${listDir}/file1.txt` as AbsolutePath, "1");
      await writeFile(`${listDir}/file2.txt` as AbsolutePath, "2");

      const result = await listDirectory(listDir);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain("file1.txt");
        expect(result.value).toContain("file2.txt");
      }
    });

    test("returns error for non-existent directory", async () => {
      const result = await listDirectory("/tmp/divban-nonexistent" as AbsolutePath);
      expect(result.ok).toBe(false);
    });
  });

  describe("globFiles", () => {
    test("finds files matching pattern", async () => {
      const globDir = `${TEST_DIR}/glob-test`;
      await ensureDirectory(globDir as AbsolutePath);
      await writeFile(`${globDir}/test1.ts` as AbsolutePath, "");
      await writeFile(`${globDir}/test2.ts` as AbsolutePath, "");
      await writeFile(`${globDir}/other.js` as AbsolutePath, "");

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
      const path = `${TEST_DIR}/atomic.txt` as AbsolutePath;
      const result = await atomicWrite(path, "atomic content");

      expect(result.ok).toBe(true);

      const readResult = await readFile(path);
      expect(readResult.ok).toBe(true);
      if (readResult.ok) {
        expect(readResult.value).toBe("atomic content");
      }
    });
  });
});
