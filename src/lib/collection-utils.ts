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

// ============================================================================
// Identity Function
// ============================================================================

/** The identity function. Use instead of `(x) => x`. */
export const identity = <A>(a: A): A => a;

// ============================================================================
// Async Iterable → Effect Collection (using Effect Stream)
// ============================================================================

/**
 * Collect async iterable to Chunk using Stream.
 */
export const collectAsync = <A, E>(
  iterable: AsyncIterable<A>,
  onError: (e: unknown) => E
): Effect.Effect<Chunk.Chunk<A>, E> =>
  pipe(Stream.fromAsyncIterable(iterable, onError), Stream.runCollect);

/**
 * Collect async iterable to ReadonlyArray.
 */
export const collectAsyncToArray = <A, E>(
  iterable: AsyncIterable<A>,
  onError: (e: unknown) => E
): Effect.Effect<readonly A[], E> =>
  pipe(collectAsync(iterable, onError), Effect.map(Chunk.toReadonlyArray));

/**
 * Collect async iterable where errors are unexpected (e.g., Glob.scan).
 */
export const collectAsyncOrDie = <A>(iterable: AsyncIterable<A>): Effect.Effect<readonly A[]> =>
  pipe(
    Stream.fromAsyncIterable(iterable, (e) => e),
    Stream.runCollect,
    Effect.map(Chunk.toReadonlyArray),
    Effect.catchAll((e) => Effect.die(e))
  );

// ============================================================================
// ReadonlyMap Operations (Persistent)
// ============================================================================

/** Empty ReadonlyMap. */
export const emptyMap = <K, V>(): ReadonlyMap<K, V> => new Map();

/**
 * Merge two ReadonlyMaps. Right-biased (later values win).
 */
export const mergeMaps = <K, V>(
  left: ReadonlyMap<K, V>,
  right: ReadonlyMap<K, V>
): ReadonlyMap<K, V> => new Map([...left, ...right]);

/**
 * Concatenate many maps into one. Right-biased.
 */
export const concatMaps = <K, V>(maps: readonly ReadonlyMap<K, V>[]): ReadonlyMap<K, V> =>
  maps.reduce<ReadonlyMap<K, V>>(mergeMaps, emptyMap());

/**
 * Create ReadonlyMap from entries (tuple array).
 */
export const mapFromEntries = <K, V>(entries: readonly (readonly [K, V])[]): ReadonlyMap<K, V> =>
  new Map(entries);

/**
 * Create ReadonlyMap from iterable of entries.
 */
export const mapFromIterable = <K, V>(entries: Iterable<readonly [K, V]>): ReadonlyMap<K, V> =>
  new Map(entries);

/**
 * Insert a key-value pair, returning a new map.
 */
export const mapInsert =
  <K, V>(key: K, value: V) =>
  (map: ReadonlyMap<K, V>): ReadonlyMap<K, V> =>
    new Map([...map, [key, value]]);

/**
 * Lookup a key in a map, returning Option.
 */
export const mapLookup =
  <K, V>(key: K) =>
  (map: ReadonlyMap<K, V>): Option.Option<V> =>
    Option.fromNullable(map.get(key));

// ============================================================================
// ReadonlyArray Operations (Total Functions)
// ============================================================================

/**
 * Safe head - returns Option instead of throwing.
 * Handles `noUncheckedIndexedAccess`.
 */
export const head = <A>(arr: readonly A[]): Option.Option<A> => Arr.head(arr);

/**
 * Safe last - returns Option.
 */
export const last = <A>(arr: readonly A[]): Option.Option<A> => Arr.last(arr);

/**
 * Safe indexing - returns Option.
 * Use instead of arr[i] which returns A | undefined.
 */
export const at =
  <A>(index: number) =>
  (arr: readonly A[]): Option.Option<A> =>
    Option.fromNullable(arr[index]);

/**
 * Flatten nested arrays into a single array.
 */
export const flatten = <A>(arr: readonly (readonly A[])[]): readonly A[] => arr.flat();

/**
 * Deduplicate array preserving order.
 */
export const nub = <A>(arr: readonly A[]): readonly A[] => [...new Set(arr)];

/**
 * Concatenate and deduplicate multiple arrays.
 */
export const concatUnique = <A>(...arrays: readonly (readonly A[])[]): readonly A[] =>
  nub(flatten(arrays));

// ============================================================================
// Record Operations
// ============================================================================

/**
 * Get entries of a record with proper typing.
 * Returns readonly array of readonly tuples.
 * Note: Object.entries loses key type info, so we use unknown as intermediate.
 */
export const entries = <K extends string, V>(
  record: Readonly<Record<K, V>>
): readonly (readonly [K, V])[] =>
  Object.entries(record) as unknown as readonly (readonly [K, V])[];

/**
 * Map over record entries with a function.
 */
export const mapEntries = <K extends string, V, B>(
  record: Readonly<Record<K, V>>,
  f: (key: K, value: V) => B
): readonly B[] => entries(record).map(([k, v]) => f(k, v));

/**
 * FlatMap over record entries.
 */
export const flatMapEntries = <K extends string, V, B>(
  record: Readonly<Record<K, V>>,
  f: (key: K, value: V) => readonly B[]
): readonly B[] => entries(record).flatMap(([k, v]) => f(k, v));

// ============================================================================
// Merge Helpers
// ============================================================================

/**
 * Merge records using spread. Right-biased (later values win).
 */
export const mergeRecords = <A extends Record<string, unknown>>(left: A, right: Partial<A>): A => ({
  ...left,
  ...right,
});

/**
 * Merge multiple partial records into one.
 */
export const foldRecords = <A extends Record<string, unknown>>(
  empty: A,
  records: readonly Partial<A>[]
): A => records.reduce<A>((acc, r) => mergeRecords(acc, r), empty);
