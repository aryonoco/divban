// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Dependency resolution via Kahn's topological sort algorithm.
 * Validates no cycles exist and all dependencies are defined before
 * computing start order. Levels enable parallelism - containers in
 * the same level have no interdependencies and can start together.
 * Stop order is the reverse of start order.
 *
 */

import { Array as Arr, Chunk, Effect, HashMap, HashSet, Match, Option, pipe } from "effect";
import { ErrorCode, GeneralError } from "../lib/errors";
import type { DependencyNode, StackContainer, StartOrder } from "./types";

const getNodeDeps = (node: DependencyNode): readonly string[] => [...node.requires, ...node.wants];

const getContainerDeps = (c: StackContainer): readonly string[] => [
  ...(c.requires ?? []),
  ...(c.wants ?? []),
];

const buildNodeMap = (nodes: DependencyNode[]): ReadonlyMap<string, DependencyNode> =>
  new Map(Arr.map(nodes, (n) => [n.name, n]));

const buildContainerMap = (containers: StackContainer[]): ReadonlyMap<string, StackContainer> =>
  new Map(Arr.map(containers, (c) => [c.name, c]));

const allDepsIn = (deps: readonly string[], placed: HashSet.HashSet<string>): boolean =>
  Arr.every(deps, (dep) => HashSet.has(placed, dep));

export const buildDependencyGraph = (containers: StackContainer[]): DependencyNode[] =>
  Arr.map(containers, (c) => ({
    name: c.name,
    requires: c.requires ?? [],
    wants: c.wants ?? [],
  }));

export const validateDependencies = (
  nodes: DependencyNode[]
): Effect.Effect<void, GeneralError> => {
  const names = HashSet.fromIterable(Arr.map(nodes, (n) => n.name));

  const depPairs = Arr.flatMap(nodes, (node) =>
    Arr.map(getNodeDeps(node), (dep) => ({ nodeName: node.name, dep }))
  );

  return pipe(
    Effect.forEach(depPairs, ({ nodeName, dep }) =>
      Effect.if(HashSet.has(names, dep), {
        onTrue: (): Effect.Effect<void> => Effect.void,
        onFalse: (): Effect.Effect<never, GeneralError> =>
          Effect.fail(
            new GeneralError({
              code: ErrorCode.GENERAL_ERROR,
              message: `Container '${nodeName}' depends on unknown container '${dep}'`,
            })
          ),
      })
    ),
    Effect.asVoid
  );
};

/** Kahn's iteration state: tracks in-degrees to find nodes ready to process */
interface KahnState {
  readonly inDegree: HashMap.HashMap<string, number>;
  readonly adjacency: HashMap.HashMap<string, Chunk.Chunk<string>>;
  readonly queue: Chunk.Chunk<string>;
  readonly sorted: Chunk.Chunk<string>;
}

/**
 * Topological sort using Kahn's algorithm.
 * Returns containers in order of startup (dependencies first).
 *
 * Cycle detection is implicit: if a cycle exists, some nodes never reach
 * in-degree 0 and won't be processed, caught by the final length check.
 */
export const topologicalSort = (nodes: DependencyNode[]): Effect.Effect<string[], GeneralError> =>
  Effect.gen(function* () {
    yield* validateDependencies(nodes);

    const edges = Arr.flatMap(nodes, (node) =>
      Arr.map(getNodeDeps(node), (dep) => ({ from: dep, to: node.name }))
    );

    const grouped = Arr.groupBy(edges, (e) => e.from);

    // Include nodes with no dependents so they still appear in the adjacency map
    const adjacencyEntries = Arr.map(nodes, (n) => {
      const dependents = grouped[n.name];
      return [
        n.name,
        pipe(
          Option.fromNullable(dependents),
          Option.match({
            onNone: (): Chunk.Chunk<string> => Chunk.empty<string>(),
            onSome: (edgeList): Chunk.Chunk<string> =>
              Chunk.fromIterable(Arr.map(edgeList, (e) => e.to)),
          })
        ),
      ] as const;
    });
    const adjacency = HashMap.fromIterable(adjacencyEntries);

    // In-degree equals dependency count because each dependency creates one incoming edge
    const inDegree = HashMap.fromIterable(
      Arr.map(nodes, (n) => [n.name, Arr.length(getNodeDeps(n))] as const)
    );

    // Nodes with no dependencies (in-degree = 0) start in queue
    const initialQueue = Chunk.fromIterable(
      Arr.filterMap(nodes, (n) =>
        pipe(
          Match.value(Arr.length(getNodeDeps(n))),
          Match.when(0, () => Option.some(n.name)),
          Match.orElse(() => Option.none())
        )
      )
    );

    const finalState = yield* Effect.iterate(
      {
        inDegree,
        adjacency,
        queue: initialQueue,
        sorted: Chunk.empty<string>(),
      } as KahnState,
      {
        while: (s): boolean => Chunk.isNonEmpty(s.queue),
        body: (s): Effect.Effect<KahnState> => {
          const current = Chunk.unsafeHead(s.queue);
          const rest = Chunk.drop(s.queue, 1);
          const dependents = Option.getOrElse(HashMap.get(s.adjacency, current), () =>
            Chunk.empty<string>()
          );

          // Process dependents - HashMap.set here is unavoidable (stateful iteration)
          // But Chunk operations are O(1) amortized
          const { newDegree, ready } = Chunk.reduce(
            dependents,
            { newDegree: s.inDegree, ready: Chunk.empty<string>() },
            (acc, dep) => {
              const oldDeg = Option.getOrElse(HashMap.get(acc.newDegree, dep), () => 0);
              const deg = oldDeg - 1;
              return {
                newDegree: HashMap.set(acc.newDegree, dep, deg),
                ready: pipe(
                  Match.value(deg),
                  Match.when(0, () => Chunk.append(acc.ready, dep)),
                  Match.orElse(() => acc.ready)
                ),
              };
            }
          );

          return Effect.succeed({
            adjacency: s.adjacency,
            inDegree: newDegree,
            queue: Chunk.appendAll(rest, ready),
            sorted: Chunk.append(s.sorted, current),
          });
        },
      }
    );

    // Implicit cycle detection: if not all nodes processed, a cycle exists
    yield* Effect.filterOrFail(
      Effect.succeed(finalState),
      (s): s is KahnState => Chunk.size(s.sorted) === nodes.length,
      () =>
        new GeneralError({
          code: ErrorCode.GENERAL_ERROR,
          message: "Circular dependency detected in container graph",
        })
    );

    return Chunk.toReadonlyArray(finalState.sorted) as string[];
  });

/** Accumulates dependency levels for parallel start/stop grouping */
interface LevelState {
  readonly placed: HashSet.HashSet<string>;
  readonly levels: Chunk.Chunk<Chunk.Chunk<string>>;
  readonly remaining: Chunk.Chunk<string>;
}

/**
 * Resolve start order with parallelization levels.
 * Containers in the same level can start in parallel.
 */
export const resolveStartOrder = (
  containers: StackContainer[]
): Effect.Effect<StartOrder, GeneralError> =>
  Effect.gen(function* () {
    const nodes = buildDependencyGraph(containers);
    const sorted = yield* topologicalSort(nodes);
    const nodeMap = buildNodeMap(nodes);

    const finalState = yield* Effect.iterate(
      {
        placed: HashSet.empty<string>(),
        levels: Chunk.empty<Chunk.Chunk<string>>(),
        remaining: Chunk.fromIterable(sorted),
      } as LevelState,
      {
        while: (s): boolean => Chunk.isNonEmpty(s.remaining),
        body: (s): Effect.Effect<LevelState> => {
          const remainingArr = Chunk.toReadonlyArray(s.remaining);
          // Partition: ready (all deps placed) vs not ready
          const ready = Arr.filter(remainingArr, (name) =>
            pipe(
              Option.fromNullable(nodeMap.get(name)),
              Option.match({
                onNone: (): boolean => false,
                onSome: (node): boolean => allDepsIn(getNodeDeps(node), s.placed),
              })
            )
          );

          return Effect.if(Arr.isEmptyArray(ready), {
            onTrue: (): Effect.Effect<LevelState> =>
              Effect.succeed({ ...s, remaining: Chunk.empty() }),
            onFalse: (): Effect.Effect<LevelState> => {
              const readySet = HashSet.fromIterable(ready);
              const notReady = Arr.filter(remainingArr, (name) => !HashSet.has(readySet, name));
              return Effect.succeed({
                placed: HashSet.union(s.placed, readySet),
                levels: Chunk.append(s.levels, Chunk.fromIterable(ready)),
                remaining: Chunk.fromIterable(notReady),
              });
            },
          });
        },
      }
    );

    return {
      order: sorted,
      levels: Arr.map(
        Chunk.toReadonlyArray(finalState.levels),
        (l) => Chunk.toReadonlyArray(l) as string[]
      ),
    };
  });

export const resolveStopOrder = (
  containers: StackContainer[]
): Effect.Effect<StartOrder, GeneralError> =>
  Effect.map(resolveStartOrder(containers), (start) => ({
    order: Arr.reverse(start.order) as string[],
    levels: Arr.reverse(start.levels) as string[][],
  }));

export const getDependents = (containerName: string, containers: StackContainer[]): string[] =>
  pipe(
    Arr.filter(
      containers,
      (c) =>
        Arr.contains(c.requires ?? [], containerName) || Arr.contains(c.wants ?? [], containerName)
    ),
    Arr.map((c) => c.name)
  );

export const getAllDependencies = (
  containerName: string,
  containers: StackContainer[]
): string[] => {
  const containerMap = buildContainerMap(containers);

  // Tail-recursive BFS with immutable state using HashSet and Chunk
  const bfs = (
    queue: Chunk.Chunk<string>,
    visited: HashSet.HashSet<string>
  ): HashSet.HashSet<string> =>
    pipe(
      Match.value(Chunk.isEmpty(queue)),
      Match.when(true, () => visited),
      Match.when(false, () =>
        pipe(
          Chunk.head(queue),
          Option.match({
            onNone: (): HashSet.HashSet<string> => visited,
            onSome: (current): HashSet.HashSet<string> => {
              const rest = Chunk.drop(queue, 1);
              return pipe(
                Option.fromNullable(containerMap.get(current)),
                Option.match({
                  onNone: (): HashSet.HashSet<string> => bfs(rest, visited),
                  onSome: (container): HashSet.HashSet<string> => {
                    const deps = getContainerDeps(container);
                    const unvisited = Arr.filter(deps, (d) => !HashSet.has(visited, d));
                    const unvisitedChunk = Chunk.fromIterable(unvisited);
                    const newVisited = HashSet.union(visited, HashSet.fromIterable(unvisited));
                    return bfs(Chunk.appendAll(rest, unvisitedChunk), newVisited);
                  },
                })
              );
            },
          })
        )
      ),
      Match.exhaustive
    );

  return pipe(
    Option.fromNullable(containerMap.get(containerName)),
    Option.match({
      onNone: (): string[] => [],
      onSome: (start): string[] => {
        const initialDeps = getContainerDeps(start);
        const result = bfs(Chunk.fromIterable(initialDeps), HashSet.fromIterable(initialDeps));
        return Array.from(HashSet.values(result));
      },
    })
  );
};
