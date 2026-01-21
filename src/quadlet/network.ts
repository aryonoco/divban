// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Network quadlet file generation.
 */

import { Array as Arr, Option, identity, pipe } from "effect";
import type { Entries } from "./entry";
import { concat, fromArray, fromRecord, fromValue } from "./entry-combinators";
import type { IniSection } from "./format";
import { createQuadletFile } from "./format";
import type { GeneratedQuadlet, NetworkQuadlet } from "./types";
import { buildUnitSection } from "./unit";

export const getNetworkSectionEntries = (config: NetworkQuadlet): Entries =>
  concat(
    fromValue("Internal", config.internal),
    fromValue("Driver", config.driver),
    fromValue("IPv6", config.ipv6),
    fromValue("Subnet", config.subnet),
    fromValue("Gateway", config.gateway),
    fromValue("IPRange", config.ipRange),
    fromArray("DNS", config.dns),
    fromRecord("Options", config.options)
  );

/**
 * Build the [Network] section using pure combinators.
 */
export const buildNetworkSection = (config: NetworkQuadlet): IniSection => ({
  name: "Network",
  entries: getNetworkSectionEntries(config),
});

/**
 * Generate a complete network quadlet file.
 */
export const generateNetworkQuadlet = (config: NetworkQuadlet): GeneratedQuadlet => {
  const sections = pipe(
    [
      pipe(
        Option.fromNullable(config.description),
        Option.map((description) => buildUnitSection({ description }))
      ),
      Option.some(buildNetworkSection(config)),
    ],
    Arr.filterMap(identity)
  );

  return {
    filename: `${config.name}.network`,
    content: createQuadletFile(sections),
    type: "network",
  };
};

/**
 * Create a simple internal bridge network configuration.
 */
export const createInternalNetwork = (name: string, description?: string): NetworkQuadlet => ({
  name,
  description: description ?? `Internal network for ${name}`,
  internal: true,
  driver: "bridge",
});

/**
 * Create a network with external connectivity.
 */
export const createExternalNetwork = (
  name: string,
  options?: {
    description?: string;
    subnet?: string;
    gateway?: string;
    ipv6?: boolean;
  }
): NetworkQuadlet => ({
  name,
  description: options?.description ?? `Network ${name}`,
  internal: false,
  driver: "bridge",
  ...(options?.subnet !== undefined && { subnet: options.subnet }),
  ...(options?.gateway !== undefined && { gateway: options.gateway }),
  ...(options?.ipv6 !== undefined && { ipv6: options.ipv6 }),
});
