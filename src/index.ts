#!/usr/bin/env bun
/**
 * Divban - Unified Rootless Podman Service Manager
 *
 * Main entry point for the CLI application.
 */

import { run } from "./cli";

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
