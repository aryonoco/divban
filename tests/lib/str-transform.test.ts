// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, test } from "bun:test";
import {
  collapseChar,
  escapeWith,
  filterCharsToString,
  foldChars,
  mapCharsToString,
  replaceChars,
  stripPrefix,
  stripSuffix,
} from "../../src/lib/str-transform";

describe("str-transform", () => {
  describe("foldChars", () => {
    test("accumulates over characters", () => {
      const count = foldChars(0, (acc, _) => acc + 1);
      expect(count("hello")).toBe(5);
    });

    test("handles empty string", () => {
      const count = foldChars(0, (acc, _) => acc + 1);
      expect(count("")).toBe(0);
    });
  });

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

  describe("stripSuffix", () => {
    test("removes suffix when present", () => {
      expect(stripSuffix(".service")("foo.service")).toBe("foo");
    });

    test("returns original when suffix not present", () => {
      expect(stripSuffix(".service")("foo")).toBe("foo");
    });

    test("handles empty string", () => {
      expect(stripSuffix(".service")("")).toBe("");
    });

    test("handles suffix longer than string", () => {
      expect(stripSuffix(".service")("foo")).toBe("foo");
    });
  });

  describe("stripPrefix", () => {
    test("removes prefix when present", () => {
      expect(stripPrefix("http://")("http://example.com")).toBe("example.com");
    });

    test("returns original when prefix not present", () => {
      expect(stripPrefix("http://")("https://example.com")).toBe("https://example.com");
    });

    test("handles empty string", () => {
      expect(stripPrefix("http://")("")).toBe("");
    });
  });

  describe("replaceChars", () => {
    test("replaces characters from mapping", () => {
      const mapping = new Map([
        [":", "-"],
        [".", "_"],
      ]);
      expect(replaceChars(mapping)("10:30.5")).toBe("10-30_5");
    });

    test("leaves unmapped characters unchanged", () => {
      const mapping = new Map([[":", "-"]]);
      expect(replaceChars(mapping)("a:b")).toBe("a-b");
    });

    test("handles empty mapping", () => {
      const mapping = new Map<string, string>();
      expect(replaceChars(mapping)("abc")).toBe("abc");
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
