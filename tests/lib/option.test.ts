// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, test } from "bun:test";
import {
  None,
  Some,
  and,
  contains,
  expect as expectOption,
  filter,
  flatMapOption,
  flatten,
  fromNullable,
  fromUndefined,
  getOrElse,
  getOrElseLazy,
  isNone,
  isSome,
  mapOption,
  mapOr,
  mapOrElse,
  okOr,
  okOrElse,
  or,
  toArray,
  transpose,
  unwrap,
  xor,
  zip,
  zipWith,
} from "../../src/lib/option.ts";

describe("Option", () => {
  describe("Some", () => {
    test("wraps value correctly", () => {
      const opt = Some(42);
      expect(opt.isSome).toBe(true);
      if (opt.isSome) {
        expect(opt.value).toBe(42);
      }
    });

    test("works with various types", () => {
      expect(Some("string").value).toBe("string");
      expect(Some(null).value).toBe(null);
      expect(Some({ key: "value" }).value).toEqual({ key: "value" });
      expect(Some([1, 2, 3]).value).toEqual([1, 2, 3]);
    });

    test("wraps false and 0 correctly", () => {
      const falsyBool = Some(false);
      expect(falsyBool.isSome).toBe(true);
      if (falsyBool.isSome) {
        expect(falsyBool.value).toBe(false);
      }

      const zero = Some(0);
      expect(zero.isSome).toBe(true);
      if (zero.isSome) {
        expect(zero.value).toBe(0);
      }
    });
  });

  describe("None", () => {
    test("is singleton with isSome false", () => {
      expect(None.isSome).toBe(false);
    });

    test("has no value property accessible", () => {
      expect("value" in None).toBe(false);
    });
  });

  describe("isSome and isNone", () => {
    test("isSome returns true for Some", () => {
      expect(isSome(Some(42))).toBe(true);
    });

    test("isSome returns false for None", () => {
      expect(isSome(None)).toBe(false);
    });

    test("isNone returns true for None", () => {
      expect(isNone(None)).toBe(true);
    });

    test("isNone returns false for Some", () => {
      expect(isNone(Some(42))).toBe(false);
    });

    test("type guards narrow correctly", () => {
      const opt = Some(42);
      if (isSome(opt)) {
        // TypeScript should know opt.value exists here
        expect(opt.value).toBe(42);
      }
    });
  });

  describe("mapOption", () => {
    test("transforms Some value", () => {
      const result = mapOption(Some(5), (x) => x * 2);
      expect(result.isSome).toBe(true);
      if (result.isSome) {
        expect(result.value).toBe(10);
      }
    });

    test("passes through None unchanged", () => {
      const result = mapOption(None, (x: number) => x * 2);
      expect(result.isSome).toBe(false);
    });

    test("can change type", () => {
      const result = mapOption(Some(42), (x) => String(x));
      expect(result.isSome).toBe(true);
      if (result.isSome) {
        expect(result.value).toBe("42");
      }
    });
  });

  describe("flatMapOption", () => {
    test("chains Some values", () => {
      const result = flatMapOption(Some(5), (x) => Some(x * 2));
      expect(result.isSome).toBe(true);
      if (result.isSome) {
        expect(result.value).toBe(10);
      }
    });

    test("propagates inner None", () => {
      const result = flatMapOption(Some(5), () => None);
      expect(result.isSome).toBe(false);
    });

    test("short-circuits on outer None", () => {
      let called = false;
      const result = flatMapOption(None, () => {
        called = true;
        return Some(10);
      });
      expect(result.isSome).toBe(false);
      expect(called).toBe(false);
    });
  });

  describe("filter", () => {
    test("keeps Some if predicate passes", () => {
      const result = filter(Some(10), (x) => x > 5);
      expect(result.isSome).toBe(true);
      if (result.isSome) {
        expect(result.value).toBe(10);
      }
    });

    test("returns None if predicate fails", () => {
      const result = filter(Some(3), (x) => x > 5);
      expect(result.isSome).toBe(false);
    });

    test("passes None through", () => {
      const result = filter(None, (_x: number) => true);
      expect(result.isSome).toBe(false);
    });
  });

  describe("getOrElse", () => {
    test("returns value for Some", () => {
      expect(getOrElse(Some(42), 0)).toBe(42);
    });

    test("returns default for None", () => {
      expect(getOrElse(None, 0)).toBe(0);
    });
  });

  describe("getOrElseLazy", () => {
    test("returns value for Some without calling fn", () => {
      let called = false;
      const result = getOrElseLazy(Some(42), () => {
        called = true;
        return 0;
      });
      expect(result).toBe(42);
      expect(called).toBe(false);
    });

    test("calls fn for None", () => {
      let called = false;
      const result = getOrElseLazy(None, () => {
        called = true;
        return 0;
      });
      expect(result).toBe(0);
      expect(called).toBe(true);
    });
  });

  describe("unwrap", () => {
    test("returns value for Some", () => {
      expect(unwrap(Some(42))).toBe(42);
    });

    test("throws for None", () => {
      expect(() => unwrap(None)).toThrow("Called unwrap() on None");
    });
  });

  describe("expect", () => {
    test("returns value for Some", () => {
      expect(expectOption(Some(42), "Should have value")).toBe(42);
    });

    test("throws with custom message for None", () => {
      expect(() => expectOption(None, "Custom error message")).toThrow("Custom error message");
    });
  });

  describe("okOr", () => {
    test("converts Some to Ok", () => {
      const result = okOr(Some(42), "error");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(42);
      }
    });

    test("converts None to Err", () => {
      const result = okOr(None, "error");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("error");
      }
    });
  });

  describe("okOrElse", () => {
    test("converts Some to Ok without calling fn", () => {
      let called = false;
      const result = okOrElse(Some(42), () => {
        called = true;
        return "error";
      });
      expect(result.ok).toBe(true);
      expect(called).toBe(false);
    });

    test("converts None to Err by calling fn", () => {
      const result = okOrElse(None, () => "computed error");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("computed error");
      }
    });
  });

  describe("mapOr", () => {
    test("maps Some value", () => {
      const result = mapOr(Some(5), 0, (x) => x * 2);
      expect(result).toBe(10);
    });

    test("returns default for None", () => {
      const result = mapOr(None, 0, (x: number) => x * 2);
      expect(result).toBe(0);
    });
  });

  describe("mapOrElse", () => {
    test("maps Some value without calling default fn", () => {
      let defaultCalled = false;
      const result = mapOrElse(
        Some(5),
        () => {
          defaultCalled = true;
          return 0;
        },
        (x) => x * 2
      );
      expect(result).toBe(10);
      expect(defaultCalled).toBe(false);
    });

    test("calls default fn for None", () => {
      const result = mapOrElse(
        None,
        () => 99,
        (x: number) => x * 2
      );
      expect(result).toBe(99);
    });
  });

  describe("and", () => {
    test("returns other if first is Some", () => {
      const result = and(Some(1), Some("hello"));
      expect(result.isSome).toBe(true);
      if (result.isSome) {
        expect(result.value).toBe("hello");
      }
    });

    test("returns None if first is None", () => {
      const result = and(None, Some("hello"));
      expect(result.isSome).toBe(false);
    });

    test("returns None if other is None", () => {
      const result = and(Some(1), None);
      expect(result.isSome).toBe(false);
    });
  });

  describe("or", () => {
    test("returns first if Some", () => {
      const result = or(Some(1), Some(2));
      expect(result.isSome).toBe(true);
      if (result.isSome) {
        expect(result.value).toBe(1);
      }
    });

    test("returns other if first is None", () => {
      const result = or(None, Some(2));
      expect(result.isSome).toBe(true);
      if (result.isSome) {
        expect(result.value).toBe(2);
      }
    });

    test("returns None if both are None", () => {
      const result = or(None, None);
      expect(result.isSome).toBe(false);
    });
  });

  describe("xor", () => {
    test("returns first if only first is Some", () => {
      const result = xor(Some(1), None);
      expect(result.isSome).toBe(true);
      if (result.isSome) {
        expect(result.value).toBe(1);
      }
    });

    test("returns second if only second is Some", () => {
      const result = xor(None, Some(2));
      expect(result.isSome).toBe(true);
      if (result.isSome) {
        expect(result.value).toBe(2);
      }
    });

    test("returns None if both are Some", () => {
      const result = xor(Some(1), Some(2));
      expect(result.isSome).toBe(false);
    });

    test("returns None if both are None", () => {
      const result = xor(None, None);
      expect(result.isSome).toBe(false);
    });
  });

  describe("zip", () => {
    test("zips two Some values", () => {
      const result = zip(Some(1), Some("a"));
      expect(result.isSome).toBe(true);
      if (result.isSome) {
        expect(result.value).toEqual([1, "a"]);
      }
    });

    test("returns None if first is None", () => {
      const result = zip(None, Some("a"));
      expect(result.isSome).toBe(false);
    });

    test("returns None if second is None", () => {
      const result = zip(Some(1), None);
      expect(result.isSome).toBe(false);
    });
  });

  describe("zipWith", () => {
    test("combines two Some values with function", () => {
      const result = zipWith(Some(2), Some(3), (a, b) => a + b);
      expect(result.isSome).toBe(true);
      if (result.isSome) {
        expect(result.value).toBe(5);
      }
    });

    test("returns None if either is None", () => {
      const result = zipWith(Some(2), None, (a: number, b: number) => a + b);
      expect(result.isSome).toBe(false);
    });
  });

  describe("flatten", () => {
    test("flattens nested Some", () => {
      const result = flatten(Some(Some(42)));
      expect(result.isSome).toBe(true);
      if (result.isSome) {
        expect(result.value).toBe(42);
      }
    });

    test("flattens Some(None) to None", () => {
      const result = flatten(Some(None));
      expect(result.isSome).toBe(false);
    });

    test("keeps outer None as None", () => {
      const result = flatten(None);
      expect(result.isSome).toBe(false);
    });
  });

  describe("contains", () => {
    test("returns true if Some contains value", () => {
      expect(contains(Some(42), 42)).toBe(true);
    });

    test("returns false if Some contains different value", () => {
      expect(contains(Some(42), 99)).toBe(false);
    });

    test("returns false for None", () => {
      expect(contains(None, 42)).toBe(false);
    });
  });

  describe("toArray", () => {
    test("returns singleton array for Some", () => {
      expect(toArray(Some(42))).toEqual([42]);
    });

    test("returns empty array for None", () => {
      expect(toArray(None)).toEqual([]);
    });
  });

  describe("transpose", () => {
    test("transposes Some(Ok) to Ok(Some)", () => {
      const result = transpose(Some({ ok: true as const, value: 42 }));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isSome).toBe(true);
        if (result.value.isSome) {
          expect(result.value.value).toBe(42);
        }
      }
    });

    test("transposes Some(Err) to Err", () => {
      const result = transpose(Some({ ok: false as const, error: "error" }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("error");
      }
    });

    test("transposes None to Ok(None)", () => {
      const result = transpose(None);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isSome).toBe(false);
      }
    });
  });

  describe("fromUndefined", () => {
    test("creates Some from defined value", () => {
      const result = fromUndefined(42);
      expect(result.isSome).toBe(true);
      if (result.isSome) {
        expect(result.value).toBe(42);
      }
    });

    test("creates None from undefined", () => {
      const result = fromUndefined(undefined);
      expect(result.isSome).toBe(false);
    });

    test("creates Some from null", () => {
      const result = fromUndefined(null);
      expect(result.isSome).toBe(true);
      if (result.isSome) {
        expect(result.value).toBe(null);
      }
    });
  });

  describe("fromNullable", () => {
    test("creates Some from defined value", () => {
      const result = fromNullable(42);
      expect(result.isSome).toBe(true);
      if (result.isSome) {
        expect(result.value).toBe(42);
      }
    });

    test("creates None from undefined", () => {
      const result = fromNullable(undefined);
      expect(result.isSome).toBe(false);
    });

    test("creates None from null", () => {
      const result = fromNullable(null);
      expect(result.isSome).toBe(false);
    });
  });
});
