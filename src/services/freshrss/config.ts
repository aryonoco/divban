// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * FreshRSS service configuration context tag.
 * Uses Context.GenericTag for isolatedDeclarations: true compatibility.
 */

import { Context } from "effect";
import type { FreshRssConfig } from "./schema";

export interface FreshRssConfigTag {
  readonly _tag: "FreshRssConfig";
}

/**
 * FreshRSS configuration context.
 * Used to access service configuration in Effect generators via `yield* FreshRssConfigTag`.
 */
export const FreshRssConfigTag: Context.Tag<FreshRssConfigTag, FreshRssConfig> = Context.GenericTag<
  FreshRssConfigTag,
  FreshRssConfig
>("divban/FreshRssConfig");
