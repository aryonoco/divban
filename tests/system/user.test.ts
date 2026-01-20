// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, test } from "bun:test";
import { Effect, Exit } from "effect";
import { getServiceUsername } from "../../src/config/schema.ts";

describe("user management", () => {
  describe("getServiceUsername", () => {
    test("generates valid username from service name", async () => {
      const username = await Effect.runPromise(getServiceUsername("caddy"));
      expect(username).toBe("divban-caddy");
    });

    test("rejects invalid service names", async () => {
      const exit = await Effect.runPromiseExit(getServiceUsername("Invalid-Name!"));
      expect(Exit.isFailure(exit)).toBe(true);
    });

    test("rejects names that would exceed 32 chars", async () => {
      const exit = await Effect.runPromiseExit(getServiceUsername("a".repeat(30)));
      expect(Exit.isFailure(exit)).toBe(true);
    });
  });

  // Note: Full createServiceUser/deleteServiceUser tests require root
  // and are better suited for integration tests
});
