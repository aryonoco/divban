// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, test } from "bun:test";
import {
  createAutoNs,
  createHostNs,
  createKeepIdNs,
  createRootMappedNs,
  hasUidGidMapping,
} from "../../src/quadlet/container/user";

describe("user namespace", () => {
  describe("createKeepIdNs", () => {
    test("creates basic keep-id config", () => {
      const ns = createKeepIdNs();
      expect(ns.mode).toBe("keep-id");
      expect(ns.uid).toBeUndefined();
      expect(ns.gid).toBeUndefined();
    });

    test("creates keep-id with uid and gid", () => {
      const ns = createKeepIdNs(1000, 1000);
      expect(ns.mode).toBe("keep-id");
      expect(ns.uid).toBe(1000);
      expect(ns.gid).toBe(1000);
    });
  });

  describe("createRootMappedNs", () => {
    test("creates keep-id with uid=0, gid=0", () => {
      const ns = createRootMappedNs();
      expect(ns.mode).toBe("keep-id");
      expect(ns.uid).toBe(0);
      expect(ns.gid).toBe(0);
    });
  });

  describe("hasUidGidMapping", () => {
    test("returns false for undefined", () => {
      expect(hasUidGidMapping(undefined)).toBe(false);
    });

    test("returns false for basic keep-id", () => {
      expect(hasUidGidMapping(createKeepIdNs())).toBe(false);
    });

    test("returns true for keep-id with uid", () => {
      expect(hasUidGidMapping(createKeepIdNs(0))).toBe(true);
    });

    test("returns true for root-mapped", () => {
      expect(hasUidGidMapping(createRootMappedNs())).toBe(true);
    });

    test("returns false for auto", () => {
      expect(hasUidGidMapping(createAutoNs())).toBe(false);
    });

    test("returns false for host", () => {
      expect(hasUidGidMapping(createHostNs())).toBe(false);
    });
  });
});
