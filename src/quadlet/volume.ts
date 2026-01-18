/**
 * Volume quadlet file generation.
 */

import type { IniSection } from "./format";
import { addEntry, createQuadletFile } from "./format";
import type { GeneratedQuadlet, VolumeQuadlet } from "./types";
import { buildUnitSection } from "./unit";

/**
 * Build the [Volume] section for a volume quadlet.
 */
export const buildVolumeSection = (config: VolumeQuadlet): IniSection => {
  const entries: Array<{ key: string; value: string }> = [];

  addEntry(entries, "Driver", config.driver);

  // Add options
  if (config.options) {
    for (const [key, value] of Object.entries(config.options)) {
      entries.push({ key: "Options", value: `${key}=${value}` });
    }
  }

  // Add labels
  if (config.labels) {
    for (const [key, value] of Object.entries(config.labels)) {
      entries.push({ key: "Label", value: `${key}=${value}` });
    }
  }

  return { name: "Volume", entries };
};

/**
 * Generate a complete volume quadlet file.
 */
export const generateVolumeQuadlet = (config: VolumeQuadlet): GeneratedQuadlet => {
  const sections: IniSection[] = [];

  // Unit section
  if (config.description) {
    sections.push(
      buildUnitSection({
        description: config.description,
      })
    );
  }

  // Volume section
  sections.push(buildVolumeSection(config));

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
