// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { AppLogger } from "../../src/services/context";
import {
  type EmptyState,
  Outcome,
  type PipelineBuilder,
  SetupStep,
  emptyState,
  pipeline,
} from "../../src/services/helpers";

// Mock logger for tests - implements Logger interface
const mockLogger = {
  debug: (): undefined => undefined,
  info: (): undefined => undefined,
  warn: (): undefined => undefined,
  error: (): undefined => undefined,
  success: (): undefined => undefined,
  fail: (): undefined => undefined,
  step: (): undefined => undefined,
  raw: (): undefined => undefined,
  child: (): typeof mockLogger => mockLogger,
};

const TestAppLogger = Layer.succeed(AppLogger, mockLogger);

describe("PipelineBuilder", () => {
  describe("type inference", () => {
    test("accumulates output types correctly", () => {
      interface A {
        readonly a: number;
      }
      interface B {
        readonly b: string;
      }

      const step1: SetupStep<EmptyState, A, never, never> = SetupStep.pure(
        "Step 1",
        (): Effect.Effect<A, never, never> => Effect.succeed({ a: 1 })
      );

      const step2: SetupStep<EmptyState & A, B, never, never> = SetupStep.pure(
        "Step 2",
        (state: EmptyState & A): Effect.Effect<B, never, never> =>
          Effect.succeed({ b: `value-${state.a}` })
      );

      // Type check: this should compile
      const builder: PipelineBuilder<EmptyState, EmptyState & A & B, never, never> =
        pipeline<EmptyState>().andThen(step1).andThen(step2);

      expect(builder.stepCount).toBe(2);
    });

    test("accumulates error types correctly", () => {
      class ErrorA {
        readonly _tag = "ErrorA" as const;
      }
      class ErrorB {
        readonly _tag = "ErrorB" as const;
      }

      const step1: SetupStep<EmptyState, { readonly a: 1 }, ErrorA, never> = SetupStep.pure(
        "Step 1",
        (): Effect.Effect<{ readonly a: 1 }, ErrorA, never> => Effect.succeed({ a: 1 as const })
      );

      const step2: SetupStep<EmptyState & { readonly a: 1 }, { readonly b: 2 }, ErrorB, never> =
        SetupStep.pure(
          "Step 2",
          (): Effect.Effect<{ readonly b: 2 }, ErrorB, never> => Effect.succeed({ b: 2 as const })
        );

      const builder = pipeline<EmptyState>().andThen(step1).andThen(step2);

      // Type should be PipelineBuilder<EmptyState, ..., ErrorA | ErrorB, never>
      expect(builder.stepCount).toBe(2);
    });
  });

  describe("execution", () => {
    test("executes steps in sequence", async () => {
      const executionOrder: number[] = [];

      const step1 = SetupStep.pure<EmptyState, { readonly order1: true }, never, never>(
        "Step 1",
        (): Effect.Effect<{ readonly order1: true }, never, never> => {
          executionOrder.push(1);
          return Effect.succeed({ order1: true as const });
        }
      );

      const step2 = SetupStep.pure<
        EmptyState & { readonly order1: true },
        { readonly order2: true },
        never,
        never
      >("Step 2", (): Effect.Effect<{ readonly order2: true }, never, never> => {
        executionOrder.push(2);
        return Effect.succeed({ order2: true as const });
      });

      const step3 = SetupStep.pure<
        EmptyState & { readonly order1: true } & { readonly order2: true },
        { readonly order3: true },
        never,
        never
      >("Step 3", (): Effect.Effect<{ readonly order3: true }, never, never> => {
        executionOrder.push(3);
        return Effect.succeed({ order3: true as const });
      });

      const effect = pipeline<EmptyState>()
        .andThen(step1)
        .andThen(step2)
        .andThen(step3)
        .execute(emptyState);

      await Effect.runPromise(Effect.provide(effect, TestAppLogger));

      expect(executionOrder).toEqual([1, 2, 3]);
    });

    test("passes accumulated state to each step", async () => {
      const step1 = SetupStep.pure<EmptyState, { readonly value: number }, never, never>(
        "Step 1",
        (): Effect.Effect<{ readonly value: number }, never, never> => Effect.succeed({ value: 10 })
      );

      const step2 = SetupStep.pure<
        EmptyState & { readonly value: number },
        { readonly doubled: number },
        never,
        never
      >(
        "Step 2",
        (state): Effect.Effect<{ readonly doubled: number }, never, never> =>
          Effect.succeed({ doubled: state.value * 2 })
      );

      let finalValue = 0;
      const step3 = SetupStep.pure<
        EmptyState & { readonly value: number } & { readonly doubled: number },
        Record<string, never>,
        never,
        never
      >("Step 3", (state): Effect.Effect<Record<string, never>, never, never> => {
        finalValue = state.doubled;
        return Effect.succeed({});
      });

      const effect = pipeline<EmptyState>()
        .andThen(step1)
        .andThen(step2)
        .andThen(step3)
        .execute(emptyState);

      await Effect.runPromise(Effect.provide(effect, TestAppLogger));

      expect(finalValue).toBe(20);
    });
  });

  describe("resource cleanup", () => {
    test("calls release on success with Success outcome", async () => {
      let releaseOutcome: Outcome | undefined;

      const step = SetupStep.resource<EmptyState, { readonly resource: true }, never, never>(
        "Resource step",
        (): Effect.Effect<{ readonly resource: true }, never, never> =>
          Effect.succeed({ resource: true as const }),
        (_state, outcome): Effect.Effect<void, never, never> => {
          releaseOutcome = outcome;
          return Effect.void;
        }
      );

      const effect = pipeline<EmptyState>().andThen(step).execute(emptyState);
      await Effect.runPromise(Effect.provide(effect, TestAppLogger));

      expect(releaseOutcome).toEqual(Outcome.success);
    });

    test("calls release on failure with Failure outcome", async () => {
      let releaseOutcome: Outcome | undefined;
      class TestError {
        readonly _tag = "TestError" as const;
      }

      const step1 = SetupStep.resource<EmptyState, { readonly acquired: true }, never, never>(
        "Acquire",
        (): Effect.Effect<{ readonly acquired: true }, never, never> =>
          Effect.succeed({ acquired: true as const }),
        (_state, outcome): Effect.Effect<void, never, never> => {
          releaseOutcome = outcome;
          return Effect.void;
        }
      );

      const step2 = SetupStep.pure<
        EmptyState & { readonly acquired: true },
        never,
        TestError,
        never
      >("Fail", (): Effect.Effect<never, TestError, never> => Effect.fail(new TestError()));

      const effect = pipeline<EmptyState>().andThen(step1).andThen(step2).execute(emptyState);

      await Effect.runPromiseExit(Effect.provide(effect, TestAppLogger));

      expect(releaseOutcome).toEqual(Outcome.failure);
    });

    test("releases in reverse order on failure", async () => {
      const releaseOrder: number[] = [];

      const step1 = SetupStep.resource<EmptyState, { readonly s1: true }, never, never>(
        "Step 1",
        (): Effect.Effect<{ readonly s1: true }, never, never> =>
          Effect.succeed({ s1: true as const }),
        (): Effect.Effect<void, never, never> => {
          releaseOrder.push(1);
          return Effect.void;
        }
      );

      const step2 = SetupStep.resource<
        EmptyState & { readonly s1: true },
        { readonly s2: true },
        never,
        never
      >(
        "Step 2",
        (): Effect.Effect<{ readonly s2: true }, never, never> =>
          Effect.succeed({ s2: true as const }),
        (): Effect.Effect<void, never, never> => {
          releaseOrder.push(2);
          return Effect.void;
        }
      );

      class FailError {
        readonly _tag = "FailError" as const;
      }
      const step3 = SetupStep.pure<
        EmptyState & { readonly s1: true } & { readonly s2: true },
        never,
        FailError,
        never
      >(
        "Step 3 (fails)",
        (): Effect.Effect<never, FailError, never> => Effect.fail(new FailError())
      );

      const effect = pipeline<EmptyState>()
        .andThen(step1)
        .andThen(step2)
        .andThen(step3)
        .execute(emptyState);

      await Effect.runPromiseExit(Effect.provide(effect, TestAppLogger));

      // Effect.scoped releases finalizers in reverse order (LIFO)
      expect(releaseOrder).toEqual([2, 1]);
    });
  });

  describe("stepCount", () => {
    test("returns 0 for empty pipeline", () => {
      const builder = pipeline<EmptyState>();
      expect(builder.stepCount).toBe(0);
    });

    test("increments with each step", () => {
      const step = SetupStep.pure<EmptyState, Record<string, never>, never, never>(
        "Step",
        (): Effect.Effect<Record<string, never>, never, never> => Effect.succeed({})
      );

      expect(pipeline<EmptyState>().andThen(step).stepCount).toBe(1);
      expect(pipeline<EmptyState>().andThen(step).andThen(step).stepCount).toBe(2);
      expect(pipeline<EmptyState>().andThen(step).andThen(step).andThen(step).stepCount).toBe(3);
    });
  });
});
