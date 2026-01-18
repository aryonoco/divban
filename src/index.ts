#!/usr/bin/env bun
/**
 * Divban - Unified Rootless Podman Service Manager
 *
 * Main entry point for the CLI application.
 */

import { run } from "./cli";

// Run the CLI
const exitCode = await run(process.argv.slice(2));
process.exit(exitCode);
