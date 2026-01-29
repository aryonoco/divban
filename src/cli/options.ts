// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Centralized CLI option definitions. Sharing these ensures consistent naming
 * and descriptions across commands, and enables type-safe composition.
 */

import { Args as A, Options as O } from "@effect/cli";
import type { Args } from "@effect/cli/Args";
import type { Options } from "@effect/cli/Options";
import { Match, Option, pipe } from "effect";
import type { LogFormat, LogLevel } from "../config/field-values";
import { LOG_FORMAT_VALUES, LOG_LEVEL_VALUES } from "../config/field-values";

// Shared positional arguments

export const serviceArg: Args<string> = A.text({ name: "service" }).pipe(
  A.withDescription("Service name (e.g. caddy, immich, actual)")
);

export const optionalServiceArg: Args<Option.Option<string>> = A.text({ name: "service" }).pipe(
  A.withDescription("Service name (e.g. caddy, immich, actual)"),
  A.optional
);

export const configArg: Args<string> = A.text({ name: "config" }).pipe(
  A.withDescription("Path to TOML configuration file")
);

export const optionalConfigArg: Args<Option.Option<string>> = A.text({ name: "config" }).pipe(
  A.withDescription("Path to configuration or output file"),
  A.optional
);

export const backupPathArg: Args<string> = A.text({ name: "backup-path" }).pipe(
  A.withDescription("Path to backup file")
);

export const secretNameArg: Args<string> = A.text({ name: "name" }).pipe(
  A.withDescription("Secret name")
);

// Global options (spread into every command)

export const globalOptions: {
  readonly verbose: Options<boolean>;
  readonly dryRun: Options<boolean>;
  readonly force: Options<boolean>;
  readonly logLevel: Options<Option.Option<LogLevel>>;
  readonly format: Options<Option.Option<LogFormat>>;
  readonly json: Options<boolean>;
  readonly globalConfig: Options<Option.Option<string>>;
} = {
  verbose: O.boolean("verbose").pipe(
    O.withAlias("v"),
    O.withDescription("Verbose output (debug logging)")
  ),
  dryRun: O.boolean("dry-run").pipe(O.withDescription("Show what would be done without doing it")),
  force: O.boolean("force").pipe(
    O.withAlias("f"),
    O.withDescription("Force operation (skip confirmations)")
  ),
  logLevel: O.choice("log-level", LOG_LEVEL_VALUES).pipe(
    O.withDescription("Set log level"),
    O.optional
  ),
  format: O.choice("format", LOG_FORMAT_VALUES).pipe(
    O.withDescription("Output format"),
    O.optional
  ),
  json: O.boolean("json").pipe(O.withDescription("Shorthand for --format json")),
  globalConfig: O.text("global-config").pipe(
    O.withAlias("g"),
    O.withDescription("Path to global configuration file"),
    O.optional
  ),
};

// Per-command options

export const allFlag: Options<boolean> = O.boolean("all").pipe(
  O.withDescription("Run on all registered services")
);

export const outputDir: Options<Option.Option<string>> = O.text("output").pipe(
  O.withAlias("o"),
  O.withDescription("Output directory for generated files"),
  O.optional
);

export const follow: Options<boolean> = O.boolean("follow").pipe(
  O.withDescription("Follow log output (tail -f style)")
);

export const lines: Options<number> = O.integer("lines").pipe(
  O.withAlias("n"),
  O.withDefault(100),
  O.withDescription("Number of log lines to show")
);

export const container: Options<Option.Option<string>> = O.text("container").pipe(
  O.withAlias("c"),
  O.withDescription("Container to show logs for (multi-container services)"),
  O.optional
);

export const preserveData: Options<boolean> = O.boolean("preserve-data").pipe(
  O.withDescription("Keep the data directory during removal")
);

// Type definitions

export interface GlobalOptions {
  readonly verbose: boolean;
  readonly dryRun: boolean;
  readonly force: boolean;
  readonly logLevel: Option.Option<LogLevel>;
  readonly format: Option.Option<LogFormat>;
  readonly json: boolean;
  readonly globalConfig: Option.Option<string>;
}

/** Resolves format: --json takes precedence as shorthand for --format=json. */
export const effectiveFormat = (globals: GlobalOptions): Option.Option<LogFormat> =>
  pipe(
    Match.value(globals.json),
    Match.when(true, (): Option.Option<LogFormat> => Option.some("json")),
    Match.when(false, (): Option.Option<LogFormat> => globals.format),
    Match.exhaustive
  );
