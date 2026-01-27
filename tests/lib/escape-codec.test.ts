// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, test } from "bun:test";
import { envEscapeCodec, makeEscapeCodec, quoteEscapeCodec } from "../../src/lib/escape-codec";

describe("EscapeCodec", () => {
  describe("envEscapeCodec", () => {
    test("escapes backslash", () => {
      expect(envEscapeCodec.escape("a\\b")).toBe("a\\\\b");
    });

    test("escapes double quote", () => {
      expect(envEscapeCodec.escape('a"b')).toBe('a\\"b');
    });

    test("escapes dollar sign", () => {
      expect(envEscapeCodec.escape("a$b")).toBe("a\\$b");
    });

    test("escapes backtick", () => {
      expect(envEscapeCodec.escape("a`b")).toBe("a\\`b");
    });

    test("escapes newline", () => {
      expect(envEscapeCodec.escape("a\nb")).toBe("a\\nb");
    });

    test("leaves plain strings unchanged", () => {
      expect(envEscapeCodec.escape("hello")).toBe("hello");
    });

    test("handles empty string", () => {
      expect(envEscapeCodec.escape("")).toBe("");
    });

    test("unescapes backslash", () => {
      expect(envEscapeCodec.unescape("a\\\\b")).toBe("a\\b");
    });

    test("unescapes double quote", () => {
      expect(envEscapeCodec.unescape('a\\"b')).toBe('a"b');
    });

    test("unescapes dollar sign", () => {
      expect(envEscapeCodec.unescape("a\\$b")).toBe("a$b");
    });

    test("unescapes backtick", () => {
      expect(envEscapeCodec.unescape("a\\`b")).toBe("a`b");
    });

    test("unescapes newline", () => {
      expect(envEscapeCodec.unescape("a\\nb")).toBe("a\nb");
    });

    test("leaves plain strings unchanged on unescape", () => {
      expect(envEscapeCodec.unescape("hello")).toBe("hello");
    });

    test("handles empty string on unescape", () => {
      expect(envEscapeCodec.unescape("")).toBe("");
    });

    test("round-trips strings with special characters", () => {
      const input = 'say "hello" to $USER\nand `world`\\!';
      expect(envEscapeCodec.unescape(envEscapeCodec.escape(input))).toBe(input);
    });

    test("round-trips empty string", () => {
      expect(envEscapeCodec.unescape(envEscapeCodec.escape(""))).toBe("");
    });

    test("round-trips string with all special chars", () => {
      const input = '\\"\n$`';
      expect(envEscapeCodec.unescape(envEscapeCodec.escape(input))).toBe(input);
    });
  });

  describe("quoteEscapeCodec", () => {
    test("escapes double quotes", () => {
      expect(quoteEscapeCodec.escape('"hello"')).toBe('\\"hello\\"');
    });

    test("leaves non-quote characters unchanged", () => {
      expect(quoteEscapeCodec.escape("hello")).toBe("hello");
    });

    test("round-trips", () => {
      const input = 'say "hello"';
      expect(quoteEscapeCodec.unescape(quoteEscapeCodec.escape(input))).toBe(input);
    });
  });

  describe("makeEscapeCodec", () => {
    test("custom codec with non-backslash prefix", () => {
      const codec = makeEscapeCodec("%", [
        ["&", "a"],
        ["<", "l"],
      ]);
      expect(codec.escape("a&b<c")).toBe("a%ab%lc");
      expect(codec.unescape("a%ab%lc")).toBe("a&b<c");
    });

    test("round-trips with custom codec", () => {
      const codec = makeEscapeCodec("%", [
        ["&", "a"],
        ["<", "l"],
      ]);
      const input = "a&b<c&<";
      expect(codec.unescape(codec.escape(input))).toBe(input);
    });

    test("handles empty pairs list", () => {
      const codec = makeEscapeCodec("\\", []);
      expect(codec.escape("hello")).toBe("hello");
      expect(codec.unescape("hello")).toBe("hello");
    });
  });
});
