// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Podman secrets integration for sensitive data. Secrets can be
 * mounted as files (/run/secrets/name) or injected as environment
 * variables. File mounts are preferred - they don't appear in
 * process listings and can have restricted permissions. Environment
 * secrets are convenient but visible in /proc/PID/environ.
 */

import { Option, pipe } from "effect";
import type { Entries } from "../entry";
import { fromArrayWith } from "../entry-combinators";
import type { SecretMount } from "../types";

export interface ContainerSecretsConfig {
  readonly secrets?: readonly SecretMount[] | undefined;
}

/**
 * Format a secret mount for quadlet.
 * Format: name[,type=mount|env][,target=path|envvar][,mode=0XXX]
 */
export const formatSecretMount = (secret: SecretMount): string => {
  const optionalParts = [
    pipe(
      Option.fromNullable(secret.type),
      Option.map((t) => `type=${t}`)
    ),
    pipe(
      Option.fromNullable(secret.target),
      Option.map((t) => `target=${t}`)
    ),
    pipe(
      Option.fromNullable(secret.mode),
      Option.map((m) => `mode=${m}`)
    ),
  ].flatMap(Option.toArray);

  return [secret.name, ...optionalParts].join(",");
};

export const getSecretEntries = (config: ContainerSecretsConfig): Entries =>
  fromArrayWith("Secret", config.secrets, formatSecretMount);

/**
 * Create a secret mounted as a file.
 */
export const createMountedSecret = (name: string, target?: string): SecretMount => ({
  name,
  type: "mount",
  target: target ?? `/run/secrets/${name}`,
});

/**
 * Create a secret injected as environment variable.
 */
export const createEnvSecret = (name: string, envVar: string): SecretMount => ({
  name,
  type: "env",
  target: envVar,
});

/**
 * Get the default mount path for a secret.
 */
export const getSecretMountPath = (secretName: string): string => `/run/secrets/${secretName}`;
