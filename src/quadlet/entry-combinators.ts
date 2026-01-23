// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Composable entry builders for quadlet configuration. These combinators
 * lift values into Entries while handling Option semantics - undefined
 * values produce empty arrays rather than errors. This enables declarative
 * config construction via concat(fromValue(...), fromArray(...), ...).
 */

import { Array as Arr, Match, Option, pipe } from "effect";
import type { Entries, Entry } from "./entry";
import { empty } from "./entry";

const optionToEntries = (opt: Option.Option<Entries>): Entries =>
  Option.getOrElse(opt, (): Entries => empty);

const formatPrimitive = (value: string | number | boolean): string =>
  Match.value(value).pipe(
    Match.when(Match.boolean, (b) => (b ? "true" : "false")),
    Match.when(Match.number, (n) => String(n)),
    Match.orElse((s) => s)
  );

/** Base function that fromValue uses internally for custom formatting. */
export const fromMaybe = <A>(key: string, value: A | undefined, f: (a: A) => string): Entries =>
  pipe(
    Option.fromNullable(value),
    Option.map((v): Entries => [{ key, value: f(v) }]),
    optionToEntries
  );

export const fromValue = (key: string, value: string | number | boolean | undefined): Entries =>
  fromMaybe(key, value, formatPrimitive);

export const fromArray = (key: string, values: readonly string[] | undefined): Entries =>
  pipe(
    Option.fromNullable(values),
    Option.map(Arr.map((value): Entry => ({ key, value }))),
    optionToEntries
  );

export const fromArrayWith = <A>(
  key: string,
  items: readonly A[] | undefined,
  f: (item: A) => string
): Entries =>
  pipe(
    Option.fromNullable(items),
    Option.map(Arr.map((item): Entry => ({ key, value: f(item) }))),
    optionToEntries
  );

/** Default formatter: "key=value" */
export const fromRecord = <V extends string | number | boolean>(
  key: string,
  record: Record<string, V> | undefined,
  f: (k: string, v: V) => string = (k, v) => `${k}=${v}`
): Entries =>
  pipe(
    Option.fromNullable(record),
    Option.map((r) =>
      pipe(
        Object.entries(r) as [string, V][],
        Arr.map(([k, v]): Entry => ({ key, value: f(k, v) }))
      )
    ),
    optionToEntries
  );

export const concat = (...arrays: readonly Entries[]): Entries => Arr.flatten(arrays);

export const when = (predicate: boolean, key: string, value: string): Entries =>
  predicate ? [{ key, value }] : empty;
