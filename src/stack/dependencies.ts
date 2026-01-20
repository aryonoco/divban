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

import { Effect, Option } from "effect";
import { ErrorCode, GeneralError } from "../lib/errors";
import type { DependencyNode, StackContainer, StartOrder } from "./types";

/**
 * Build dependency graph from container definitions.
 */
export const buildDependencyGraph = (containers: StackContainer[]): DependencyNode[] => {
  return containers.map((c) => ({
    name: c.name,
    requires: c.requires ?? [],
    wants: c.wants ?? [],
  }));
};

/**
 * Validate that all dependencies exist in the stack.
 */
export const validateDependencies = (
  nodes: DependencyNode[]
): Effect.Effect<void, GeneralError> => {
  const names = new Set(nodes.map((n) => n.name));

  for (const node of nodes) {
    for (const dep of [...node.requires, ...node.wants]) {
      if (!names.has(dep)) {
        return Effect.fail(
          new GeneralError({
            code: ErrorCode.GENERAL_ERROR as 1,
            message: `Container '${node.name}' depends on unknown container '${dep}'`,
          })
        );
      }
    }
  }

  return Effect.void;
};

/**
 * Detect cycles in the dependency graph.
 */
export const detectCycles = (nodes: DependencyNode[]): Effect.Effect<void, GeneralError> => {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const nodeMap = new Map(nodes.map((n) => [n.name, n]));

  const hasCycle = (name: string, path: string[]): Option.Option<string[]> => {
    if (recursionStack.has(name)) {
      return Option.some([...path, name]);
    }
    if (visited.has(name)) {
      return Option.none();
    }

    visited.add(name);
    recursionStack.add(name);

    const nodeOpt = Option.fromNullable(nodeMap.get(name));
    if (Option.isSome(nodeOpt)) {
      for (const dep of [...nodeOpt.value.requires, ...nodeOpt.value.wants]) {
        const cycle = hasCycle(dep, [...path, name]);
        if (Option.isSome(cycle)) {
          return cycle;
        }
      }
    }

    recursionStack.delete(name);
    return Option.none();
  };

  for (const node of nodes) {
    const cycle = hasCycle(node.name, []);
    if (Option.isSome(cycle)) {
      return Effect.fail(
        new GeneralError({
          code: ErrorCode.GENERAL_ERROR as 1,
          message: `Circular dependency detected: ${cycle.value.join(" -> ")}`,
        })
      );
    }
  }

  return Effect.void;
};

/**
 * Topological sort using Kahn's algorithm.
 * Returns containers in order of startup (dependencies first).
 */
export const topologicalSort = (nodes: DependencyNode[]): Effect.Effect<string[], GeneralError> =>
  Effect.gen(function* () {
    // Validate first
    yield* validateDependencies(nodes);
    yield* detectCycles(nodes);

    // Build adjacency list and in-degree count
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const node of nodes) {
      inDegree.set(node.name, 0);
      adjacency.set(node.name, []);
    }

    // Add edges (dependency -> dependent)
    for (const node of nodes) {
      for (const dep of [...node.requires, ...node.wants]) {
        adjacency.get(dep)?.push(node.name);
        inDegree.set(node.name, (inDegree.get(node.name) ?? 0) + 1);
      }
    }

    // Find nodes with no dependencies
    const queue: string[] = [];
    for (const [name, degree] of inDegree) {
      if (degree === 0) {
        queue.push(name);
      }
    }

    // Process queue
    const sorted: string[] = [];
    while (queue.length > 0) {
      const nameOpt = Option.fromNullable(queue.shift());
      if (Option.isNone(nameOpt)) {
        break;
      }
      const name = nameOpt.value;
      sorted.push(name);

      for (const dependent of Option.getOrElse(
        Option.fromNullable(adjacency.get(name)),
        () => []
      )) {
        const newDegree =
          Option.getOrElse(Option.fromNullable(inDegree.get(dependent)), () => 1) - 1;
        inDegree.set(dependent, newDegree);
        if (newDegree === 0) {
          queue.push(dependent);
        }
      }
    }

    // Check if all nodes were processed
    if (sorted.length !== nodes.length) {
      return yield* Effect.fail(
        new GeneralError({
          code: ErrorCode.GENERAL_ERROR as 1,
          message: "Dependency resolution failed - possible cycle or missing node",
        })
      );
    }

    return sorted;
  });

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

    const nodeMap = new Map(nodes.map((n) => [n.name, n]));

    // Group by levels (containers at same level have all deps satisfied)
    const levels: string[][] = [];
    const placed = new Set<string>();

    while (placed.size < sorted.length) {
      const level: string[] = [];

      for (const name of sorted) {
        if (placed.has(name)) {
          continue;
        }

        const nodeOpt = Option.fromNullable(nodeMap.get(name));
        if (Option.isNone(nodeOpt)) {
          continue;
        }
        const node = nodeOpt.value;

        // Check if all dependencies are placed
        const allDepsPlaced = [...node.requires, ...node.wants].every((dep) => placed.has(dep));

        if (allDepsPlaced) {
          level.push(name);
        }
      }

      if (level.length === 0) {
        // Should not happen if topological sort succeeded
        break;
      }

      for (const name of level) {
        placed.add(name);
      }
      levels.push(level);
    }

    return {
      order: sorted,
      levels,
    };
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

/**
 * Get all containers that depend on a given container.
 */
export const getDependents = (containerName: string, containers: StackContainer[]): string[] => {
  return containers
    .filter((c) => c.requires?.includes(containerName) || c.wants?.includes(containerName))
    .map((c) => c.name);
};

/**
 * Get all dependencies of a container (transitive).
 */
export const getAllDependencies = (
  containerName: string,
  containers: StackContainer[]
): string[] => {
  const containerMap = new Map(containers.map((c) => [c.name, c]));
  const deps = new Set<string>();
  const queue = [containerName];

  while (queue.length > 0) {
    const nameOpt = Option.fromNullable(queue.shift());
    if (Option.isNone(nameOpt)) {
      break;
    }
    const name = nameOpt.value;
    const containerOpt = Option.fromNullable(containerMap.get(name));
    if (Option.isNone(containerOpt)) {
      continue;
    }
    const container = containerOpt.value;

    for (const dep of [...(container.requires ?? []), ...(container.wants ?? [])]) {
      if (!deps.has(dep)) {
        deps.add(dep);
        queue.push(dep);
      }
    }
  }

  return [...deps];
};
