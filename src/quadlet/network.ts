// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Network quadlet file generation.
 */

import { Option } from "effect";
import type { IniSection } from "./format";
import { addEntries, addEntry, createQuadletFile } from "./format";
import type { GeneratedQuadlet, NetworkQuadlet } from "./types";
import { buildUnitSection } from "./unit";

/**
 * Build the [Network] section for a network quadlet.
 */
export const buildNetworkSection = (config: NetworkQuadlet): IniSection => {
  const entries: Array<{ key: string; value: string }> = [];

  addEntry(entries, "Internal", config.internal);
  addEntry(entries, "Driver", config.driver);
  addEntry(entries, "IPv6", config.ipv6);
  addEntry(entries, "Subnet", config.subnet);
  addEntry(entries, "Gateway", config.gateway);
  addEntry(entries, "IPRange", config.ipRange);
  addEntries(entries, "DNS", config.dns);

  // Add options
  if (config.options) {
    for (const [key, value] of Object.entries(config.options)) {
      entries.push({ key: "Options", value: `${key}=${value}` });
    }
  }

  return { name: "Network", entries };
};

/**
 * Generate a complete network quadlet file.
 */
export const generateNetworkQuadlet = (config: NetworkQuadlet): GeneratedQuadlet => {
  const sections: IniSection[] = [];

  // Unit section
  if (config.description) {
    sections.push(
      buildUnitSection({
        description: config.description,
      })
    );
  }

  // Network section
  sections.push(buildNetworkSection(config));

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
): NetworkQuadlet => {
  const result: NetworkQuadlet = {
    name,
    description: options?.description ?? `Network ${name}`,
    internal: false,
    driver: "bridge",
  };

  const subnetOpt = Option.fromNullable(options?.subnet);
  if (Option.isSome(subnetOpt)) {
    result.subnet = subnetOpt.value;
  }
  const gatewayOpt = Option.fromNullable(options?.gateway);
  if (Option.isSome(gatewayOpt)) {
    result.gateway = gatewayOpt.value;
  }
  const ipv6Opt = Option.fromNullable(options?.ipv6);
  if (Option.isSome(ipv6Opt)) {
    result.ipv6 = ipv6Opt.value;
  }

  return result;
};
