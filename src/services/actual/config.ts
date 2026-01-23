// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Actual Budget service configuration context tag.
 * Uses Context.GenericTag for isolatedDeclarations: true compatibility.
 */

import { Context } from "effect";
import type { ActualConfig } from "./schema";

export interface ActualConfigTag {
  readonly _tag: "ActualConfig";
}

/**
 * Actual configuration context.
 * Used to access service configuration in Effect generators via `yield* ActualConfigTag`.
 */
export const ActualConfigTag: Context.Tag<ActualConfigTag, ActualConfig> = Context.GenericTag<
  ActualConfigTag,
  ActualConfig
>("divban/ActualConfig");
