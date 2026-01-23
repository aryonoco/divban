// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Section builder factory - eliminates repeated (name, entries) → IniSection
 * boilerplate across unit.ts, service.ts, install.ts. Extracted to its own
 * file to break circular imports between factory.ts and unit.ts.
 */

import type { Entries } from "./entry";
import type { IniSection } from "./format";

/**
 * Explicit return type annotation required for TypeScript's isolatedDeclarations mode.
 * @see https://www.typescriptlang.org/tsconfig/#isolatedDeclarations
 */
export const makeSection =
  <C>(name: string, getEntries: (config: C) => Entries): ((config: C) => IniSection) =>
  (config: C): IniSection => ({
    name,
    entries: getEntries(config),
  });
