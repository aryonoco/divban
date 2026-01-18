// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Stack orchestration module exports.
 */

// Types
export type {
  DependencyNode,
  Stack,
  StackContainer,
  StackGeneratedFiles,
  StackNetwork,
  StackVolume,
  StartOrder,
} from "./types";

// Dependencies
export {
  buildDependencyGraph,
  detectCycles,
  getAllDependencies,
  getDependents,
  resolveStartOrder,
  resolveStopOrder,
  topologicalSort,
  validateDependencies,
} from "./dependencies";

// Orchestrator
export {
  enableStack,
  getStackStatus,
  isStackRunning,
  restartStack,
  startContainer,
  startStack,
  stopContainer,
  stopStack,
} from "./orchestrator";
export type { OrchestratorOptions } from "./orchestrator";

// Environment
export {
  CommonEnvGroups,
  escapeEnvValue,
  formatEnvLine,
  generateEnvFile,
  generateSimpleEnvFile,
  mergeEnv,
  parseEnvFile,
} from "./environment";
export type { EnvFileConfig, EnvGroup } from "./environment";

// Generator
export {
  createStack,
  generateStackQuadlets,
  getStackFilenames,
} from "./generator";
export type { StackGeneratorContext } from "./generator";
