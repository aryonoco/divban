// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Secret management for divban services.
 * Handles generation, podman secret creation, and encrypted backup.
 */

import { generatePassword } from "../lib/crypto";
import { DivbanError, ErrorCode } from "../lib/errors";
import { fromUndefined } from "../lib/option";
import { userConfigDir } from "../lib/paths";
import { Err, Ok, type Result, flatMapResult, mapResult } from "../lib/result";
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
export const podmanSecretExists = async (
  secretName: string,
  user: Username,
  uid: number
): Promise<Result<boolean, DivbanError>> =>
  mapResult(
    await execAsUser(user, uid, ["podman", "secret", "exists", secretName]),
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
const createPodmanSecret = async (
  secretName: string,
  value: string,
  user: Username,
  uid: number
): Promise<Result<void, DivbanError>> => {
  // Use printf and pipe to pass secret value - more reliable than stdin option with sudo
  const escapedValue = shellEscape(value);
  const escapedName = shellEscape(secretName);
  const result = await shellAsUser(
    user,
    uid,
    `printf '%s' ${escapedValue} | podman secret create ${escapedName} -`
  );

  if (!result.ok) {
    return result;
  }

  // Use flatMapResult for clean recovery logic
  return flatMapResult(result, (output) => {
    if (output.exitCode === 0) {
      return Ok(undefined);
    }
    // Recover if secret already exists (idempotent)
    if (isSecretExistsError(output.stderr)) {
      return Ok(undefined);
    }
    return Err(
      new DivbanError(
        ErrorCode.GENERAL_ERROR,
        `Failed to create podman secret ${secretName}: ${output.stderr}`
      )
    );
  });
};

/**
 * Ensure all secrets exist for a service.
 * - Generates new secrets if they don't exist
 * - Reuses existing secrets if they do (idempotent)
 * - Creates age-encrypted backup
 * - Creates podman secrets
 */
export const ensureServiceSecrets = async (
  serviceName: ServiceName,
  definitions: readonly SecretDefinition[],
  homeDir: AbsolutePath,
  user: Username,
  uid: number,
  gid: number
): Promise<Result<ServiceSecrets, DivbanError>> => {
  const paths = getSecretPaths(homeDir, serviceName);
  const owner = { uid: uid as UserId, gid: gid as GroupId };

  // Ensure age key directory exists
  const dirResult = await ensureDirectory(paths.ageKeyDir, owner, "0700");
  if (!dirResult.ok) {
    return dirResult;
  }

  // Ensure age keypair exists
  const keypairResult = await ensureKeypair(paths.ageKeyPath);
  if (!keypairResult.ok) {
    return keypairResult;
  }
  const keypair = keypairResult.value;

  // Check if we have existing encrypted secrets
  const hasBackup = await fileExists(paths.secretsBackupPath);
  let existingSecrets: Record<string, string> = {};

  if (hasBackup) {
    const decryptResult = await decryptSecretsFromFile(paths.secretsBackupPath, keypair.secretKey);
    if (decryptResult.ok) {
      existingSecrets = decryptResult.value;
    }
    // If decryption fails, we'll regenerate secrets
  }

  // Generate or reuse secrets
  const secrets: Record<string, string> = {};
  for (const def of definitions) {
    const podmanName = getPodmanSecretName(serviceName, def.name);

    // Check if podman secret already exists
    const existsResult = await podmanSecretExists(podmanName, user, uid);
    if (!existsResult.ok) {
      return existsResult;
    }

    const existingValueOpt = fromUndefined(existingSecrets[def.name]);
    if (existsResult.value && existingValueOpt.isSome) {
      // Reuse existing secret
      secrets[def.name] = existingValueOpt.value;
    } else {
      // Generate new secret
      const value = existingValueOpt.isSome
        ? existingValueOpt.value
        : generatePassword(def.length ?? 32);
      secrets[def.name] = value;

      // Create podman secret if it doesn't exist
      if (!existsResult.value) {
        const createResult = await createPodmanSecret(podmanName, value, user, uid);
        if (!createResult.ok) {
          return createResult;
        }
      }
    }
  }

  // Write encrypted backup
  const backupResult = await encryptSecretsToFile(
    secrets,
    keypair.publicKey,
    paths.secretsBackupPath
  );
  if (!backupResult.ok) {
    return backupResult;
  }

  return Ok({ values: secrets, keypair });
};

/**
 * Get a secret value for display.
 * Decrypts from the backup file.
 */
export const getServiceSecret = async (
  serviceName: ServiceName,
  secretName: string,
  homeDir: AbsolutePath
): Promise<Result<string, DivbanError>> => {
  const paths = getSecretPaths(homeDir, serviceName);

  // Read secret key
  const keypairResult = await ensureKeypair(paths.ageKeyPath);
  if (!keypairResult.ok) {
    return Err(new DivbanError(ErrorCode.GENERAL_ERROR, `No secrets found for ${serviceName}`));
  }

  // Decrypt secrets
  const secretsResult = await decryptSecretsFromFile(
    paths.secretsBackupPath,
    keypairResult.value.secretKey
  );
  if (!secretsResult.ok) {
    return secretsResult;
  }

  const value = secretsResult.value[secretName];
  if (!value) {
    return Err(new DivbanError(ErrorCode.GENERAL_ERROR, `Secret '${secretName}' not found`));
  }

  return Ok(value);
};

/**
 * List available secrets for a service.
 */
export const listServiceSecrets = async (
  serviceName: ServiceName,
  homeDir: AbsolutePath
): Promise<Result<string[], DivbanError>> => {
  const paths = getSecretPaths(homeDir, serviceName);

  const keypairResult = await ensureKeypair(paths.ageKeyPath);
  if (!keypairResult.ok) {
    return Err(new DivbanError(ErrorCode.GENERAL_ERROR, `No secrets found for ${serviceName}`));
  }

  const secretsResult = await decryptSecretsFromFile(
    paths.secretsBackupPath,
    keypairResult.value.secretKey
  );
  if (!secretsResult.ok) {
    return secretsResult;
  }

  return Ok(Object.keys(secretsResult.value));
};
