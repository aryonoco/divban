// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Branded types and smart constructors for semver versions.
 * Following Haskell-style "parse, don't validate" pattern.
 */

import { type Brand, Option, Order, pipe } from "effect";
import { isDigit } from "../char";
import { all } from "../str";

// ─────────────────────────────────────────────────────────────────────────────
// Core Data Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parsed semver components. This is the canonical representation for operations.
 * The string form is derived from this, not the other way around.
 */
export interface SemVerComponents {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Branded Types (Opaque outside this module)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Base semver branded type: validated "X.Y.Z" string.
 *
 * INVARIANT: Any value of type SemVer was constructed via a smart constructor
 * that validated the format. Parsing a SemVer ALWAYS succeeds.
 */
export type SemVer = string & Brand.Brand<"SemVer">;

/**
 * Schema version for divban backup metadata format.
 * Bump semantics:
 * - Major: Breaking changes (old divban cannot read new backups)
 * - Minor: Additive changes (new optional fields, backward compatible)
 * - Patch: Bug fixes in metadata generation (no structural change)
 */
export type DivbanBackUpSchemaVersion = SemVer & Brand.Brand<"DivbanBackUpSchemaVersion">;

/**
 * Version of the divban tool that created the backup.
 * Read from package.json at build time.
 */
export type DivbanProducerVersion = SemVer & Brand.Brand<"DivbanProducerVersion">;

/**
 * Schema version for divban TOML configuration files.
 * Bump semantics same as DivbanBackUpSchemaVersion.
 */
export type DivbanConfigSchemaVersion = SemVer & Brand.Brand<"DivbanConfigSchemaVersion">;

// ─────────────────────────────────────────────────────────────────────────────
// Parsing Primitives (Internal)
// ─────────────────────────────────────────────────────────────────────────────

const isAllDigits: (s: string) => boolean = all(isDigit);

/** Parse non-negative integer from string. Empty string -> None. */
const parseNonNegativeInt = (s: string): Option.Option<number> =>
  pipe(
    s,
    Option.liftPredicate((str): str is string => str.length > 0 && isAllDigits(str)),
    Option.map((str) => Number.parseInt(str, 10)),
    Option.filter((n) => Number.isFinite(n) && n >= 0)
  );

/**
 * Split string into exactly 3 parts by delimiter.
 * Uses type guard for noUncheckedIndexedAccess compatibility.
 */
const splitExact3 = (s: string, delim: string): Option.Option<readonly [string, string, string]> =>
  pipe(
    s.split(delim),
    Option.liftPredicate(
      (parts): parts is [string, string, string] =>
        parts.length === 3 &&
        parts[0] !== undefined &&
        parts[1] !== undefined &&
        parts[2] !== undefined
    )
  );

// ─────────────────────────────────────────────────────────────────────────────
// Parsing (Boundary: string -> Option<SemVerComponents>)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse "X.Y.Z" into components. Returns None if invalid.
 * This is the ONLY place where semver validation logic lives.
 */
export const parseSemVer = (s: string): Option.Option<SemVerComponents> =>
  pipe(
    splitExact3(s, "."),
    Option.flatMap(([majorStr, minorStr, patchStr]) =>
      pipe(
        Option.all({
          major: parseNonNegativeInt(majorStr),
          minor: parseNonNegativeInt(minorStr),
          patch: parseNonNegativeInt(patchStr),
        })
      )
    )
  );

/** Format components back to canonical string form. */
export const formatSemVer = (c: SemVerComponents): string =>
  `${c.major.toString()}.${c.minor.toString()}.${c.patch.toString()}`;

// ─────────────────────────────────────────────────────────────────────────────
// Smart Constructors (The ONLY way to create branded values)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Construct SemVer from untrusted string. Returns Option.
 *
 * This is the boundary between the unvalidated world (string) and
 * the validated world (SemVer). All other functions can rely on
 * the invariant that SemVer is well-formed.
 */
export const semVer = (s: string): Option.Option<SemVer> =>
  pipe(
    parseSemVer(s),
    Option.map((): SemVer => s as SemVer)
  );

/** Construct DivbanBackUpSchemaVersion from untrusted string. */
export const divbanBackUpSchemaVersion = (s: string): Option.Option<DivbanBackUpSchemaVersion> =>
  pipe(
    semVer(s),
    Option.map((v): DivbanBackUpSchemaVersion => v as DivbanBackUpSchemaVersion)
  );

/** Construct DivbanProducerVersion from untrusted string. */
export const divbanProducerVersion = (s: string): Option.Option<DivbanProducerVersion> =>
  pipe(
    semVer(s),
    Option.map((v): DivbanProducerVersion => v as DivbanProducerVersion)
  );

/** Construct DivbanConfigSchemaVersion from untrusted string. */
export const divbanConfigSchemaVersion = (s: string): Option.Option<DivbanConfigSchemaVersion> =>
  pipe(
    semVer(s),
    Option.map((v): DivbanConfigSchemaVersion => v as DivbanConfigSchemaVersion)
  );

// ─────────────────────────────────────────────────────────────────────────────
// Literal Constructors (Compile-time validated)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Template literal type ensuring format `${number}.${number}.${number}`.
 * TypeScript verifies at compile time that literals match this pattern.
 *
 * SAFETY: This is NOT an escape hatch. TypeScript's template literal types
 * guarantee that only strings matching the pattern can be passed.
 * Variables cannot be used - only string literals.
 */
type SemVerLiteral = `${number}.${number}.${number}`;

/**
 * Construct DivbanBackUpSchemaVersion from a string literal.
 *
 * USAGE: schemaVersion("1.0.0") - literal only, no variables
 *
 * The template literal type provides compile-time validation.
 * This is analogous to Haskell's compile-time literal promotion.
 */
export const schemaVersion = <const S extends SemVerLiteral>(
  literal: S
): DivbanBackUpSchemaVersion =>
  pipe(
    divbanBackUpSchemaVersion(literal),
    Option.getOrThrow // Safe: template literal type guarantees valid format
  );

/**
 * Construct DivbanProducerVersion from a string literal.
 *
 * USAGE: producerVersion("0.5.1") - literal only, no variables
 */
export const producerVersion = <const S extends SemVerLiteral>(literal: S): DivbanProducerVersion =>
  pipe(
    divbanProducerVersion(literal),
    Option.getOrThrow // Safe: template literal type guarantees valid format
  );

/**
 * Construct DivbanConfigSchemaVersion from a string literal.
 *
 * USAGE: configSchemaVersion("1.0.0") - literal only, no variables
 */
export const configSchemaVersion = <const S extends SemVerLiteral>(
  literal: S
): DivbanConfigSchemaVersion =>
  pipe(
    divbanConfigSchemaVersion(literal),
    Option.getOrThrow // Safe: template literal type guarantees valid format
  );

// ─────────────────────────────────────────────────────────────────────────────
// Pure Operations on Components (Total functions - no Option needed)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compare two semver components.
 * Returns: -1 if a < b, 0 if a === b, 1 if a > b
 *
 * This is a TOTAL function - no Option wrapper because inputs are
 * already validated SemVerComponents.
 */
export const compareSemVerComponents = (a: SemVerComponents, b: SemVerComponents): -1 | 0 | 1 => {
  const majorCmp = Order.number(a.major, b.major);
  return majorCmp !== 0
    ? majorCmp
    : pipe(Order.number(a.minor, b.minor), (minorCmp): -1 | 0 | 1 =>
        minorCmp !== 0 ? minorCmp : Order.number(a.patch, b.patch)
      );
};

/**
 * Check semver compatibility per standard semantics:
 * - Same major version (breaking changes boundary)
 * - Current minor >= required minor (feature additions)
 * - If minor equal, current patch >= required patch
 */
export const isComponentsCompatible = (
  current: SemVerComponents,
  required: SemVerComponents
): boolean =>
  current.major === required.major &&
  (current.minor > required.minor ||
    (current.minor === required.minor && current.patch >= required.patch));

// ─────────────────────────────────────────────────────────────────────────────
// Operations on Branded Types (Parse once, operate on components)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a branded SemVer to components.
 *
 * INVARIANT: This NEVER returns None for valid branded types.
 * We use Option.getOrThrow to express this - if it throws, we have a bug
 * in our smart constructors, not user error.
 */
export const toComponents = (v: SemVer): SemVerComponents =>
  pipe(
    parseSemVer(v),
    Option.getOrThrow // Invariant: branded SemVer is always valid
  );

/** Compare two branded SemVer values. */
export const compareSemVer = (a: SemVer, b: SemVer): -1 | 0 | 1 =>
  compareSemVerComponents(toComponents(a), toComponents(b));

/** Check compatibility between two branded SemVer values. */
export const isCompatible = (current: SemVer, required: SemVer): boolean =>
  isComponentsCompatible(toComponents(current), toComponents(required));
