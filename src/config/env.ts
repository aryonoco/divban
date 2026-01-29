// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Environment variable configs. These produce Option<A> to participate in
 * the CLI > env > TOML precedence chain (see resolve.ts).
 */

import { Config, type Option } from "effect";
import { LOG_FORMAT_VALUES, LOG_LEVEL_VALUES, type LogFormat, type LogLevel } from "./field-values";

/**
 * HOME directory from environment.
 * Falls back to /root if not set (common in containerized environments).
 */
export const HomeConfig: Config.Config<string> = Config.string("HOME").pipe(
  Config.withDefault("/root")
);

export const LogLevelOptionConfig: Config.Config<Option.Option<LogLevel>> = Config.option(
  Config.nested(Config.literal(...LOG_LEVEL_VALUES)("LOG_LEVEL"), "DIVBAN")
);

export const LogFormatOptionConfig: Config.Config<Option.Option<LogFormat>> = Config.option(
  Config.nested(Config.literal(...LOG_FORMAT_VALUES)("LOG_FORMAT"), "DIVBAN")
);

export const BaseDataDirOptionConfig: Config.Config<Option.Option<string>> = Config.option(
  Config.nested(Config.string("BASE_DATA_DIR"), "DIVBAN")
);

/** When true, overrides log level to debug regardless of other settings. */
export const DebugModeConfig: Config.Config<boolean> = Config.nested(
  Config.boolean("DEBUG").pipe(Config.withDefault(false)),
  "DIVBAN"
);
