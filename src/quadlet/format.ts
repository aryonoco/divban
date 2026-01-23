// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * INI serialization with Quadlet section ordering.
 * Sections must appear in standard order (Unit, Container, Service,
 * Install) for systemd generator compatibility.
 */

import { Array as Arr, Order, pipe } from "effect";
import { escapeWith } from "../lib/str-transform";
import type { Entry } from "./entry";

/**
 * Section in an INI file.
 */
export interface IniSection {
  /** Section name (e.g., "Container", "Service") */
  readonly name: string;
  /** Key-value entries */
  readonly entries: readonly Entry[];
}

/** Escape double quotes with backslash */
const QUOTE_ESCAPE_MAP: ReadonlyMap<string, string> = new Map([['"', '\\"']]);
const escapeQuotes = escapeWith(QUOTE_ESCAPE_MAP);

/**
 * Escape a value for INI file format.
 * Handles special characters and quoting.
 */
export const escapeIniValue = (value: string): string => {
  const needsQuoting =
    value.includes(" ") || value.includes('"') || value.includes("'") || value.includes("=");

  return needsQuoting ? `"${escapeQuotes(value)}"` : value;
};

/**
 * Format a single INI section.
 */
export const formatSection = (section: IniSection): string =>
  section.entries.length === 0
    ? ""
    : pipe(
        section.entries,
        Arr.map(({ key, value }) => `${key}=${value}`),
        (lines) => [`[${section.name}]`, ...lines].join("\n")
      );

/**
 * Format multiple sections into a complete INI file.
 */
export const formatQuadletFile = (sections: readonly IniSection[]): string =>
  pipe(
    sections,
    Arr.filter((s) => s.entries.length > 0),
    Arr.map(formatSection),
    (formatted) => `${formatted.join("\n\n")}\n`
  );

/**
 * Standard section ordering for quadlet files.
 */
export const SECTION_ORDER: readonly string[] = [
  "Unit",
  "Container",
  "Network",
  "Volume",
  "Service",
  "Install",
] as const satisfies readonly string[];

/**
 * Get the sort order index for a section (unknown sections go at the end).
 */
const sectionOrderIndex = (section: IniSection): number => {
  const index = SECTION_ORDER.indexOf(section.name as (typeof SECTION_ORDER)[number]);
  return index === -1 ? SECTION_ORDER.length : index;
};

/**
 * Order instance for IniSection based on standard quadlet section ordering.
 */
const sectionOrder: Order.Order<IniSection> = Order.mapInput(Order.number, sectionOrderIndex);

/**
 * Sort sections in the standard order.
 */
export const sortSections = (sections: readonly IniSection[]): readonly IniSection[] =>
  Arr.sort(sections, sectionOrder);

/**
 * Create a formatted quadlet file with properly ordered sections.
 */
export const createQuadletFile = (sections: readonly IniSection[]): string =>
  formatQuadletFile(sortSections(sections));
