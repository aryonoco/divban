// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, test } from "bun:test";
import { Option } from "effect";
import { all, any, charAt, chars, head, last, uncons } from "../../src/lib/str";

describe("str module", () => {
  describe("head", () => {
    test("returns Some for non-empty string", () => {
      expect(head("abc")).toEqual(Option.some("a"));
    });

    test("returns None for empty string", () => {
      expect(head("")).toEqual(Option.none());
    });

    test("handles unicode correctly", () => {
      expect(head("😀abc")).toEqual(Option.some("😀"));
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

  describe("charAt", () => {
    test("returns character at valid index", () => {
      expect(charAt(1)("abc")).toEqual(Option.some("b"));
    });

    test("returns None for negative index", () => {
      expect(charAt(-1)("abc")).toEqual(Option.none());
    });

    test("returns None for out of bounds index", () => {
      expect(charAt(3)("abc")).toEqual(Option.none());
    });

    test("returns first character at index 0", () => {
      expect(charAt(0)("abc")).toEqual(Option.some("a"));
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

  describe("any", () => {
    const isDigit = (c: string): boolean => c >= "0" && c <= "9";

    test("returns true when at least one character matches", () => {
      expect(any(isDigit)("abc1")).toBe(true);
    });

    test("returns false when no characters match", () => {
      expect(any(isDigit)("abc")).toBe(false);
    });

    test("returns false for empty string", () => {
      expect(any(isDigit)("")).toBe(false);
    });
  });
});
