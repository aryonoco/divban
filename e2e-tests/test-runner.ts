// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Array as Arr, Effect, pipe } from "effect";
import { generateCommands } from "./commands.ts";
import { downloadDivbanBinary } from "./github.ts";
import type {
  DistroConfig,
  E2EError,
  E2ETestReport,
  ServiceName,
  TestCase,
  TestResult,
  VMConfig,
  VMInfo,
} from "./types.ts";
import { testID, vmName } from "./types.ts";
import { createVM, destroyVM, scpCopy, sshExec } from "./vm-manager.ts";

// Create test cases for all services and distros
const createTestCases = (
  services: readonly ServiceName[],
  distros: readonly DistroConfig[]
): readonly TestCase[] =>
  pipe(
    distros,
    Arr.flatMap((distro) =>
      pipe(
        services,
        Arr.flatMap((service) =>
          pipe(
            generateCommands(service),
            Arr.map(({ command, args }) => ({
              id: testID(`${distro.name}-${service}-${command}`),
              service,
              distro: distro.name,
              command,
              args,
            }))
          )
        )
      )
    )
  );

// Run a single test case
const runTestCase = (testCase: TestCase, vmInfo: VMInfo): Effect.Effect<TestResult, E2EError> =>
  Effect.gen(function* () {
    const startTime = Date.now();

    yield* Effect.logInfo(`Running: divban ${testCase.command} ${testCase.args.join(" ")}`);

    const result = yield* sshExec(vmInfo, ["divban", testCase.command, ...testCase.args]);

    const duration = Date.now() - startTime;
    const success = result.exitCode === 0;

    return {
      testCase,
      success,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      duration,
      error: success ? undefined : result.stderr,
    };
  });

// Run all tests for a single distro
const runTestsForDistro = (
  distro: DistroConfig,
  services: readonly ServiceName[],
  divbanBinaryPath: string
): Effect.Effect<readonly TestResult[], E2EError> =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`\n=== Testing ${distro.name} ===\n`);

    // Create VM
    const vmConfig: VMConfig = {
      name: vmName(`divban-e2e-${distro.name}`),
      distro,
      memory: 2048,
      cpus: 2,
      disk: 10,
    };

    const vm = yield* createVM(vmConfig);

    try {
      // Copy divban binary to VM (downloaded from GitHub)
      yield* scpCopy(vm, divbanBinaryPath, "/usr/local/bin/divban");
      yield* sshExec(vm, ["chmod", "+x", "/usr/local/bin/divban"]);

      // Copy TOML files to VM
      yield* pipe(
        services,
        Arr.map((service) =>
          scpCopy(vm, `./divban-${service}.toml`, `/root/divban-${service}.toml`)
        ),
        Effect.all
      );

      // Generate test cases for this distro
      const testCases = createTestCases(services, [distro]);

      // Run tests sequentially
      const results = yield* pipe(
        testCases,
        Arr.map((tc) => runTestCase(tc, vm)),
        Effect.all
      );

      return results;
    } finally {
      // Clean up VM
      yield* destroyVM(vmConfig.name);
    }
  });

// Run all tests
export const runAllTests = (
  services: readonly ServiceName[],
  distros: readonly DistroConfig[]
): Effect.Effect<E2ETestReport, E2EError> =>
  Effect.gen(function* () {
    const startTime = new Date().toISOString();

    // Download latest divban binary from GitHub
    const divbanBinaryPath = yield* downloadDivbanBinary();

    // Run tests for each distro (can be parallelized)
    const allResults = yield* pipe(
      distros,
      Arr.map((distro) => runTestsForDistro(distro, services, divbanBinaryPath)),
      Effect.all, // Run sequentially by default, can use Effect.allWith({ concurrency: "unbounded" }) for parallel
      Effect.map(Arr.flatten)
    );

    const endTime = new Date().toISOString();

    const passed = pipe(
      allResults,
      Arr.filter((r) => r.success)
    ).length;
    const failed = allResults.length - passed;

    return {
      startTime,
      endTime,
      totalTests: allResults.length,
      passed,
      failed,
      results: allResults,
    };
  });
