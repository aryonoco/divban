// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, test } from "bun:test";
import { DivbanError, ErrorCode, wrapError } from "../../src/lib/errors.ts";
import {
  Err,
  Ok,
  collectResults,
  combine2,
  combine3,
  flatMapResult,
  fromSettled,
  isErr,
  isOk,
  mapErr,
  mapResult,
  orElse,
  parallel,
  retry,
  tryCatchSync,
  unwrapOr,
} from "../../src/lib/result.ts";

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

  describe("combine2", () => {
    test("returns Ok with tuple when both are Ok", () => {
      const result = combine2(Ok(1), Ok("a"));
      expect(result).toEqual(Ok([1, "a"]));
    });

    test("returns first error when first fails", () => {
      const error = new DivbanError(ErrorCode.GENERAL_ERROR, "first");
      const result = combine2(Err(error), Ok("a"));
      expect(result).toEqual(Err(error));
    });

    test("returns second error when second fails", () => {
      const error = new DivbanError(ErrorCode.GENERAL_ERROR, "second");
      const result = combine2(Ok(1), Err(error));
      expect(result).toEqual(Err(error));
    });
  });

  describe("combine3", () => {
    test("returns Ok with tuple when all are Ok", () => {
      const result = combine3(Ok(1), Ok("a"), Ok(true));
      expect(result).toEqual(Ok([1, "a", true]));
    });

    test("returns first error encountered", () => {
      const error = new DivbanError(ErrorCode.GENERAL_ERROR, "middle");
      const result = combine3(Ok(1), Err(error), Ok(true));
      expect(result).toEqual(Err(error));
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

  describe("fromSettled", () => {
    test("returns Ok value for fulfilled promise", () => {
      const settled: PromiseSettledResult<typeof Ok<number>> = {
        status: "fulfilled",
        value: Ok(42),
      };
      const result = fromSettled(
        settled,
        (e) => new DivbanError(ErrorCode.GENERAL_ERROR, String(e))
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(42);
      }
    });

    test("returns Err value for fulfilled promise with Err", () => {
      const error = new DivbanError(ErrorCode.GENERAL_ERROR, "test");
      const settled: PromiseSettledResult<typeof Err<DivbanError>> = {
        status: "fulfilled",
        value: Err(error),
      };
      const result = fromSettled(
        settled,
        (e) => new DivbanError(ErrorCode.GENERAL_ERROR, String(e))
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(error);
      }
    });

    test("converts rejection to Err with mapper", () => {
      const settled: PromiseSettledResult<typeof Ok<number>> = {
        status: "rejected",
        reason: new Error("rejected"),
      };
      const result = fromSettled(
        settled,
        (e) => new DivbanError(ErrorCode.GENERAL_ERROR, String(e))
      );
      expect(result.ok).toBe(false);
    });
  });

  describe("parallel", () => {
    test("collects all Ok values", async () => {
      const result = await parallel(
        [Promise.resolve(Ok(1)), Promise.resolve(Ok(2)), Promise.resolve(Ok(3))],
        (e) => wrapError(e, ErrorCode.GENERAL_ERROR, "test")
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([1, 2, 3]);
      }
    });

    test("returns first Err", async () => {
      const error = new DivbanError(ErrorCode.GENERAL_ERROR, "test error");
      const result = await parallel(
        [Promise.resolve(Ok(1)), Promise.resolve(Err(error)), Promise.resolve(Ok(3))],
        (e) => wrapError(e, ErrorCode.GENERAL_ERROR, "test")
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(error);
      }
    });

    test("handles empty array", async () => {
      const result = await parallel([], (e) => wrapError(e, ErrorCode.GENERAL_ERROR, "test"));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });

    test("converts rejection to Err with mapper", async () => {
      const result = await parallel(
        [Promise.resolve(Ok(1)), Promise.reject(new Error("rejected")), Promise.resolve(Ok(3))],
        (e) => new DivbanError(ErrorCode.GENERAL_ERROR, String(e))
      );
      expect(result.ok).toBe(false);
    });
  });

  describe("orElse", () => {
    test("passes through Ok unchanged", () => {
      const result = orElse(Ok(42), () => Ok(0));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(42);
      }
    });

    test("applies recovery on Err", () => {
      const error = new DivbanError(ErrorCode.GENERAL_ERROR, "original");
      const result = orElse(Err(error), () => Ok(0));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(0);
      }
    });

    test("can return different error type from recovery", () => {
      const originalError = new DivbanError(ErrorCode.GENERAL_ERROR, "original");
      const newError = new DivbanError(ErrorCode.EXEC_FAILED, "new");
      const result = orElse(Err(originalError), () => Err(newError));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(newError);
      }
    });
  });

  describe("retry", () => {
    test("returns Ok on first success", async () => {
      let attempts = 0;
      const result = await retry(
        () => {
          attempts++;
          return Promise.resolve(Ok(42));
        },
        () => true
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(42);
      }
      expect(attempts).toBe(1);
    });

    test("retries on retryable error until success", async () => {
      let attempts = 0;
      const result = await retry(
        () => {
          attempts++;
          if (attempts < 3) {
            return Promise.resolve(Err(new DivbanError(ErrorCode.GENERAL_ERROR, "retry")));
          }
          return Promise.resolve(Ok(42));
        },
        () => true,
        { maxAttempts: 5, baseDelayMs: 1 }
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(42);
      }
      expect(attempts).toBe(3);
    });

    test("stops retrying on non-retryable error", async () => {
      let attempts = 0;
      const error = new DivbanError(ErrorCode.GENERAL_ERROR, "non-retryable");
      const result = await retry(
        () => {
          attempts++;
          return Promise.resolve(Err(error));
        },
        () => false,
        { maxAttempts: 5, baseDelayMs: 1 }
      );
      expect(result.ok).toBe(false);
      expect(attempts).toBe(1);
    });

    test("returns last error after max attempts", async () => {
      let attempts = 0;
      const result = await retry(
        () => {
          attempts++;
          return Promise.resolve(
            Err(new DivbanError(ErrorCode.GENERAL_ERROR, `attempt ${attempts}`))
          );
        },
        () => true,
        { maxAttempts: 3, baseDelayMs: 1 }
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe("attempt 3");
      }
      expect(attempts).toBe(3);
    });
  });
});
