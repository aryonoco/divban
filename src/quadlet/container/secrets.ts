// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Container secrets configuration for quadlet files.
 */

import type { SecretMount } from "../types";

export interface ContainerSecretsConfig {
  secrets?: SecretMount[] | undefined;
}

/**
 * Format a secret mount for quadlet.
 * Format: name[,type=mount|env][,target=path|envvar][,mode=0XXX]
 */
export const formatSecretMount = (secret: SecretMount): string => {
  const parts = [secret.name];
  if (secret.type !== undefined) {
    parts.push(`type=${secret.type}`);
  }
  if (secret.target !== undefined) {
    parts.push(`target=${secret.target}`);
  }
  if (secret.mode !== undefined) {
    parts.push(`mode=${secret.mode}`);
  }
  return parts.join(",");
};

/**
 * Add secret-related entries to a section.
 */
export const addSecretEntries = (
  entries: Array<{ key: string; value: string }>,
  config: ContainerSecretsConfig
): void => {
  if (!config.secrets) {
    return;
  }
  for (const secret of config.secrets) {
    entries.push({ key: "Secret", value: formatSecretMount(secret) });
  }
};

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
