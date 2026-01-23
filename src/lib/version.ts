// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Application version constants.
 * JSON imports from package.json are resolved at compile time in Bun binaries.
 */

import pkg from "../../package.json";
import { type DivbanProducerVersion, producerVersion } from "./versioning";

/**
 * Current divban version from package.json.
 * Bundled at compile time - works in standalone binaries.
 */
export const DIVBAN_VERSION: DivbanProducerVersion = producerVersion(
  pkg.version as `${number}.${number}.${number}`
);

/**
 * Application producer name constant.
 */
export const DIVBAN_PRODUCER_NAME = "divban" as const;
