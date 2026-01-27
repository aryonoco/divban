// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, test } from "bun:test";
import { Option } from "effect";
import {
  all,
  chars,
  collapseChar,
  escapeWith,
  filterCharsToString,
  last,
  mapCharsToString,
  uncons,
} from "../../src/lib/str";

describe("str module", () => {
  // ==========================================================================
  // Decomposition
  // ==========================================================================

  describe("chars", () => {
    test("splits string into characters", () => {
      expect(chars("abc")).toEqual(["a", "b", "c"]);
    });

    test("returns empty array for empty string", () => {
      expect(chars("")).toEqual([]);
    });

    test("handles unicode correctly", () => {
      expect(chars("a😀b")).toEqual(["a", "😀", "b"]);
    });
  });

  describe("uncons", () => {
    test("splits correctly", () => {
      expect(uncons("abc")).toEqual(Option.some(["a", "bc"] as const));
    });

    test("handles single character", () => {
      expect(uncons("a")).toEqual(Option.some(["a", ""] as const));
    });

    test("returns None for empty string", () => {
      expect(uncons("")).toEqual(Option.none());
    });

    test("handles unicode correctly", () => {
      expect(uncons("😀abc")).toEqual(Option.some(["😀", "abc"] as const));
    });
  });

  describe("last", () => {
    test("returns last character", () => {
      expect(last("abc")).toEqual(Option.some("c"));
    });

    test("returns None for empty string", () => {
      expect(last("")).toEqual(Option.none());
    });

    test("handles single character", () => {
      expect(last("x")).toEqual(Option.some("x"));
    });

    test("handles unicode correctly", () => {
      expect(last("abc😀")).toEqual(Option.some("😀"));
    });
  });

  // ==========================================================================
  // Predicate Lifting
  // ==========================================================================

  describe("all", () => {
    const isLower = (c: string): boolean => c >= "a" && c <= "z";

    test("returns true when all characters match", () => {
      expect(all(isLower)("abc")).toBe(true);
    });

    test("returns false when some characters don't match", () => {
      expect(all(isLower)("aBc")).toBe(false);
    });

    test("returns true for empty string", () => {
      expect(all(isLower)("")).toBe(true);
    });
  });

  // ==========================================================================
  // Transformation
  // ==========================================================================

  describe("mapCharsToString", () => {
    test("transforms each character", () => {
      const upper = mapCharsToString((c) => c.toUpperCase());
      expect(upper("abc")).toBe("ABC");
    });

    test("handles empty string", () => {
      const upper = mapCharsToString((c) => c.toUpperCase());
      expect(upper("")).toBe("");
    });

    test("can expand characters", () => {
      const double = mapCharsToString((c) => c + c);
      expect(double("ab")).toBe("aabb");
    });
  });

  describe("filterCharsToString", () => {
    test("keeps matching characters", () => {
      const digitsOnly = filterCharsToString((c) => c >= "0" && c <= "9");
      expect(digitsOnly("a1b2c3")).toBe("123");
    });

    test("handles empty string", () => {
      const digitsOnly = filterCharsToString((c) => c >= "0" && c <= "9");
      expect(digitsOnly("")).toBe("");
    });

    test("returns empty when no matches", () => {
      const digitsOnly = filterCharsToString((c) => c >= "0" && c <= "9");
      expect(digitsOnly("abc")).toBe("");
    });
  });

  describe("collapseChar", () => {
    test("collapses consecutive characters", () => {
      expect(collapseChar("/")("a//b///c")).toBe("a/b/c");
    });

    test("collapses leading characters", () => {
      expect(collapseChar("/")("///a")).toBe("/a");
    });

    test("handles empty string", () => {
      expect(collapseChar("/")("")).toBe("");
    });

    test("leaves single occurrences alone", () => {
      expect(collapseChar("/")("a/b/c")).toBe("a/b/c");
    });

    test("handles string without target character", () => {
      expect(collapseChar("/")("abc")).toBe("abc");
    });
  });

  describe("escapeWith", () => {
    test("escapes characters from mapping", () => {
      const mapping = new Map([['"', '\\"']]);
      expect(escapeWith(mapping)('"hello"')).toBe('\\"hello\\"');
    });

    test("leaves other characters unchanged", () => {
      const mapping = new Map([['"', '\\"']]);
      expect(escapeWith(mapping)("hello")).toBe("hello");
    });

    test("handles multiple escape sequences", () => {
      const mapping = new Map([
        ["\\", "\\\\"],
        ['"', '\\"'],
      ]);
      expect(escapeWith(mapping)('\\"')).toBe('\\\\\\"');
    });
  });
});
