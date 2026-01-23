// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * INI entry as a data type for composable quadlet building.
 * Separating Entry from formatting enables pure transformation
 * pipelines before any I/O (write) occurs.
 */

export interface Entry {
  readonly key: string;
  readonly value: string;
}

export type Entries = readonly Entry[];

export const empty: Entries = [];
