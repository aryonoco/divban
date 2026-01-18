/**
 * Global test setup for Bun test runner.
 * This file is preloaded before tests run (configured in bunfig.toml).
 */

import { afterAll, beforeAll } from "bun:test";

/**
 * Global test setup.
 */
beforeAll(() => {
  // Ensure clean test environment
  process.env.NODE_ENV = "test";

  // Disable colors in tests for consistent output
  process.env.NO_COLOR = "1";
});

/**
 * Global test teardown.
 */
afterAll(() => {
  // Cleanup if needed
});
