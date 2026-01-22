// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Higher-order factories for quadlet generation.
 */

import { Array as Arr, Option, identity, pipe } from "effect";
import { createQuadletFile } from "./format";
import type { IniSection } from "./format";
import type { GeneratedQuadlet } from "./types";
import { buildUnitSection } from "./unit";

/**
 * Factory for simple quadlet generators (network, volume pattern).
 * Handles optional Unit section + main section composition.
 *
 * Note: Explicit return type required for isolatedDeclarations.
 */
export const makeSimpleQuadletGenerator =
  <C extends { readonly name: string; readonly description?: string | undefined }>(
    type: "network" | "volume",
    buildMainSection: (config: C) => IniSection
  ): ((config: C) => GeneratedQuadlet) =>
  (config: C): GeneratedQuadlet => {
    const sections = pipe(
      [
        pipe(
          Option.fromNullable(config.description),
          Option.map((description) => buildUnitSection({ description }))
        ),
        Option.some(buildMainSection(config)),
      ],
      Arr.filterMap(identity)
    );

    return {
      filename: `${config.name}.${type}`,
      content: createQuadletFile(sections),
      type,
    };
  };
