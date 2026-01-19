// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, test } from "bun:test";
import { getServiceUsername } from "../../src/config/schema.ts";

describe("user management", () => {
  describe("getServiceUsername", () => {
    test("generates valid username from service name", () => {
      const result = getServiceUsername("caddy");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe("divban-caddy");
      }
    });

    test("rejects invalid service names", () => {
      const result = getServiceUsername("Invalid-Name!");
      expect(result.ok).toBe(false);
    });

    test("rejects names that would exceed 32 chars", () => {
      const result = getServiceUsername("a".repeat(30));
      expect(result.ok).toBe(false);
    });
  });

  // Note: Full createServiceUser/deleteServiceUser tests require root
  // and are better suited for integration tests
});
