// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, test } from "bun:test";
import { DivbanError, ErrorCode } from "../../src/lib/errors";
import {
  Err,
  Ok,
  collectResults,
  flatMapResult,
  isErr,
  isOk,
  mapErr,
  mapResult,
  tryCatchSync,
  unwrapOr,
} from "../../src/lib/result";

describe("Result", () => {
  describe("Ok", () => {
    test("wraps value correctly", () => {
      const result = Ok(42);
      expect(result.ok).toBe(true);
      expect(result.value).toBe(42);
    });

    test("works with various types", () => {
      expect(Ok("string").value).toBe("string");
      expect(Ok(null).value).toBe(null);
      expect(Ok({ key: "value" }).value).toEqual({ key: "value" });
      expect(Ok([1, 2, 3]).value).toEqual([1, 2, 3]);
    });
  });

  describe("Err", () => {
    test("wraps error correctly", () => {
      const error = new DivbanError(ErrorCode.GENERAL_ERROR, "test error");
      const result = Err(error);
      expect(result.ok).toBe(false);
      expect(result.error).toBe(error);
    });
  });

  describe("mapResult", () => {
    test("transforms Ok value", () => {
      const result = mapResult(Ok(5), (x) => x * 2);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(10);
      }
    });

    test("passes through Err unchanged", () => {
      const error = new DivbanError(ErrorCode.GENERAL_ERROR, "error");
      const result = mapResult(Err(error), (x: number) => x * 2);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(error);
      }
    });
  });

  describe("flatMapResult", () => {
    test("chains Ok values", () => {
      const result = flatMapResult(Ok(5), (x) => Ok(x * 2));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(10);
      }
    });

    test("propagates inner Err", () => {
      const error = new DivbanError(ErrorCode.GENERAL_ERROR, "inner error");
      const result = flatMapResult(Ok(5), () => Err(error));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(error);
      }
    });

    test("short-circuits on outer Err", () => {
      const error = new DivbanError(ErrorCode.GENERAL_ERROR, "outer error");
      let called = false;
      const result = flatMapResult(Err(error), () => {
        called = true;
        return Ok(10);
      });
      expect(result.ok).toBe(false);
      expect(called).toBe(false);
    });
  });

  describe("collectResults", () => {
    test("collects all Ok values", () => {
      const results = [Ok(1), Ok(2), Ok(3)];
      const collected = collectResults(results);
      expect(collected.ok).toBe(true);
      if (collected.ok) {
        expect(collected.value).toEqual([1, 2, 3]);
      }
    });

    test("returns first Err", () => {
      const error = new DivbanError(ErrorCode.GENERAL_ERROR, "first error");
      const results = [Ok(1), Err(error), Ok(3)];
      const collected = collectResults(results);
      expect(collected.ok).toBe(false);
      if (!collected.ok) {
        expect(collected.error).toBe(error);
      }
    });

    test("handles empty array", () => {
      const collected = collectResults([]);
      expect(collected.ok).toBe(true);
      if (collected.ok) {
        expect(collected.value).toEqual([]);
      }
    });
  });

  describe("mapErr", () => {
    test("transforms Err", () => {
      const error1 = new DivbanError(ErrorCode.GENERAL_ERROR, "error1");
      const error2 = new DivbanError(ErrorCode.EXEC_FAILED, "error2");
      const result = mapErr(Err(error1), () => error2);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(error2);
      }
    });

    test("passes through Ok unchanged", () => {
      const result = mapErr(Ok(42), () => new DivbanError(ErrorCode.GENERAL_ERROR, "unused"));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(42);
      }
    });
  });

  describe("unwrapOr", () => {
    test("returns value for Ok", () => {
      expect(unwrapOr(Ok(42), 0)).toBe(42);
    });

    test("returns default for Err", () => {
      const error = new DivbanError(ErrorCode.GENERAL_ERROR, "error");
      expect(unwrapOr(Err(error), 0)).toBe(0);
    });
  });

  describe("isOk and isErr", () => {
    test("isOk returns true for Ok", () => {
      expect(isOk(Ok(42))).toBe(true);
    });

    test("isOk returns false for Err", () => {
      expect(isOk(Err(new DivbanError(ErrorCode.GENERAL_ERROR, "error")))).toBe(false);
    });

    test("isErr returns true for Err", () => {
      expect(isErr(Err(new DivbanError(ErrorCode.GENERAL_ERROR, "error")))).toBe(true);
    });

    test("isErr returns false for Ok", () => {
      expect(isErr(Ok(42))).toBe(false);
    });
  });

  describe("tryCatchSync", () => {
    test("returns Ok for successful function", () => {
      const result = tryCatchSync(
        () => 42,
        (e) => new DivbanError(ErrorCode.GENERAL_ERROR, String(e))
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(42);
      }
    });

    test("returns Err for throwing function", () => {
      const result = tryCatchSync(
        () => {
          throw new Error("test error");
        },
        (e) => new DivbanError(ErrorCode.GENERAL_ERROR, String(e))
      );
      expect(result.ok).toBe(false);
    });
  });
});
