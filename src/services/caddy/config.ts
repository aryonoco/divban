// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Caddy service configuration context tag.
 * Uses Context.GenericTag for isolatedDeclarations: true compatibility.
 */

import { Context } from "effect";
import type { CaddyConfig } from "./schema";

/**
 * CaddyConfigTag identifier type.
 */
export interface CaddyConfigTag {
  readonly _tag: "CaddyConfig";
}

/**
 * Caddy configuration context.
 * Used to access service configuration in Effect generators via `yield* CaddyConfigTag`.
 */
export const CaddyConfigTag: Context.Tag<CaddyConfigTag, CaddyConfig> = Context.GenericTag<
  CaddyConfigTag,
  CaddyConfig
>("divban/CaddyConfig");
