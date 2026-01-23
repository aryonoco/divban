// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** Uses Context.GenericTag for isolatedDeclarations: true compatibility. */

import { Context } from "effect";
import type { ImmichConfig } from "./schema";

export interface ImmichConfigTag {
  readonly _tag: "ImmichConfig";
}

export const ImmichConfigTag: Context.Tag<ImmichConfigTag, ImmichConfig> = Context.GenericTag<
  ImmichConfigTag,
  ImmichConfig
>("divban/ImmichConfig");
