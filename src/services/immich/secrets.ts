// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { SecretDefinition } from "../../system/secrets";

export const IMMICH_SECRETS: readonly SecretDefinition[] = [
  {
    name: "db-password",
    description: "PostgreSQL database password",
    length: 32,
  },
] as const;

export const ImmichSecretNames = {
  DB_PASSWORD: "db-password",
} as const;
