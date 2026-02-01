#!/usr/bin/env bun

// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Command, Options } from "@effect/cli";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Effect, Match, pipe } from "effect";
import { exec } from "../src/system/exec.ts";
import { ALL_DISTROS } from "./distros.ts";
import { writeJSONReport, writeMarkdownReport } from "./reporting.ts";
import { discoverServices } from "./service-discovery.ts";
import { runAllTests } from "./test-runner.ts";
import { E2EError } from "./types.ts";

// CLI command definition
const e2eCommand = Command.make(
  "e2e",
  {
    output: Options.directory("output").pipe(
      Options.withDescription("Output directory for reports"),
      Options.withDefault("./e2e-results")
    ),
  },
  ({ output }) =>
    Effect.gen(function* () {
      yield* Effect.logInfo("Starting divban E2E tests...");

      // Discover services
      const services = yield* discoverServices();

      const hasServices = services.length > 0;

      return yield* pipe(
        hasServices,
        Match.value,
        Match.when(false, () =>
          Effect.gen(function* () {
            yield* Effect.logError(
              "No services found. Ensure divban-*.toml files exist in current directory."
            );
            return yield* Effect.fail(new E2EError("No services discovered"));
          })
        ),
        Match.when(true, () =>
          Effect.gen(function* () {
            // Run tests
            const report = yield* runAllTests(services, ALL_DISTROS);

            // Write reports
            yield* exec(["mkdir", "-p", output]);
            yield* writeJSONReport(report, `${output}/report.json`);
            yield* writeMarkdownReport(report, `${output}/report.md`);

            // Print summary
            yield* Effect.logInfo("\n=== Test Summary ===");
            yield* Effect.logInfo(`Total: ${report.totalTests}`);
            yield* Effect.logInfo(`Passed: ${report.passed}`);
            yield* Effect.logInfo(`Failed: ${report.failed}`);

            const hasFailed = report.failed > 0;

            return yield* pipe(
              hasFailed,
              Match.value,
              Match.when(true, () => Effect.fail(new E2EError(`${report.failed} tests failed`))),
              Match.when(false, () => Effect.logInfo("All tests passed!")),
              Match.exhaustive
            );
          })
        ),
        Match.exhaustive
      );
    })
);

// Run CLI
const main = Command.run(e2eCommand, {
  name: "divban-e2e",
  version: "1.0.0",
});

const program = pipe(main(Bun.argv.slice(2)), Effect.provide(BunContext.layer));

BunRuntime.runMain(program);
