// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * INI serialization for systemd Quadlet files. Sections are ordered
 * (Unit, Container, Service, Install) as the systemd generator expects.
 */

import { Array as Arr, Order, pipe } from "effect";
import { quoteEscapeCodec } from "../lib/escape-codec";
import type { Entry } from "./entry";

export interface IniSection {
  readonly name: string;
  readonly entries: readonly Entry[];
}

const escapeQuotes = quoteEscapeCodec.escape;

export const escapeIniValue = (value: string): string => {
  const needsQuoting =
    value.includes(" ") || value.includes('"') || value.includes("'") || value.includes("=");

  return needsQuoting ? `"${escapeQuotes(value)}"` : value;
};

export const formatSection = (section: IniSection): string =>
  section.entries.length === 0
    ? ""
    : pipe(
        section.entries,
        Arr.map(({ key, value }) => `${key}=${value}`),
        (lines) => [`[${section.name}]`, ...lines].join("\n")
      );

export const formatQuadletFile = (sections: readonly IniSection[]): string =>
  pipe(
    sections,
    Arr.filter((s) => s.entries.length > 0),
    Arr.map(formatSection),
    (formatted) => `${formatted.join("\n\n")}\n`
  );

export const SECTION_ORDER: readonly string[] = [
  "Unit",
  "Container",
  "Network",
  "Volume",
  "Service",
  "Install",
] as const satisfies readonly string[];

/** Unknown sections sort after standard ones to avoid confusing the generator. */
const sectionOrderIndex = (section: IniSection): number => {
  const index = SECTION_ORDER.indexOf(section.name as (typeof SECTION_ORDER)[number]);
  return index === -1 ? SECTION_ORDER.length : index;
};

const sectionOrder: Order.Order<IniSection> = Order.mapInput(Order.number, sectionOrderIndex);

export const sortSections = (sections: readonly IniSection[]): readonly IniSection[] =>
  Arr.sort(sections, sectionOrder);

export const createQuadletFile = (sections: readonly IniSection[]): string =>
  formatQuadletFile(sortSections(sections));
