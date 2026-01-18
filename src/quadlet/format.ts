// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * INI file formatting utilities for quadlet files.
 */

/**
 * Section in an INI file.
 */
export interface IniSection {
  /** Section name (e.g., "Container", "Service") */
  name: string;
  /** Key-value entries */
  entries: Array<{ key: string; value: string }>;
}

/**
 * Escape a value for INI file format.
 * Handles special characters and quoting.
 */
export const escapeIniValue = (value: string): string => {
  // If value contains special characters, quote it
  if (value.includes(" ") || value.includes('"') || value.includes("'") || value.includes("=")) {
    // Escape existing quotes
    const escaped = value.replace(/"/g, '\\"');
    return `"${escaped}"`;
  }
  return value;
};

/**
 * Format a single INI section.
 */
export const formatSection = (section: IniSection): string => {
  if (section.entries.length === 0) {
    return "";
  }

  const lines: string[] = [`[${section.name}]`];

  for (const { key, value } of section.entries) {
    // Quadlet uses = without spaces around it
    lines.push(`${key}=${value}`);
  }

  return lines.join("\n");
};

/**
 * Format multiple sections into a complete INI file.
 */
export const formatQuadletFile = (sections: IniSection[]): string => {
  const nonEmptySections = sections.filter((s) => s.entries.length > 0);

  return `${nonEmptySections.map(formatSection).join("\n\n")}\n`;
};

/**
 * Add an entry to a section if the value is defined.
 */
export const addEntry = (
  entries: Array<{ key: string; value: string }>,
  key: string,
  value: string | number | boolean | undefined
): void => {
  if (value === undefined) {
    return;
  }

  if (typeof value === "boolean") {
    entries.push({ key, value: value ? "true" : "false" });
  } else {
    entries.push({ key, value: String(value) });
  }
};

/**
 * Add multiple entries with the same key (for arrays).
 */
export const addEntries = (
  entries: Array<{ key: string; value: string }>,
  key: string,
  values: string[] | undefined
): void => {
  if (!values) {
    return;
  }

  for (const value of values) {
    entries.push({ key, value });
  }
};

/**
 * Add environment variable entries.
 */
export const addEnvironment = (
  entries: Array<{ key: string; value: string }>,
  env: Record<string, string> | undefined
): void => {
  if (!env) {
    return;
  }

  for (const [key, value] of Object.entries(env)) {
    entries.push({ key: "Environment", value: `${key}=${escapeIniValue(value)}` });
  }
};

/**
 * Standard section ordering for quadlet files.
 */
export const SECTION_ORDER = [
  "Unit",
  "Container",
  "Network",
  "Volume",
  "Service",
  "Install",
] as const;

/**
 * Sort sections in the standard order.
 */
export const sortSections = (sections: IniSection[]): IniSection[] => {
  return [...sections].sort((a, b) => {
    const aIndex = SECTION_ORDER.indexOf(a.name as (typeof SECTION_ORDER)[number]);
    const bIndex = SECTION_ORDER.indexOf(b.name as (typeof SECTION_ORDER)[number]);

    // Unknown sections go at the end
    const aOrder = aIndex === -1 ? SECTION_ORDER.length : aIndex;
    const bOrder = bIndex === -1 ? SECTION_ORDER.length : bIndex;

    return aOrder - bOrder;
  });
};

/**
 * Create a formatted quadlet file with properly ordered sections.
 */
export const createQuadletFile = (sections: IniSection[]): string => {
  return formatQuadletFile(sortSections(sections));
};
