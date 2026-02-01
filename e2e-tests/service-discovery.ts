// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Array as Arr, Effect, pipe } from "effect";
import { exec } from "../src/system/exec.ts";
import type { E2EError, ServiceCapabilities, ServiceName } from "./types.ts";
import { serviceName } from "./types.ts";

// Known service capabilities (from codebase exploration)
const SERVICE_CAPABILITIES: Record<string, ServiceCapabilities> = {
  caddy: {
    hasReload: true,
    hasBackup: false,
    hasRestore: false,
    multiContainer: false,
  },
  immich: {
    hasReload: false,
    hasBackup: true,
    hasRestore: true,
    multiContainer: true,
  },
  actual: {
    hasReload: false,
    hasBackup: true,
    hasRestore: true,
    multiContainer: false,
  },
  freshrss: {
    hasReload: false,
    hasBackup: true,
    hasRestore: true,
    multiContainer: false,
  },
} as const;

// Service name extraction pattern
const SERVICE_NAME_PATTERN = /divban-([a-z]+)\.toml$/;

// Discover services from TOML files
export const discoverServices = (): Effect.Effect<readonly ServiceName[], E2EError> =>
  Effect.gen(function* () {
    // Find all divban-*.toml files in current directory
    const result = yield* exec(["find", ".", "-maxdepth", "1", "-name", "divban-*.toml"]);

    const files = pipe(
      result.stdout.split("\n"),
      Arr.filter((line) => line.trim().length > 0)
    );

    // Extract service names from filenames
    const services = pipe(
      files,
      Arr.filterMap((file) => {
        // Extract service name from "./divban-<service>.toml"
        const match = SERVICE_NAME_PATTERN.exec(file);
        return match?.[1] ? serviceName(match[1]) : null;
      })
    );

    yield* Effect.logInfo(`Discovered ${services.length} services: ${services.join(", ")}`);

    return services;
  });

// Get service capabilities
export const getServiceCapabilities = (service: ServiceName): ServiceCapabilities =>
  SERVICE_CAPABILITIES[service] ?? {
    hasReload: false,
    hasBackup: false,
    hasRestore: false,
    multiContainer: false,
  };
