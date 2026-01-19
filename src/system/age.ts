// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Age encryption utilities for secret backup/recovery.
 * Uses age-encryption (FiloSottile's official TypeScript implementation).
 */

import { Decrypter, Encrypter, generateIdentity, identityToRecipient } from "age-encryption";
import type { DivbanError } from "../lib/errors";
import { ErrorCode, wrapError } from "../lib/errors";
import { isSome } from "../lib/option";
import { Ok, type Result, asyncFlatMapResult, tryCatch } from "../lib/result";
import type { AbsolutePath } from "../lib/types";
import { chmod } from "./directories";
import { readFile, writeFile, writeFileExclusive } from "./fs";

/**
 * Age keypair (public key for encryption, secret key for decryption).
 */
export interface AgeKeypair {
  /** Public key (age1...) for encryption */
  publicKey: string;
  /** Secret key (AGE-SECRET-KEY-...) for decryption */
  secretKey: string;
}

/**
 * Generate a new age X25519 keypair.
 */
export const generateKeypair = async (): Promise<Result<AgeKeypair, DivbanError>> =>
  tryCatch(
    async () => {
      const identity = await generateIdentity();
      return {
        publicKey: await identityToRecipient(identity),
        secretKey: identity,
      };
    },
    (e) => wrapError(e, ErrorCode.GENERAL_ERROR, "Failed to generate age keypair")
  );

/**
 * Encrypt plaintext using an age public key.
 * Returns base64-encoded ciphertext for text-friendly storage.
 * Uses Bun's native Uint8Array.toBase64() extension.
 */
export const encrypt = async (
  plaintext: string,
  publicKey: string
): Promise<Result<string, DivbanError>> =>
  tryCatch(
    async () => {
      const enc = new Encrypter();
      enc.addRecipient(publicKey);
      const ciphertext = await enc.encrypt(plaintext);
      // Use Bun's native Uint8Array.toBase64() extension
      return new Uint8Array(ciphertext).toBase64();
    },
    (e) => wrapError(e, ErrorCode.GENERAL_ERROR, "Failed to encrypt with age")
  );

/**
 * Decrypt ciphertext using an age secret key.
 * Uses Bun's native Uint8Array.fromBase64() extension.
 */
export const decrypt = async (
  ciphertext: string,
  secretKey: string
): Promise<Result<string, DivbanError>> =>
  tryCatch(
    async () => {
      const dec = new Decrypter();
      dec.addIdentity(secretKey);
      // Use Bun's native Uint8Array.fromBase64() static method
      const ciphertextBytes = Uint8Array.fromBase64(ciphertext);
      const plaintext = await dec.decrypt(ciphertextBytes, "text");
      return plaintext;
    },
    (e) => wrapError(e, ErrorCode.GENERAL_ERROR, "Failed to decrypt with age")
  );

/**
 * Load existing keypair from file.
 */
const loadExistingKeypair = async (
  keyPath: AbsolutePath
): Promise<Result<AgeKeypair, DivbanError>> =>
  asyncFlatMapResult(await readFile(keyPath), (content) =>
    tryCatch(
      async () => {
        const secretKey = content.trim();
        return { publicKey: await identityToRecipient(secretKey), secretKey };
      },
      (e) => wrapError(e, ErrorCode.GENERAL_ERROR, "Failed to derive public key")
    )
  );

/**
 * Load or generate an age keypair for a service.
 * Uses atomic exclusive create to prevent race condition overwrites.
 * Stores secret key in ~/.config/divban/.age/<service>.key with mode 0600.
 */
export const ensureKeypair = async (
  keyPath: AbsolutePath
): Promise<Result<AgeKeypair, DivbanError>> =>
  asyncFlatMapResult(await generateKeypair(), async (keypair) =>
    asyncFlatMapResult(
      await writeFileExclusive(keyPath, `${keypair.secretKey}\n`),
      async (created) =>
        isSome(created)
          ? asyncFlatMapResult(await chmod(keyPath, "0600"), () => Promise.resolve(Ok(keypair)))
          : loadExistingKeypair(keyPath)
    )
  );

/**
 * Encrypt secrets map to a file.
 */
export const encryptSecretsToFile = async (
  secrets: Record<string, string>,
  publicKey: string,
  outputPath: AbsolutePath
): Promise<Result<void, DivbanError>> => {
  // Format as KEY=VALUE lines
  const plaintext = Object.entries(secrets)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const encryptResult = await encrypt(plaintext, publicKey);
  if (!encryptResult.ok) {
    return encryptResult;
  }

  return writeFile(outputPath, encryptResult.value);
};

/**
 * Decrypt secrets from a file.
 */
export const decryptSecretsFromFile = async (
  inputPath: AbsolutePath,
  secretKey: string
): Promise<Result<Record<string, string>, DivbanError>> => {
  const readResult = await readFile(inputPath);
  if (!readResult.ok) {
    return readResult;
  }

  const decryptResult = await decrypt(readResult.value.trim(), secretKey);
  if (!decryptResult.ok) {
    return decryptResult;
  }

  // Parse KEY=VALUE lines
  const secrets: Record<string, string> = {};
  for (const line of decryptResult.value.split("\n")) {
    const eqIndex = line.indexOf("=");
    if (eqIndex > 0) {
      const key = line.slice(0, eqIndex);
      const value = line.slice(eqIndex + 1);
      secrets[key] = value;
    }
  }

  return Ok(secrets);
};
