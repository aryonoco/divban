// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { Exit } from "effect";
import { loadGlobalConfig } from "../../src/config/loader.ts";
import { path, pathJoin } from "../../src/lib/types.ts";
import { ensureDirectory, writeFile } from "../../src/system/fs.ts";
import { runTest, runTestExit } from "../helpers/layers.ts";

const TEST_DIR = path("/tmp/divban-config-test");

describe("global config", () => {
  beforeAll(async () => {
    await runTest(ensureDirectory(TEST_DIR));
  });

  afterAll(async () => {
    try {
      await rm(TEST_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("loadGlobalConfig", () => {
    test("returns error for non-existent explicit config path", async () => {
      const exit = await runTestExit(loadGlobalConfig(path("/nonexistent/divban.toml")));

      expect(Exit.isFailure(exit)).toBe(true);
    });

    test("loads and parses valid TOML config", async () => {
      const configPath = pathJoin(TEST_DIR, "divban.toml");
      await runTest(
        writeFile(
          configPath,
          `divbanConfigSchemaVersion = "1.0.0"

[users]
uidRangeStart = 15000
uidRangeEnd = 20000

[logging]
level = "debug"
`
        )
      );

      const config = await runTest(loadGlobalConfig(configPath));

      expect(config.users.uidRangeStart).toBe(15000);
      expect(config.users.uidRangeEnd).toBe(20000);
      expect(config.logging.level).toBe("debug");
      // Defaults for unspecified fields
      expect(config.users.subuidRangeStart).toBe(100000);
    });

    test("returns error for malformed TOML", async () => {
      const configPath = pathJoin(TEST_DIR, "bad.toml");
      await runTest(writeFile(configPath, "this is not valid toml [[["));

      const exit = await runTestExit(loadGlobalConfig(configPath));

      expect(Exit.isFailure(exit)).toBe(true);
    });

    test("applies partial config with defaults for missing fields", async () => {
      const configPath = pathJoin(TEST_DIR, "partial.toml");
      await runTest(
        writeFile(
          configPath,
          `divbanConfigSchemaVersion = "1.0.0"

[logging]
format = "json"
`
        )
      );

      const config = await runTest(loadGlobalConfig(configPath));

      // Explicitly set
      expect(config.logging.format).toBe("json");
      // Defaults
      expect(config.logging.level).toBe("info");
      expect(config.users.uidRangeStart).toBe(10000);
      expect(config.defaults.networkMode).toBe("pasta");
    });
  });

  describe("users config", () => {
    test("extracts settings from global config", async () => {
      const configPath = pathJoin(TEST_DIR, "user-defaults.toml");
      await runTest(writeFile(configPath, `divbanConfigSchemaVersion = "1.0.0"\n`));

      const config = await runTest(loadGlobalConfig(configPath));

      expect(config.users.uidRangeStart).toBe(10000);
      expect(config.users.uidRangeEnd).toBe(59999);
      expect(config.users.subuidRangeStart).toBe(100000);
      expect(config.users.subuidRangeSize).toBe(65536);
    });

    test("uses custom values when provided", async () => {
      const configPath = pathJoin(TEST_DIR, "custom-users.toml");
      await runTest(
        writeFile(
          configPath,
          `divbanConfigSchemaVersion = "1.0.0"

[users]
uidRangeStart = 20000
uidRangeEnd = 30000
subuidRangeStart = 200000
subuidRangeSize = 131072
`
        )
      );

      const config = await runTest(loadGlobalConfig(configPath));

      expect(config.users.uidRangeStart).toBe(20000);
      expect(config.users.uidRangeEnd).toBe(30000);
      expect(config.users.subuidRangeStart).toBe(200000);
      expect(config.users.subuidRangeSize).toBe(131072);
    });
  });

  describe("logging config", () => {
    test("extracts logging settings with defaults", async () => {
      const configPath = pathJoin(TEST_DIR, "logging-defaults.toml");
      await runTest(writeFile(configPath, `divbanConfigSchemaVersion = "1.0.0"\n`));

      const config = await runTest(loadGlobalConfig(configPath));

      expect(config.logging.level).toBe("info");
      expect(config.logging.format).toBe("pretty");
    });

    test("uses custom values when provided", async () => {
      const configPath = pathJoin(TEST_DIR, "custom-logging.toml");
      await runTest(
        writeFile(
          configPath,
          `divbanConfigSchemaVersion = "1.0.0"

[logging]
level = "warn"
format = "json"
`
        )
      );

      const config = await runTest(loadGlobalConfig(configPath));

      expect(config.logging.level).toBe("warn");
      expect(config.logging.format).toBe("json");
    });
  });
});
