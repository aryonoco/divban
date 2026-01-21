// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Entry type - the fundamental unit of quadlet configuration.
 * This module defines the core ADT for INI entries.
 */

/**
 * An INI entry - the fundamental unit of quadlet configuration.
 */
export interface Entry {
  readonly key: string;
  readonly value: string;
}

/**
 * Type alias for a collection of entries.
 */
export type Entries = readonly Entry[];

/**
 * Empty entries - the identity element for entry concatenation.
 */
export const empty: Entries = [];
