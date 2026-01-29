// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Option, pipe } from "effect";

export interface ConfigField<A> {
  readonly cli: Option.Option<A>;
  readonly env: Option.Option<A>;
  readonly toml: A;
}

export const resolve = <A>(field: ConfigField<A>): A =>
  pipe(
    field.cli,
    Option.orElse(() => field.env),
    Option.getOrElse(() => field.toml)
  );
