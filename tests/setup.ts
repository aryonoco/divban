// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

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
  Bun.env.NODE_ENV = "test";

  // Disable colors in tests for consistent output
  Bun.env.NO_COLOR = "1";
});

/**
 * Global test teardown.
 */
afterAll(() => {
  // Cleanup if needed
});
