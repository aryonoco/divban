// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Effect-based dependency resolution for multi-container stacks.
 * Uses topological sort to determine correct start/stop order.
 */

import { Effect, Option, pipe } from "effect";
import { ErrorCode, GeneralError } from "../lib/errors";
import type { DependencyNode, StackContainer, StartOrder } from "./types";

// ============================================================================
// Pure Graph Helper Functions
// ============================================================================

/** Get all dependencies (requires + wants) for a node */
const getNodeDeps = (node: DependencyNode): readonly string[] => [...node.requires, ...node.wants];

/** Get all dependencies for a container */
const getContainerDeps = (c: StackContainer): readonly string[] => [
  ...(c.requires ?? []),
  ...(c.wants ?? []),
];

/** Build a name->node lookup map  */
const buildNodeMap = (nodes: DependencyNode[]): ReadonlyMap<string, DependencyNode> =>
  new Map(nodes.map((n) => [n.name, n]));

/** Build a name->container lookup map */
const buildContainerMap = (containers: StackContainer[]): ReadonlyMap<string, StackContainer> =>
  new Map(containers.map((c) => [c.name, c]));

/** Check if all dependencies are in a given set */
const allDepsIn = (deps: readonly string[], placed: ReadonlySet<string>): boolean =>
  deps.every((dep) => placed.has(dep));

// ============================================================================
// Graph Construction
// ============================================================================

/**
 * Build dependency graph from container definitions.
 */
export const buildDependencyGraph = (containers: StackContainer[]): DependencyNode[] =>
  containers.map((c) => ({
    name: c.name,
    requires: c.requires ?? [],
    wants: c.wants ?? [],
  }));

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate that all dependencies exist in the stack.
 */
export const validateDependencies = (
  nodes: DependencyNode[]
): Effect.Effect<void, GeneralError> => {
  const names = new Set(nodes.map((n) => n.name));

  const depPairs = nodes.flatMap((node) =>
    getNodeDeps(node).map((dep) => ({ nodeName: node.name, dep }))
  );

  return pipe(
    Effect.forEach(depPairs, ({ nodeName, dep }) =>
      names.has(dep)
        ? Effect.void
        : Effect.fail(
            new GeneralError({
              code: ErrorCode.GENERAL_ERROR as 1,
              message: `Container '${nodeName}' depends on unknown container '${dep}'`,
            })
          )
    ),
    Effect.asVoid
  );
};

/**
 * Detect cycles in the dependency graph.
 */
export const detectCycles = (nodes: DependencyNode[]): Effect.Effect<void, GeneralError> => {
  const nodeMap = buildNodeMap(nodes);

  const findCycle = (
    name: string,
    path: readonly string[],
    visited: ReadonlySet<string>,
    inStack: ReadonlySet<string>
  ): Option.Option<readonly string[]> => {
    if (inStack.has(name)) {
      return Option.some([...path, name]);
    }
    if (visited.has(name)) {
      return Option.none();
    }

    return pipe(
      Option.fromNullable(nodeMap.get(name)),
      Option.flatMap((node) => {
        const newPath = [...path, name];
        const newVisited = new Set([...visited, name]);
        const newStack = new Set([...inStack, name]);

        // Find first cycle in dependencies (short-circuit with reduce)
        return getNodeDeps(node).reduce<Option.Option<readonly string[]>>(
          (acc, dep) => (Option.isSome(acc) ? acc : findCycle(dep, newPath, newVisited, newStack)),
          Option.none()
        );
      })
    );
  };

  // Check all nodes as starting points
  const cycleResult = nodes.reduce<Option.Option<readonly string[]>>(
    (acc, node) => (Option.isSome(acc) ? acc : findCycle(node.name, [], new Set(), new Set())),
    Option.none()
  );

  return Option.match(cycleResult, {
    onNone: (): Effect.Effect<void, GeneralError> => Effect.void,
    onSome: (cycle): Effect.Effect<void, GeneralError> =>
      Effect.fail(
        new GeneralError({
          code: ErrorCode.GENERAL_ERROR as 1,
          message: `Circular dependency detected: ${cycle.join(" -> ")}`,
        })
      ),
  });
};

// ============================================================================
// Topological Sort
// ============================================================================

/** State for Kahn's algorithm iteration */
interface KahnState {
  readonly inDegree: ReadonlyMap<string, number>;
  readonly adjacency: ReadonlyMap<string, readonly string[]>;
  readonly queue: readonly string[];
  readonly sorted: readonly string[];
}

/**
 * Topological sort using Kahn's algorithm.
 * Returns containers in order of startup (dependencies first).
 */
export const topologicalSort = (nodes: DependencyNode[]): Effect.Effect<string[], GeneralError> =>
  Effect.gen(function* () {
    yield* validateDependencies(nodes);
    yield* detectCycles(nodes);

    // Build initial adjacency and in-degree using reduce
    const initial = nodes.reduce<{ adj: Map<string, string[]>; deg: Map<string, number> }>(
      (acc, node) => {
        acc.deg.set(node.name, 0);
        acc.adj.set(node.name, []);
        return acc;
      },
      { adj: new Map(), deg: new Map() }
    );

    // Add edges (dependency -> dependent)
    const { adjacency, inDegree } = nodes.reduce(
      (acc, node) =>
        getNodeDeps(node).reduce((innerAcc, dep) => {
          const newAdj = new Map(innerAcc.adjacency);
          newAdj.set(dep, [...(innerAcc.adjacency.get(dep) ?? []), node.name]);
          const newDeg = new Map(innerAcc.inDegree);
          newDeg.set(node.name, (innerAcc.inDegree.get(node.name) ?? 0) + 1);
          return { adjacency: newAdj, inDegree: newDeg };
        }, acc),
      {
        adjacency: initial.adj as ReadonlyMap<string, readonly string[]>,
        inDegree: initial.deg as ReadonlyMap<string, number>,
      }
    );

    // Initial queue: nodes with zero in-degree
    const initialQueue = [...inDegree.entries()]
      .filter(([, deg]) => deg === 0)
      .map(([name]) => name);

    const finalState = yield* Effect.iterate(
      { inDegree, adjacency, queue: initialQueue, sorted: [] } as KahnState,
      {
        while: (s): boolean => s.queue.length > 0,
        body: (s): Effect.Effect<KahnState> => {
          const [current, ...rest] = s.queue;
          if (!current) {
            return Effect.succeed(s);
          }

          const dependents = s.adjacency.get(current) ?? [];
          const { newDegree, ready } = dependents.reduce(
            (acc, dep) => {
              const deg = (acc.newDegree.get(dep) ?? 1) - 1;
              const updated = new Map(acc.newDegree);
              updated.set(dep, deg);
              return { newDegree: updated, ready: deg === 0 ? [...acc.ready, dep] : acc.ready };
            },
            { newDegree: s.inDegree, ready: [] as string[] }
          );

          return Effect.succeed({
            ...s,
            inDegree: newDegree,
            queue: [...rest, ...ready],
            sorted: [...s.sorted, current],
          });
        },
      }
    );

    if (finalState.sorted.length !== nodes.length) {
      return yield* Effect.fail(
        new GeneralError({
          code: ErrorCode.GENERAL_ERROR as 1,
          message: "Dependency resolution failed - possible cycle or missing node",
        })
      );
    }

    return [...finalState.sorted];
  });

// ============================================================================
// Start/Stop Order Resolution
// ============================================================================

/** State for level computation iteration */
interface LevelState {
  readonly placed: ReadonlySet<string>;
  readonly levels: readonly (readonly string[])[];
  readonly remaining: readonly string[];
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
      { placed: new Set<string>(), levels: [], remaining: sorted } as LevelState,
      {
        while: (s): boolean => s.remaining.length > 0,
        body: (s): Effect.Effect<LevelState> => {
          // Partition: ready (all deps placed) vs not ready
          const ready = s.remaining.filter((name) => {
            const node = nodeMap.get(name);
            return node ? allDepsIn(getNodeDeps(node), s.placed) : false;
          });

          if (ready.length === 0) {
            return Effect.succeed({ ...s, remaining: [] });
          }

          const notReady = s.remaining.filter((name) => !ready.includes(name));

          return Effect.succeed({
            placed: new Set([...s.placed, ...ready]),
            levels: [...s.levels, ready],
            remaining: notReady,
          });
        },
      }
    );

    return { order: sorted, levels: finalState.levels.map((l) => [...l]) };
  });

/**
 * Resolve stop order (reverse of start order).
 */
export const resolveStopOrder = (
  containers: StackContainer[]
): Effect.Effect<StartOrder, GeneralError> =>
  Effect.map(resolveStartOrder(containers), (start) => ({
    order: [...start.order].reverse(),
    levels: [...start.levels].reverse(),
  }));

// ============================================================================
// Dependency Query Functions
// ============================================================================

/**
 * Get all containers that depend on a given container.
 */
export const getDependents = (containerName: string, containers: StackContainer[]): string[] =>
  containers
    .filter((c) => c.requires?.includes(containerName) || c.wants?.includes(containerName))
    .map((c) => c.name);

/**
 * Get all dependencies of a container (transitive).
 */
export const getAllDependencies = (
  containerName: string,
  containers: StackContainer[]
): string[] => {
  const containerMap = buildContainerMap(containers);

  // Tail-recursive BFS with immutable state
  const bfs = (queue: readonly string[], visited: ReadonlySet<string>): ReadonlySet<string> => {
    if (queue.length === 0) {
      return visited;
    }

    const [current, ...rest] = queue;
    if (!current) {
      return visited;
    }

    const container = containerMap.get(current);
    if (!container) {
      return bfs(rest, visited);
    }

    const deps = getContainerDeps(container);
    const unvisited = deps.filter((d) => !visited.has(d));

    return bfs([...rest, ...unvisited], new Set([...visited, ...unvisited]));
  };

  const start = containerMap.get(containerName);
  if (!start) {
    return [];
  }

  const initialDeps = getContainerDeps(start);
  return [...bfs(initialDeps, new Set(initialDeps))];
};
