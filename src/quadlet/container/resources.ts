// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Container resource limits via cgroups. Memory limits prevent OOM
 * from affecting other containers. PidsLimit prevents fork bombs.
 * ShmSize is critical for PostgreSQL and other apps using shared
 * memory - the 64MB default is often too small. The memory parser
 * uses a state machine to handle various formats (512m, 2G, 1024).
 */

import { Array as Arr, Effect, Option, pipe } from "effect";
import { isDigit, isWhitespace } from "../../lib/char";
import { ErrorCode, GeneralError } from "../../lib/errors";
import { chars } from "../../lib/str";
import type { Entries } from "../entry";
import { concat, fromValue } from "../entry-combinators";

// ============================================================================
// Parsed Result Type
// ============================================================================

interface ParsedMemory {
  readonly value: number;
  readonly unit: string;
}

// ============================================================================
// Lexer State Machine
// ============================================================================

type LexState =
  | { readonly phase: "digits"; readonly digits: string; readonly hasDecimal: boolean }
  | { readonly phase: "unit"; readonly value: number; readonly unit: string }
  | { readonly phase: "done"; readonly value: number; readonly unit: string }
  | { readonly phase: "error" };

const initialState: LexState = { phase: "digits", digits: "", hasDecimal: false };

/**
 * Step function for memory size lexer.
 * State transitions: digits -> unit -> done
 */
const lexStep = (state: LexState, c: string): LexState => {
  // Terminal states
  if (state.phase === "error" || state.phase === "done") {
    return state;
  }

  if (state.phase === "digits") {
    if (isDigit(c)) {
      return { ...state, digits: state.digits + c };
    }
    if (c === "." && !state.hasDecimal) {
      return { ...state, digits: state.digits + c, hasDecimal: true };
    }
    // Transition to unit phase
    if (state.digits.length === 0) {
      return { phase: "error" };
    }
    const value = Number.parseFloat(state.digits);
    if (Number.isNaN(value)) {
      return { phase: "error" };
    }

    // Handle this char as potential unit
    if (isWhitespace(c)) {
      return { phase: "unit", value, unit: "" };
    }
    if ("kmgtKMGT".includes(c)) {
      return { phase: "unit", value, unit: c.toLowerCase() };
    }
    if (c === "b" || c === "B") {
      return { phase: "done", value, unit: "" };
    }
    return { phase: "error" };
  }

  if (state.phase === "unit") {
    if (isWhitespace(c)) {
      return state; // skip whitespace
    }
    if ("kmgtKMGT".includes(c) && state.unit === "") {
      return { ...state, unit: c.toLowerCase() };
    }
    if ((c === "b" || c === "B") && state.unit !== "") {
      return { phase: "done", value: state.value, unit: state.unit };
    }
    if (c === "b" || c === "B") {
      return { phase: "done", value: state.value, unit: "" };
    }
    return { phase: "error" };
  }

  return { phase: "error" };
};

/**
 * Parse memory size string using lexer.
 */
const parseMemorySizeString = (s: string): Option.Option<ParsedMemory> => {
  const trimmed = s.trim();
  if (trimmed.length === 0) {
    return Option.none();
  }

  const finalState = chars(trimmed).reduce(lexStep, initialState);

  // Extract result based on final state
  if (finalState.phase === "error") {
    return Option.none();
  }
  if (finalState.phase === "digits") {
    // String was all digits
    if (finalState.digits.length === 0) {
      return Option.none();
    }
    const value = Number.parseFloat(finalState.digits);
    return Number.isNaN(value) ? Option.none() : Option.some({ value, unit: "" });
  }
  // "unit" or "done" phase
  return Option.some({ value: finalState.value, unit: finalState.unit });
};

// ============================================================================
// Configuration Types
// ============================================================================

export interface ContainerResourcesConfig {
  /** Shared memory size (e.g., "64m", "1g") */
  readonly shmSize?: string | undefined;
  /** Memory limit (e.g., "512m", "2g") */
  readonly memory?: string | undefined;
  /** Memory + swap limit */
  readonly memorySwap?: string | undefined;
  /** Memory reservation (soft limit) */
  readonly memoryReservation?: string | undefined;
  /** CPU quota (e.g., "50000" for 50% of one CPU) */
  readonly cpuQuota?: number | undefined;
  /** CPU period (default 100000) */
  readonly cpuPeriod?: number | undefined;
  /** CPU shares (relative weight) */
  readonly cpuShares?: number | undefined;
  /** CPUs to use (e.g., "0-2" or "0,1") */
  readonly cpusetCpus?: string | undefined;
  /** PIDs limit */
  readonly pidsLimit?: number | undefined;
  /** Block IO weight (10-1000) */
  readonly blkioWeight?: number | undefined;
}

export const getResourceEntries = (config: ContainerResourcesConfig): Entries =>
  concat(
    fromValue("ShmSize", config.shmSize),
    fromValue("Memory", config.memory),
    fromValue("MemorySwap", config.memorySwap),
    fromValue("MemoryReservation", config.memoryReservation),
    fromValue("CpuQuota", config.cpuQuota),
    fromValue("CpuPeriod", config.cpuPeriod),
    fromValue("CpuShares", config.cpuShares),
    fromValue("CpusetCpus", config.cpusetCpus),
    fromValue("PidsLimit", config.pidsLimit),
    fromValue("BlkioWeight", config.blkioWeight)
  );

// ============================================================================
// Public API
// ============================================================================

/** Multipliers for memory units */
const UNIT_MULTIPLIERS: ReadonlyMap<string, number> = new Map([
  ["", 1],
  ["k", 1024],
  ["m", 1024 ** 2],
  ["g", 1024 ** 3],
  ["t", 1024 ** 4],
]);

/**
 * Parse memory size string to bytes.
 * Uses Option.match for exhaustive pattern matching.
 */
export const parseMemorySize = (size: string): Effect.Effect<number, GeneralError> =>
  pipe(
    parseMemorySizeString(size),
    Option.match({
      onNone: (): Effect.Effect<number, GeneralError> =>
        Effect.fail(
          new GeneralError({
            code: ErrorCode.INVALID_ARGS as 2,
            message: `Invalid memory size: ${size}. Expected format: <number>[k|m|g|t][b] (e.g., "512m", "2g")`,
          })
        ),
      onSome: ({ value, unit }): Effect.Effect<number, GeneralError> =>
        Effect.succeed(Math.floor(value * (UNIT_MULTIPLIERS.get(unit) ?? 1))),
    })
  );

/** Memory size formatting thresholds (descending order) */
const MEMORY_SIZE_THRESHOLDS: readonly { threshold: number; format: (b: number) => string }[] = [
  { threshold: 1024 ** 3, format: (b): string => `${Math.floor(b / 1024 ** 3)}g` },
  { threshold: 1024 ** 2, format: (b): string => `${Math.floor(b / 1024 ** 2)}m` },
  { threshold: 1024, format: (b): string => `${Math.floor(b / 1024)}k` },
];

/**
 * Format bytes as a memory size string.
 */
export const formatMemorySize = (bytes: number): string =>
  pipe(
    MEMORY_SIZE_THRESHOLDS,
    Arr.findFirst((t) => bytes >= t.threshold),
    Option.match({
      onNone: (): string => `${bytes}`,
      onSome: (t): string => t.format(bytes),
    })
  );

/**
 * Common resource profiles.
 */
export const ResourceProfiles: Record<string, ContainerResourcesConfig> = {
  /** Minimal resources for lightweight containers */
  MINIMAL: {
    memory: "128m",
    pidsLimit: 100,
  } as ContainerResourcesConfig,

  /** Standard resources for typical services */
  STANDARD: {
    memory: "512m",
    shmSize: "64m",
    pidsLimit: 500,
  } as ContainerResourcesConfig,

  /** Higher resources for database servers */
  DATABASE: {
    memory: "1g",
    shmSize: "256m",
    pidsLimit: 500,
  } as ContainerResourcesConfig,

  /** Resources for ML/compute workloads */
  COMPUTE: {
    memory: "4g",
    shmSize: "1g",
    pidsLimit: 1000,
  } as ContainerResourcesConfig,
} as const satisfies Record<string, ContainerResourcesConfig>;
