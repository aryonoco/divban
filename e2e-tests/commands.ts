// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Array as Arr, pipe } from "effect";
import { getServiceCapabilities } from "./service-discovery.ts";
import type { CommandName, ServiceName } from "./types.ts";
import { commandName } from "./types.ts";

// All possible divban commands
const ALL_COMMANDS = [
  "validate",
  "generate",
  "diff",
  "setup",
  "start",
  "stop",
  "restart",
  "reload",
  "status",
  "logs",
  "update",
  "backup",
  "backup-config",
  "restore",
  "remove",
  "remove --force",
  "secret list",
  "secret show",
] as const;

// Generate commands for a service based on capabilities
export const generateCommands = (
  service: ServiceName
): ReadonlyArray<{ command: CommandName; args: readonly string[] }> => {
  const capabilities = getServiceCapabilities(service);

  return pipe(
    ALL_COMMANDS,
    Arr.filter((cmd) => {
      // Skip reload if service doesn't support it
      const isReload = cmd === "reload";
      const shouldSkipReload = isReload && !capabilities.hasReload;

      // Skip backup/restore if service doesn't support it
      const isBackupOrRestore = cmd === "backup" || cmd === "restore";
      const shouldSkipBackupRestore = isBackupOrRestore && !capabilities.hasBackup;

      const shouldSkip = shouldSkipReload || shouldSkipBackupRestore;
      return !shouldSkip;
    }),
    Arr.map((cmd) => {
      const parts = cmd.split(" ");
      const cmdName = commandName(parts[0] ?? "validate");
      const cmdArgs = parts.slice(1);

      return {
        command: cmdName,
        args: [...cmdArgs, service] as const,
      };
    })
  );
};
