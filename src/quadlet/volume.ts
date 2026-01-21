// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Volume quadlet file generation.
 */

import { Array as Arr, Option, identity, pipe } from "effect";
import type { Entries } from "./entry";
import { concat, fromRecord, fromValue } from "./entry-combinators";
import type { IniSection } from "./format";
import { createQuadletFile } from "./format";
import type { GeneratedQuadlet, VolumeQuadlet } from "./types";
import { buildUnitSection } from "./unit";

export const getVolumeSectionEntries = (config: VolumeQuadlet): Entries =>
  concat(
    fromValue("Driver", config.driver),
    fromRecord("Options", config.options),
    fromRecord("Label", config.labels)
  );

/**
 * Build the [Volume] section using pure combinators.
 */
export const buildVolumeSection = (config: VolumeQuadlet): IniSection => ({
  name: "Volume",
  entries: getVolumeSectionEntries(config),
});

/**
 * Generate a complete volume quadlet file.
 */
export const generateVolumeQuadlet = (config: VolumeQuadlet): GeneratedQuadlet => {
  const sections = pipe(
    [
      pipe(
        Option.fromNullable(config.description),
        Option.map((description) => buildUnitSection({ description }))
      ),
      Option.some(buildVolumeSection(config)),
    ],
    Arr.filterMap(identity)
  );

  return {
    filename: `${config.name}.volume`,
    content: createQuadletFile(sections),
    type: "volume",
  };
};

/**
 * Create a simple named volume configuration.
 */
export const createNamedVolume = (name: string, description?: string): VolumeQuadlet => ({
  name,
  description: description ?? `Volume ${name}`,
});

/**
 * Create a volume with specific driver options.
 */
export const createVolumeWithOptions = (
  name: string,
  options: Record<string, string>,
  description?: string
): VolumeQuadlet => ({
  name,
  description: description ?? `Volume ${name}`,
  options,
});
