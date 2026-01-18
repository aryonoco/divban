// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Option type for explicit nullable value handling.
 * Inspired by Rust's Option<T> and OCaml's 'a option.
 */

import type { Result } from "./result";

export type Option<T> = T | null;

export const Some = <T>(value: T): Option<T> => value;
export const None: Option<never> = null;

export const isSome = <T>(opt: Option<T>): opt is T => opt !== null;
export const isNone = <T>(opt: Option<T>): opt is null => opt === null;

export const mapOption = <T, U>(opt: Option<T>, fn: (value: T) => U): Option<U> =>
  opt !== null ? fn(opt) : null;

export const flatMapOption = <T, U>(opt: Option<T>, fn: (value: T) => Option<U>): Option<U> =>
  opt !== null ? fn(opt) : null;

export const getOrElse = <T>(opt: Option<T>, defaultValue: T): T =>
  opt !== null ? opt : defaultValue;

export const getOrElseLazy = <T>(opt: Option<T>, fn: () => T): T => (opt !== null ? opt : fn());

export const okOr = <T, E>(opt: Option<T>, error: E): Result<T, E> =>
  opt !== null ? { ok: true, value: opt } : { ok: false, error };

export const filter = <T>(opt: Option<T>, predicate: (value: T) => boolean): Option<T> =>
  opt !== null && predicate(opt) ? opt : null;

export const zip = <T, U>(a: Option<T>, b: Option<U>): Option<[T, U]> =>
  a !== null && b !== null ? [a, b] : null;

export const fromUndefined = <T>(value: T | undefined): Option<T> =>
  value === undefined ? null : value;

export const fromNullable = <T>(value: T | null | undefined): Option<T> =>
  value == null ? null : value;
