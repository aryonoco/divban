#!/usr/bin/env bun
// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Divban - Unified Rootless Podman Service Manager
 *
 * Main entry point for the CLI application.
 */

import { run } from "./cli/index";

/**
 * Main entry point - wrapped in async function for bytecode compatibility.
 * Bytecode compilation requires CommonJS format which doesn't support top-level await.
 */
async function main(): Promise<never> {
  const exitCode = await run(Bun.argv.slice(2));
  process.exit(exitCode);
}

// Only run if this is the main entry point
// Uses Bun.main for optimal entry point detection
if (import.meta.main) {
  main();
}
