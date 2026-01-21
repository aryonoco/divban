// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Volume quadlet file generation.
 */

import type { Entries } from "./entry";
import { concat, fromRecord, fromValue } from "./entry-combinators";
import { makeSection, makeSimpleQuadletGenerator } from "./factory";
import type { IniSection } from "./format";
import type { GeneratedQuadlet, VolumeQuadlet } from "./types";

export const getVolumeSectionEntries = (config: VolumeQuadlet): Entries =>
  concat(
    fromValue("Driver", config.driver),
    fromRecord("Options", config.options),
    fromRecord("Label", config.labels)
  );

/**
 * Build the [Volume] section using combinators.
 */
export const buildVolumeSection: (config: VolumeQuadlet) => IniSection = makeSection(
  "Volume",
  getVolumeSectionEntries
);

/**
 * Generate a complete volume quadlet file.
 */
export const generateVolumeQuadlet: (config: VolumeQuadlet) => GeneratedQuadlet =
  makeSimpleQuadletGenerator("volume", buildVolumeSection);

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
