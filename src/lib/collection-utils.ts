// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Functional collection operations with noUncheckedIndexedAccess support.
 * Array indexing returns `T | undefined` in strict mode; these functions
 * use Option instead. ReadonlyMap/ReadonlyArray operations are persistent
 * (always return new collections) per the immutable data coding standard.
 */

import { Array as Arr, Chunk, Effect, Option, Stream, pipe } from "effect";

export const identity = <A>(a: A): A => a;

/**
 * @param onError - Transforms unknown errors from the async iterator into typed errors
 */
export const collectAsync = <A, E>(
  iterable: AsyncIterable<A>,
  onError: (e: unknown) => E
): Effect.Effect<Chunk.Chunk<A>, E> =>
  pipe(Stream.fromAsyncIterable(iterable, onError), Stream.runCollect);

export const collectAsyncToArray = <A, E>(
  iterable: AsyncIterable<A>,
  onError: (e: unknown) => E
): Effect.Effect<readonly A[], E> =>
  pipe(collectAsync(iterable, onError), Effect.map(Chunk.toReadonlyArray));

/** For iterables where errors indicate bugs (e.g., Glob.scan internals). */
export const collectAsyncOrDie = <A>(iterable: AsyncIterable<A>): Effect.Effect<readonly A[]> =>
  pipe(
    Stream.fromAsyncIterable(iterable, (e) => e),
    Stream.runCollect,
    Effect.map(Chunk.toReadonlyArray),
    Effect.catchAll((e) => Effect.die(e))
  );

export const emptyMap = <K, V>(): ReadonlyMap<K, V> => new Map();

/** Right-biased: values from `right` overwrite `left` on key collision. */
export const mergeMaps = <K, V>(
  left: ReadonlyMap<K, V>,
  right: ReadonlyMap<K, V>
): ReadonlyMap<K, V> => new Map([...left, ...right]);

export const concatMaps = <K, V>(maps: readonly ReadonlyMap<K, V>[]): ReadonlyMap<K, V> =>
  maps.reduce<ReadonlyMap<K, V>>(mergeMaps, emptyMap());

export const mapFromEntries = <K, V>(entries: readonly (readonly [K, V])[]): ReadonlyMap<K, V> =>
  new Map(entries);

export const mapFromIterable = <K, V>(entries: Iterable<readonly [K, V]>): ReadonlyMap<K, V> =>
  new Map(entries);

export const mapInsert =
  <K, V>(key: K, value: V) =>
  (map: ReadonlyMap<K, V>): ReadonlyMap<K, V> =>
    new Map([...map, [key, value]]);

export const mapLookup =
  <K, V>(key: K) =>
  (map: ReadonlyMap<K, V>): Option.Option<V> =>
    Option.fromNullable(map.get(key));

/** Wrapper for noUncheckedIndexedAccess: arr[0] returns T | undefined in strict mode. */
export const head = <A>(arr: readonly A[]): Option.Option<A> => Arr.head(arr);

export const last = <A>(arr: readonly A[]): Option.Option<A> => Arr.last(arr);

export const at =
  <A>(index: number) =>
  (arr: readonly A[]): Option.Option<A> =>
    Option.fromNullable(arr[index]);

export const flatten = <A>(arr: readonly (readonly A[])[]): readonly A[] => arr.flat();

export const nub = <A>(arr: readonly A[]): readonly A[] => [...new Set(arr)];

export const concatUnique = <A>(...arrays: readonly (readonly A[])[]): readonly A[] =>
  nub(flatten(arrays));

/**
 * Workaround for Object.entries losing key type information in TypeScript.
 * TypeScript's Object.entries() returns [string, V][], losing the key type K.
 * This cast restores the key type that TypeScript erases. Safe because
 * the keys are exactly type K by construction.
 */
export const entries = <K extends string, V>(
  record: Readonly<Record<K, V>>
): readonly (readonly [K, V])[] =>
  Object.entries(record) as unknown as readonly (readonly [K, V])[];

export const mapEntries = <K extends string, V, B>(
  record: Readonly<Record<K, V>>,
  f: (key: K, value: V) => B
): readonly B[] => entries(record).map(([k, v]) => f(k, v));

export const flatMapEntries = <K extends string, V, B>(
  record: Readonly<Record<K, V>>,
  f: (key: K, value: V) => readonly B[]
): readonly B[] => entries(record).flatMap(([k, v]) => f(k, v));

export const mergeRecords = <A extends Record<string, unknown>>(left: A, right: Partial<A>): A => ({
  ...left,
  ...right,
});

export const foldRecords = <A extends Record<string, unknown>>(
  empty: A,
  records: readonly Partial<A>[]
): A => records.reduce<A>((acc, r) => mergeRecords(acc, r), empty);
