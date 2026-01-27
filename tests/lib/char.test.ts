// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, test } from "bun:test";
import {
  isAlpha,
  isAlphaNum,
  isDigit,
  isHexDigit,
  isLower,
  isLowerHex,
  isOneOf,
  isWhitespace,
} from "../../src/lib/char";

describe("char predicates", () => {
  describe("isLower", () => {
    test("returns true for lowercase letters", () => {
      expect(isLower("a")).toBe(true);
      expect(isLower("z")).toBe(true);
      expect(isLower("m")).toBe(true);
    });

    test("returns false for uppercase letters", () => {
      expect(isLower("A")).toBe(false);
      expect(isLower("Z")).toBe(false);
    });

    test("returns false for digits", () => {
      expect(isLower("0")).toBe(false);
      expect(isLower("9")).toBe(false);
    });

    test("returns false for special characters", () => {
      expect(isLower("_")).toBe(false);
      expect(isLower("-")).toBe(false);
    });
  });

  describe("isDigit", () => {
    test("returns true for digits", () => {
      expect(isDigit("0")).toBe(true);
      expect(isDigit("5")).toBe(true);
      expect(isDigit("9")).toBe(true);
    });

    test("returns false for letters", () => {
      expect(isDigit("a")).toBe(false);
      expect(isDigit("A")).toBe(false);
    });
  });

  describe("isAlpha", () => {
    test("returns true for letters", () => {
      expect(isAlpha("a")).toBe(true);
      expect(isAlpha("Z")).toBe(true);
    });

    test("returns false for digits", () => {
      expect(isAlpha("0")).toBe(false);
    });
  });

  describe("isAlphaNum", () => {
    test("returns true for letters and digits", () => {
      expect(isAlphaNum("a")).toBe(true);
      expect(isAlphaNum("Z")).toBe(true);
      expect(isAlphaNum("5")).toBe(true);
    });

    test("returns false for special characters", () => {
      expect(isAlphaNum("_")).toBe(false);
      expect(isAlphaNum("-")).toBe(false);
    });
  });

  describe("isHexDigit", () => {
    test("returns true for hex digits", () => {
      expect(isHexDigit("0")).toBe(true);
      expect(isHexDigit("9")).toBe(true);
      expect(isHexDigit("a")).toBe(true);
      expect(isHexDigit("f")).toBe(true);
      expect(isHexDigit("A")).toBe(true);
      expect(isHexDigit("F")).toBe(true);
    });

    test("returns false for non-hex characters", () => {
      expect(isHexDigit("g")).toBe(false);
      expect(isHexDigit("G")).toBe(false);
      expect(isHexDigit("z")).toBe(false);
    });
  });

  describe("isLowerHex", () => {
    test("returns true for lowercase hex digits", () => {
      expect(isLowerHex("0")).toBe(true);
      expect(isLowerHex("a")).toBe(true);
      expect(isLowerHex("f")).toBe(true);
    });

    test("returns false for uppercase hex digits", () => {
      expect(isLowerHex("A")).toBe(false);
      expect(isLowerHex("F")).toBe(false);
    });
  });

  describe("isWhitespace", () => {
    test("returns true for whitespace characters", () => {
      expect(isWhitespace(" ")).toBe(true);
      expect(isWhitespace("\t")).toBe(true);
      expect(isWhitespace("\n")).toBe(true);
      expect(isWhitespace("\r")).toBe(true);
    });

    test("returns false for non-whitespace", () => {
      expect(isWhitespace("a")).toBe(false);
      expect(isWhitespace("0")).toBe(false);
    });
  });

  describe("isOneOf", () => {
    test("returns true when character is in set", () => {
      const isPunc = isOneOf("_.-");
      expect(isPunc("_")).toBe(true);
      expect(isPunc(".")).toBe(true);
      expect(isPunc("-")).toBe(true);
    });

    test("returns false when character is not in set", () => {
      const isPunc = isOneOf("_.-");
      expect(isPunc("a")).toBe(false);
      expect(isPunc("0")).toBe(false);
    });
  });
});
