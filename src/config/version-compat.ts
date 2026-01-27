// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Config-specific compatibility checking, separate from backup compatibility
 * because config and backup formats have independent versioning and support policies.
 */

import { Effect, Match, pipe } from "effect";
import { ConfigError, ErrorCode } from "../lib/errors";
import { DIVBAN_VERSION } from "../lib/version";
import { type DivbanConfigSchemaVersion, configSchemaVersion } from "../lib/versioning";
import { checkVersionInList, formatVersionList } from "../lib/versioning/check";

export const CURRENT_CONFIG_SCHEMA_VERSION: DivbanConfigSchemaVersion =
  configSchemaVersion("1.0.0");

export const SUPPORTED_CONFIG_SCHEMA_VERSIONS: readonly DivbanConfigSchemaVersion[] = [
  configSchemaVersion("1.0.0"),
] as const;

/**
 * Validate config schema version.
 *
 * Version is REQUIRED - missing versions are caught by Schema validation
 * before this function is called.
 */
export const validateConfigCompatibility = (
  configSchema: DivbanConfigSchemaVersion,
  configPath: string
): Effect.Effect<void, ConfigError> => {
  const result = checkVersionInList(configSchema, SUPPORTED_CONFIG_SCHEMA_VERSIONS);

  return pipe(
    result,
    Match.value,
    Match.tag("versionSupported", (): Effect.Effect<void, never> => Effect.void),
    Match.tag(
      "versionUnsupported",
      ({ version }): Effect.Effect<void, ConfigError> =>
        Effect.fail(
          new ConfigError({
            code: ErrorCode.CONFIG_VALIDATION_ERROR,
            message:
              `Config schema version ${version} is not supported by divban ${DIVBAN_VERSION}. ` +
              `Supported: ${formatVersionList(SUPPORTED_CONFIG_SCHEMA_VERSIONS)}`,
            path: configPath,
          })
        )
    ),
    Match.exhaustive
  );
};
