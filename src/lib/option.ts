// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Option type for explicit nullable value handling.
 * Rust-inspired discriminated union with isSome boolean discriminator.
 */

import type { Result } from "./result";

// ============================================================================
// Core Type Definition
// ============================================================================

export type Option<T> = { readonly isSome: true; readonly value: T } | { readonly isSome: false };

// ============================================================================
// Constructors
// ============================================================================

export const Some = <T>(value: T): Option<T> => ({ isSome: true, value });
export const None: Option<never> = { isSome: false };

// ============================================================================
// Type Guards
// ============================================================================

export const isSome = <T>(opt: Option<T>): opt is { readonly isSome: true; readonly value: T } =>
  opt.isSome;
export const isNone = <T>(opt: Option<T>): opt is { readonly isSome: false } => !opt.isSome;

// ============================================================================
// Core Transformations
// ============================================================================

export const mapOption = <T, U>(opt: Option<T>, fn: (value: T) => U): Option<U> =>
  opt.isSome ? Some(fn(opt.value)) : None;

export const flatMapOption = <T, U>(opt: Option<T>, fn: (value: T) => Option<U>): Option<U> =>
  opt.isSome ? fn(opt.value) : None;

export const filter = <T>(opt: Option<T>, predicate: (value: T) => boolean): Option<T> =>
  opt.isSome && predicate(opt.value) ? opt : None;

// ============================================================================
// Value Extraction
// ============================================================================

export const getOrElse = <T>(opt: Option<T>, defaultValue: T): T =>
  opt.isSome ? opt.value : defaultValue;

export const getOrElseLazy = <T>(opt: Option<T>, fn: () => T): T => (opt.isSome ? opt.value : fn());

export const unwrap = <T>(opt: Option<T>): T => {
  if (opt.isSome) {
    return opt.value;
  }
  throw new Error("Called unwrap() on None");
};

export const expect = <T>(opt: Option<T>, msg: string): T => {
  if (opt.isSome) {
    return opt.value;
  }
  throw new Error(msg);
};

// ============================================================================
// Result Conversion
// ============================================================================

export const okOr = <T, E>(opt: Option<T>, error: E): Result<T, E> =>
  opt.isSome ? { ok: true, value: opt.value } : { ok: false, error };

export const okOrElse = <T, E>(opt: Option<T>, errorFn: () => E): Result<T, E> =>
  opt.isSome ? { ok: true, value: opt.value } : { ok: false, error: errorFn() };

export const transpose = <T, E>(opt: Option<Result<T, E>>): Result<Option<T>, E> => {
  if (isNone(opt)) {
    return { ok: true, value: None };
  }
  return opt.value.ok ? { ok: true, value: Some(opt.value.value) } : opt.value;
};

// ============================================================================
// Map With Default
// ============================================================================

export const mapOr = <T, U>(opt: Option<T>, defaultValue: U, fn: (value: T) => U): U =>
  opt.isSome ? fn(opt.value) : defaultValue;

export const mapOrElse = <T, U>(opt: Option<T>, defaultFn: () => U, fn: (value: T) => U): U =>
  opt.isSome ? fn(opt.value) : defaultFn();

// ============================================================================
// Boolean Combinators
// ============================================================================

export const and = <T, U>(opt: Option<T>, other: Option<U>): Option<U> =>
  opt.isSome ? other : None;

export const or = <T>(opt: Option<T>, other: Option<T>): Option<T> => (opt.isSome ? opt : other);

export const xor = <T>(opt: Option<T>, other: Option<T>): Option<T> => {
  if (isSome(opt) && isNone(other)) {
    return opt;
  }
  if (isNone(opt) && isSome(other)) {
    return other;
  }
  return None;
};

// ============================================================================
// Combining & Nesting
// ============================================================================

export const zip = <T, U>(a: Option<T>, b: Option<U>): Option<[T, U]> =>
  a.isSome && b.isSome ? Some([a.value, b.value]) : None;

export const zipWith = <T, U, R>(a: Option<T>, b: Option<U>, fn: (t: T, u: U) => R): Option<R> =>
  a.isSome && b.isSome ? Some(fn(a.value, b.value)) : None;

export const flatten = <T>(opt: Option<Option<T>>): Option<T> => (opt.isSome ? opt.value : None);

// ============================================================================
// Utilities
// ============================================================================

export const contains = <T>(opt: Option<T>, value: T): boolean => opt.isSome && opt.value === value;

export const toArray = <T>(opt: Option<T>): T[] => (opt.isSome ? [opt.value] : []);

// ============================================================================
// Construction from Nullable
// ============================================================================

export const fromUndefined = <T>(value: T | undefined): Option<T> =>
  value === undefined ? None : Some(value);

export const fromNullable = <T>(value: T | null | undefined): Option<T> =>
  value == null ? None : Some(value);
