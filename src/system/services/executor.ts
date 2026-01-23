// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * CommandExecutor service using Context.Tag pattern.
 * Wraps all functions from src/system/exec.ts for dependency injection.
 * Works with isolatedDeclarations: true.
 */

import { Context, Layer } from "effect";
import {
  commandExists,
  exec,
  execAsUser,
  execOutput,
  execSuccess,
  shell,
  shellAsUser,
  shellBlob,
  shellBraces,
  shellEscape,
  shellJson,
  shellLines,
  shellText,
} from "../exec";

/**
 * CommandExecutor service interface - provides command execution via Effect DI.
 * Base service with no dependencies.
 */
export interface CommandExecutorService {
  // Core execution
  readonly exec: typeof exec;
  readonly execSuccess: typeof execSuccess;
  readonly execOutput: typeof execOutput;
  readonly execAsUser: typeof execAsUser;

  // Shell operations
  readonly shell: typeof shell;
  readonly shellText: typeof shellText;
  readonly shellLines: typeof shellLines;
  readonly shellJson: typeof shellJson;
  readonly shellBlob: typeof shellBlob;
  readonly shellAsUser: typeof shellAsUser;

  // Utilities
  readonly commandExists: typeof commandExists;
  readonly shellEscape: typeof shellEscape;
  readonly shellBraces: typeof shellBraces;
}

/**
 * CommandExecutor service identifier for Effect dependency injection.
 */
export interface CommandExecutor {
  readonly _tag: "CommandExecutor";
}

/**
 * CommandExecutor context tag.
 * Use with `yield* CommandExecutor` to access the service in Effect generators.
 */
export const CommandExecutor: Context.Tag<CommandExecutor, CommandExecutorService> =
  Context.GenericTag<CommandExecutor, CommandExecutorService>("divban/CommandExecutor");

/**
 * CommandExecutor live layer with all implementations.
 */
export const CommandExecutorLive: Layer.Layer<CommandExecutor> = Layer.succeed(CommandExecutor, {
  // Core execution
  exec,
  execSuccess,
  execOutput,
  execAsUser,

  // Shell operations
  shell,
  shellText,
  shellLines,
  shellJson,
  shellBlob,
  shellAsUser,

  // Utilities
  commandExists,
  shellEscape,
  shellBraces,
});
