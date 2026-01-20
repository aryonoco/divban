// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { Effect, Exit } from "effect";
import { loadGlobalConfig } from "../../src/config/loader.ts";
import { getLoggingSettings, getUserAllocationSettings } from "../../src/config/merge.ts";
import { path, pathJoin } from "../../src/lib/types.ts";
import { ensureDirectory, writeFile } from "../../src/system/fs.ts";

const TEST_DIR = path("/tmp/divban-config-test");

describe("global config", () => {
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

  describe("loadGlobalConfig", () => {
    test("returns defaults when no config file exists", async () => {
      const config = await Effect.runPromise(loadGlobalConfig(path("/nonexistent/divban.toml")));

      expect(config.users.uidRangeStart).toBe(10000);
      expect(config.users.uidRangeEnd).toBe(59999);
      expect(config.logging.level).toBe("info");
    });

    test("loads and parses valid TOML config", async () => {
      const configPath = pathJoin(TEST_DIR, "divban.toml");
      await Effect.runPromise(
        writeFile(
          configPath,
          `
[users]
uidRangeStart = 15000
uidRangeEnd = 20000

[logging]
level = "debug"
`
        )
      );

      const config = await Effect.runPromise(loadGlobalConfig(configPath));

      expect(config.users.uidRangeStart).toBe(15000);
      expect(config.users.uidRangeEnd).toBe(20000);
      expect(config.logging.level).toBe("debug");
      // Defaults for unspecified fields
      expect(config.users.subuidRangeStart).toBe(100000);
    });

    test("returns error for malformed TOML", async () => {
      const configPath = pathJoin(TEST_DIR, "bad.toml");
      await Effect.runPromise(writeFile(configPath, "this is not valid toml [[["));

      const exit = await Effect.runPromiseExit(loadGlobalConfig(configPath));

      expect(Exit.isFailure(exit)).toBe(true);
    });

    test("applies partial config with defaults for missing fields", async () => {
      const configPath = pathJoin(TEST_DIR, "partial.toml");
      await Effect.runPromise(
        writeFile(
          configPath,
          `
[logging]
format = "json"
`
        )
      );

      const config = await Effect.runPromise(loadGlobalConfig(configPath));

      // Explicitly set
      expect(config.logging.format).toBe("json");
      // Defaults
      expect(config.logging.level).toBe("info");
      expect(config.users.uidRangeStart).toBe(10000);
      expect(config.defaults.networkMode).toBe("pasta");
    });
  });

  describe("getUserAllocationSettings", () => {
    test("extracts settings from global config", async () => {
      const config = await Effect.runPromise(loadGlobalConfig());

      const settings = getUserAllocationSettings(config);
      expect(settings.uidRangeStart).toBe(10000);
      expect(settings.uidRangeEnd).toBe(59999);
      expect(settings.subuidRangeStart).toBe(100000);
      expect(settings.subuidRangeSize).toBe(65536);
    });

    test("uses custom values when provided", async () => {
      const configPath = pathJoin(TEST_DIR, "custom-users.toml");
      await Effect.runPromise(
        writeFile(
          configPath,
          `
[users]
uidRangeStart = 20000
uidRangeEnd = 30000
subuidRangeStart = 200000
subuidRangeSize = 131072
`
        )
      );

      const config = await Effect.runPromise(loadGlobalConfig(configPath));

      const settings = getUserAllocationSettings(config);
      expect(settings.uidRangeStart).toBe(20000);
      expect(settings.uidRangeEnd).toBe(30000);
      expect(settings.subuidRangeStart).toBe(200000);
      expect(settings.subuidRangeSize).toBe(131072);
    });
  });

  describe("getLoggingSettings", () => {
    test("extracts logging settings with defaults", async () => {
      const config = await Effect.runPromise(loadGlobalConfig());

      const settings = getLoggingSettings(config);
      expect(settings.level).toBe("info");
      expect(settings.format).toBe("pretty");
    });

    test("uses custom values when provided", async () => {
      const configPath = pathJoin(TEST_DIR, "custom-logging.toml");
      await Effect.runPromise(
        writeFile(
          configPath,
          `
[logging]
level = "warn"
format = "json"
`
        )
      );

      const config = await Effect.runPromise(loadGlobalConfig(configPath));

      const settings = getLoggingSettings(config);
      expect(settings.level).toBe("warn");
      expect(settings.format).toBe("json");
    });
  });
});
