// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Secret management using Effect for error handling.
 * Handles generation, podman secret creation, and encrypted backup.
 */

import { Effect } from "effect";
import { generatePassword } from "../lib/crypto";
import { ContainerError, ErrorCode, type GeneralError, type SystemError } from "../lib/errors";
import { userConfigDir } from "../lib/paths";
import type { AbsolutePath, GroupId, ServiceName, UserId, Username } from "../lib/types";
import { pathJoin } from "../lib/types";
import {
  type AgeKeypair,
  decryptSecretsFromFile,
  encryptSecretsToFile,
  ensureKeypair,
} from "./age";
import { ensureDirectory } from "./directories";
import { execAsUser, shellAsUser, shellEscape } from "./exec";
import { fileExists } from "./fs";

/**
 * Secret definition for a service.
 */
export interface SecretDefinition {
  /** Secret name (e.g., "db-password") */
  name: string;
  /** Description for logging */
  description: string;
  /** Password length (default: 32) */
  length?: number | undefined;
}

/**
 * Generated secrets for a service.
 */
export interface ServiceSecrets {
  /** Map of secret name to value */
  values: Record<string, string>;
  /** Age keypair used for encryption */
  keypair: AgeKeypair;
}

/**
 * Paths for secret storage.
 */
interface SecretPaths {
  ageKeyDir: AbsolutePath;
  ageKeyPath: AbsolutePath;
  secretsBackupPath: AbsolutePath;
}

/**
 * Get paths for secret storage.
 */
const getSecretPaths = (homeDir: AbsolutePath, serviceName: ServiceName): SecretPaths => {
  const configDir = userConfigDir(homeDir);
  return {
    ageKeyDir: pathJoin(configDir, ".age"),
    ageKeyPath: pathJoin(configDir, ".age", `${serviceName}.key`),
    secretsBackupPath: pathJoin(configDir, `${serviceName}.secrets.age`),
  };
};

/**
 * Get the podman secret name for a service secret.
 */
export const getPodmanSecretName = (serviceName: ServiceName, secretName: string): string =>
  `divban-${serviceName}-${secretName}`;

/**
 * Check if a podman secret exists.
 */
export const podmanSecretExists = (
  secretName: string,
  user: Username,
  uid: number
): Effect.Effect<boolean, SystemError | GeneralError> =>
  Effect.map(
    execAsUser(user, uid, ["podman", "secret", "exists", secretName]),
    (r) => r.exitCode === 0
  );

/**
 * Check if error indicates secret already exists.
 */
const isSecretExistsError = (stderr: string): boolean => stderr.includes("already exists");

/**
 * Create a podman secret from a value.
 * Uses shell piping to pass secret value through stdin.
 * Treats "already exists" as success (idempotent).
 */
const createPodmanSecret = (
  secretName: string,
  value: string,
  user: Username,
  uid: number
): Effect.Effect<void, SystemError | ContainerError> =>
  Effect.gen(function* () {
    // Use printf and pipe to pass secret value - more reliable than stdin option with sudo
    const escapedValue = shellEscape(value);
    const escapedName = shellEscape(secretName);
    const result = yield* shellAsUser(
      user,
      uid,
      `printf '%s' ${escapedValue} | podman secret create ${escapedName} -`
    );

    if (result.exitCode === 0) {
      return;
    }

    // Recover if secret already exists (idempotent)
    if (isSecretExistsError(result.stderr)) {
      return;
    }

    return yield* Effect.fail(
      new ContainerError({
        code: ErrorCode.SECRET_ERROR as 45,
        message: `Failed to create podman secret ${secretName}: ${result.stderr}`,
      })
    );
  });

/**
 * Ensure all secrets exist for a service.
 * - Generates new secrets if they don't exist
 * - Reuses existing secrets if they do (idempotent)
 * - Creates age-encrypted backup
 * - Creates podman secrets
 */
export const ensureServiceSecrets = (
  serviceName: ServiceName,
  definitions: readonly SecretDefinition[],
  homeDir: AbsolutePath,
  user: Username,
  uid: number,
  gid: number
): Effect.Effect<ServiceSecrets, SystemError | GeneralError | ContainerError> =>
  Effect.gen(function* () {
    const paths = getSecretPaths(homeDir, serviceName);
    const owner = { uid: uid as UserId, gid: gid as GroupId };

    // Ensure age key directory exists
    yield* ensureDirectory(paths.ageKeyDir, owner, "0700");

    // Ensure age keypair exists
    const keypair = yield* ensureKeypair(paths.ageKeyPath);

    // Check if we have existing encrypted secrets
    const hasBackup = yield* fileExists(paths.secretsBackupPath);
    let existingSecrets: Record<string, string> = {};

    if (hasBackup) {
      const decryptResult = yield* Effect.either(
        decryptSecretsFromFile(paths.secretsBackupPath, keypair.secretKey)
      );
      if (decryptResult._tag === "Right") {
        existingSecrets = decryptResult.right;
      }
      // If decryption fails, we'll regenerate secrets
    }

    // Generate or reuse secrets
    const secrets: Record<string, string> = {};
    for (const def of definitions) {
      const podmanName = getPodmanSecretName(serviceName, def.name);

      // Check if podman secret already exists
      const secretExists = yield* podmanSecretExists(podmanName, user, uid);

      const existingValue = existingSecrets[def.name];
      if (secretExists && existingValue !== undefined) {
        // Reuse existing secret
        secrets[def.name] = existingValue;
      } else {
        // Generate new secret or use existing backup value
        const value = existingValue ?? generatePassword(def.length ?? 32);
        secrets[def.name] = value;

        // Create podman secret if it doesn't exist
        if (!secretExists) {
          yield* createPodmanSecret(podmanName, value, user, uid);
        }
      }
    }

    // Write encrypted backup
    yield* encryptSecretsToFile(secrets, keypair.publicKey, paths.secretsBackupPath);

    return { values: secrets, keypair };
  });

/**
 * Get a secret value for display.
 * Decrypts from the backup file.
 */
export const getServiceSecret = (
  serviceName: ServiceName,
  secretName: string,
  homeDir: AbsolutePath
): Effect.Effect<string, SystemError | GeneralError | ContainerError> =>
  Effect.gen(function* () {
    const paths = getSecretPaths(homeDir, serviceName);

    // Read secret key
    const keypairResult = yield* Effect.either(ensureKeypair(paths.ageKeyPath));
    if (keypairResult._tag === "Left") {
      return yield* Effect.fail(
        new ContainerError({
          code: ErrorCode.SECRET_NOT_FOUND as 46,
          message: `No secrets found for ${serviceName}`,
        })
      );
    }

    // Decrypt secrets
    const secrets = yield* decryptSecretsFromFile(
      paths.secretsBackupPath,
      keypairResult.right.secretKey
    );

    const value = secrets[secretName];
    if (value === undefined) {
      return yield* Effect.fail(
        new ContainerError({
          code: ErrorCode.SECRET_NOT_FOUND as 46,
          message: `Secret '${secretName}' not found`,
        })
      );
    }

    return value;
  });

/**
 * List available secrets for a service.
 */
export const listServiceSecrets = (
  serviceName: ServiceName,
  homeDir: AbsolutePath
): Effect.Effect<string[], SystemError | GeneralError | ContainerError> =>
  Effect.gen(function* () {
    const paths = getSecretPaths(homeDir, serviceName);

    const keypairResult = yield* Effect.either(ensureKeypair(paths.ageKeyPath));
    if (keypairResult._tag === "Left") {
      return yield* Effect.fail(
        new ContainerError({
          code: ErrorCode.SECRET_NOT_FOUND as 46,
          message: `No secrets found for ${serviceName}`,
        })
      );
    }

    const secrets = yield* decryptSecretsFromFile(
      paths.secretsBackupPath,
      keypairResult.right.secretKey
    );

    return Object.keys(secrets);
  });
