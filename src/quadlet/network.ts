/**
 * Network quadlet file generation.
 */

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
): NetworkQuadlet => ({
  name,
  description: options?.description ?? `Network ${name}`,
  internal: false,
  driver: "bridge",
  subnet: options?.subnet,
  gateway: options?.gateway,
  ipv6: options?.ipv6,
});
