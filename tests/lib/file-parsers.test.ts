// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, test } from "bun:test";
import { Option } from "effect";
import {
  filterContentLines,
  findFirstAvailableUid,
  findGapForRange,
  parseKeyValue,
  parsePasswdUids,
  parseSubidRanges,
  toContentLines,
} from "../../src/lib/file-parsers";

describe("file-parsers", () => {
  describe("filterContentLines", () => {
    test("filters empty lines", () => {
      const result = filterContentLines(["foo", "", "bar", "  ", "baz"]);
      expect(result).toEqual(["foo", "bar", "baz"]);
    });

    test("filters comment lines", () => {
      const result = filterContentLines(["foo", "# comment", "bar", "  # indented comment"]);
      expect(result).toEqual(["foo", "bar"]);
    });
  });

  describe("toContentLines", () => {
    test("splits and filters content", () => {
      const result = toContentLines("foo\n# comment\n\nbar");
      expect(result).toEqual(["foo", "bar"]);
    });
  });

  describe("parseKeyValue", () => {
    test("parses KEY=VALUE format", () => {
      const result = parseKeyValue("FOO=bar\nBAZ=qux");
      expect(result).toEqual({ FOO: "bar", BAZ: "qux" });
    });

    test("handles values with equals signs", () => {
      const result = parseKeyValue("URL=https://example.com?foo=bar");
      expect(result).toEqual({ URL: "https://example.com?foo=bar" });
    });

    test("skips invalid lines", () => {
      const result = parseKeyValue("VALID=value\ninvalid line\nALSO_VALID=ok");
      expect(result).toEqual({ VALID: "value", ALSO_VALID: "ok" });
    });

    test("skips comments", () => {
      const result = parseKeyValue("FOO=bar\n# comment\nBAZ=qux");
      expect(result).toEqual({ FOO: "bar", BAZ: "qux" });
    });
  });

  describe("parsePasswdUids", () => {
    test("extracts UIDs from passwd format", () => {
      const content =
        "root:x:0:0:root:/root:/bin/bash\nnobody:x:65534:65534:nobody:/:/usr/sbin/nologin";
      const result = parsePasswdUids(content);
      expect(result).toEqual([0, 65534]);
    });

    test("skips malformed lines", () => {
      const content =
        "valid:x:1000:1000::/home/valid:/bin/bash\ninvalid line\nalso:x:1001:1001::/home/also:/bin/bash";
      const result = parsePasswdUids(content);
      expect(result).toEqual([1000, 1001]);
    });

    test("skips lines with non-numeric UID", () => {
      const content = "user:x:abc:1000::/home/user:/bin/bash";
      const result = parsePasswdUids(content);
      expect(result).toEqual([]);
    });
  });

  describe("parseSubidRanges", () => {
    test("parses subuid format", () => {
      const content = "user1:100000:65536\nuser2:165536:65536";
      const result = parseSubidRanges(content);
      expect(result).toEqual([
        { user: "user1", start: 100000, end: 165535 },
        { user: "user2", start: 165536, end: 231071 },
      ]);
    });

    test("skips malformed lines", () => {
      const content = "valid:100000:65536\ninvalid\nalso:200000:65536";
      const result = parseSubidRanges(content);
      expect(result).toEqual([
        { user: "valid", start: 100000, end: 165535 },
        { user: "also", start: 200000, end: 265535 },
      ]);
    });
  });

  describe("findFirstAvailableUid", () => {
    test("finds first available UID", () => {
      const used = new Set([10000, 10001, 10003]);
      const result = findFirstAvailableUid(10000, 10010, used);
      expect(Option.isSome(result)).toBe(true);
      expect(Option.getOrThrow(result)).toBe(10002);
    });

    test("returns none when range exhausted", () => {
      const used = new Set([10000, 10001, 10002]);
      const result = findFirstAvailableUid(10000, 10002, used);
      expect(Option.isNone(result)).toBe(true);
    });

    test("returns first in range when none used", () => {
      const used = new Set<number>();
      const result = findFirstAvailableUid(10000, 10010, used);
      expect(Option.isSome(result)).toBe(true);
      expect(Option.getOrThrow(result)).toBe(10000);
    });
  });

  describe("findGapForRange", () => {
    test("finds gap before first range", () => {
      const ranges = [{ user: "a", start: 200000, end: 265535 }];
      const result = findGapForRange(ranges, 100000, 65536, 4294967294);
      expect(Option.isSome(result)).toBe(true);
      expect(Option.getOrThrow(result)).toBe(100000);
    });

    test("finds gap between ranges", () => {
      const ranges = [
        { user: "a", start: 100000, end: 165535 },
        { user: "b", start: 300000, end: 365535 },
      ];
      const result = findGapForRange(ranges, 100000, 65536, 4294967294);
      expect(Option.isSome(result)).toBe(true);
      expect(Option.getOrThrow(result)).toBe(165536);
    });

    test("finds gap after all ranges", () => {
      const ranges = [{ user: "a", start: 100000, end: 165535 }];
      const result = findGapForRange(ranges, 100000, 65536, 4294967294);
      expect(Option.isSome(result)).toBe(true);
      expect(Option.getOrThrow(result)).toBe(165536);
    });

    test("returns none when no gap available", () => {
      const ranges = [{ user: "a", start: 100000, end: 165535 }];
      const result = findGapForRange(ranges, 100000, 65536, 165535);
      expect(Option.isNone(result)).toBe(true);
    });

    test("handles unsorted input", () => {
      const ranges = [
        { user: "b", start: 300000, end: 365535 },
        { user: "a", start: 100000, end: 165535 },
      ];
      const result = findGapForRange(ranges, 100000, 65536, 4294967294);
      expect(Option.isSome(result)).toBe(true);
      expect(Option.getOrThrow(result)).toBe(165536);
    });
  });
});
