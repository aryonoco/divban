// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Secrets service using Context.Tag pattern.
 * Wraps all functions from src/system/secrets.ts for dependency injection.
 * Works with isolatedDeclarations: true.
 */

import { Context, Layer } from "effect";
import {
  deletePodmanSecrets,
  ensureServiceSecrets,
  ensureServiceSecretsTracked,
  getPodmanSecretName,
  getServiceSecret,
  listServiceSecrets,
  podmanSecretExists,
} from "../secrets";

/**
 * Secrets service interface - provides secret management via Effect DI.
 * Handles generation, podman secret creation, and encrypted backup.
 */
export interface SecretsService {
  readonly getPodmanSecretName: typeof getPodmanSecretName;
  readonly podmanSecretExists: typeof podmanSecretExists;
  readonly ensureServiceSecrets: typeof ensureServiceSecrets;
  readonly getServiceSecret: typeof getServiceSecret;
  readonly listServiceSecrets: typeof listServiceSecrets;
  // Tracked operations
  readonly ensureServiceSecretsTracked: typeof ensureServiceSecretsTracked;
  readonly deletePodmanSecrets: typeof deletePodmanSecrets;
}

/**
 * Secrets tag identifier type.
 * Used in Effect's R type parameter to track this dependency.
 */
export interface Secrets {
  readonly _tag: "Secrets";
}

/**
 * Secrets context tag.
 * Use with `yield* Secrets` to access the service in Effect generators.
 */
export const Secrets: Context.Tag<Secrets, SecretsService> = Context.GenericTag<
  Secrets,
  SecretsService
>("divban/Secrets");

/**
 * Secrets live layer with all implementations.
 */
export const SecretsLive: Layer.Layer<Secrets> = Layer.succeed(Secrets, {
  getPodmanSecretName,
  podmanSecretExists,
  ensureServiceSecrets,
  getServiceSecret,
  listServiceSecrets,
  // Tracked operations
  ensureServiceSecretsTracked,
  deletePodmanSecrets,
});
