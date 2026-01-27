// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Age encryption for secret backup using X25519 keys.
 * Age is chosen over GPG for simplicity (single-purpose tool, no keyring)
 * and security (modern cryptography, no legacy cipher support).
 * Uses FiloSottile's official age-encryption TypeScript library.
 */

import { Decrypter, Encrypter, generateIdentity, identityToRecipient } from "age-encryption";
import { Effect, Option, pipe } from "effect";
import { ErrorCode, GeneralError, type SystemError, errorMessage } from "../lib/errors";
import { parseKeyValue } from "../lib/file-parsers";
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
export const generateKeypair = (): Effect.Effect<AgeKeypair, GeneralError> =>
  Effect.tryPromise({
    try: async (): Promise<AgeKeypair> => {
      const identity = await generateIdentity();
      return {
        publicKey: await identityToRecipient(identity),
        secretKey: identity,
      };
    },
    catch: (e): GeneralError =>
      new GeneralError({
        code: ErrorCode.GENERAL_ERROR,
        message: `Failed to generate age keypair: ${errorMessage(e)}`,
        ...(e instanceof Error ? { cause: e } : {}),
      }),
  });

/**
 * Encrypt plaintext using an age public key.
 * Returns base64-encoded ciphertext for text-friendly storage.
 * Uses Bun's native Uint8Array.toBase64() extension.
 */
export const encrypt = (
  plaintext: string,
  publicKey: string
): Effect.Effect<string, GeneralError> =>
  Effect.tryPromise({
    try: async (): Promise<string> => {
      const enc = new Encrypter();
      enc.addRecipient(publicKey);
      const ciphertext = await enc.encrypt(plaintext);
      // Use Bun's native Uint8Array.toBase64() extension
      return new Uint8Array(ciphertext).toBase64();
    },
    catch: (e): GeneralError =>
      new GeneralError({
        code: ErrorCode.GENERAL_ERROR,
        message: `Failed to encrypt with age: ${errorMessage(e)}`,
        ...(e instanceof Error ? { cause: e } : {}),
      }),
  });

/**
 * Decrypt ciphertext using an age secret key.
 * Uses Bun's native Uint8Array.fromBase64() extension.
 */
export const decrypt = (
  ciphertext: string,
  secretKey: string
): Effect.Effect<string, GeneralError> =>
  Effect.tryPromise({
    try: async (): Promise<string> => {
      const dec = new Decrypter();
      dec.addIdentity(secretKey);
      // Use Bun's native Uint8Array.fromBase64() static method
      const ciphertextBytes = Uint8Array.fromBase64(ciphertext);
      const plaintext = await dec.decrypt(ciphertextBytes, "text");
      return plaintext;
    },
    catch: (e): GeneralError =>
      new GeneralError({
        code: ErrorCode.GENERAL_ERROR,
        message: `Failed to decrypt with age: ${errorMessage(e)}`,
        ...(e instanceof Error ? { cause: e } : {}),
      }),
  });

/**
 * Load existing keypair from file.
 */
const loadExistingKeypair = (
  keyPath: AbsolutePath
): Effect.Effect<AgeKeypair, SystemError | GeneralError> =>
  Effect.gen(function* () {
    const content = yield* readFile(keyPath);
    const secretKey = content.trim();
    return yield* Effect.tryPromise({
      try: async (): Promise<AgeKeypair> => ({
        publicKey: await identityToRecipient(secretKey),
        secretKey,
      }),
      catch: (e): GeneralError =>
        new GeneralError({
          code: ErrorCode.GENERAL_ERROR,
          message: `Failed to derive public key: ${errorMessage(e)}`,
          ...(e instanceof Error ? { cause: e } : {}),
        }),
    });
  });

/**
 * Load or generate an age keypair for a service.
 * Uses atomic exclusive create to prevent race condition overwrites.
 * Stores secret key in ~/.config/divban/.age/<service>.key with mode 0600.
 */
export const ensureKeypair = (
  keyPath: AbsolutePath
): Effect.Effect<AgeKeypair, SystemError | GeneralError> =>
  Effect.gen(function* () {
    const keypair = yield* generateKeypair();
    const created = yield* writeFileExclusive(keyPath, `${keypair.secretKey}\n`);

    return yield* Option.match(created, {
      onSome: (): Effect.Effect<AgeKeypair, SystemError | GeneralError> =>
        Effect.gen(function* () {
          yield* chmod(keyPath, "0600");
          return keypair;
        }),
      onNone: (): Effect.Effect<AgeKeypair, SystemError | GeneralError> =>
        loadExistingKeypair(keyPath),
    });
  });

/**
 * Encrypt secrets map to a file.
 */
export const encryptSecretsToFile = (
  secrets: Record<string, string>,
  publicKey: string,
  outputPath: AbsolutePath
): Effect.Effect<void, SystemError | GeneralError> =>
  Effect.gen(function* () {
    // Format as KEY=VALUE lines
    const plaintext = Object.entries(secrets)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    const ciphertext = yield* encrypt(plaintext, publicKey);
    yield* writeFile(outputPath, ciphertext);
  });

/**
 * Decrypt secrets from a file.
 */
export const decryptSecretsFromFile = (
  inputPath: AbsolutePath,
  secretKey: string
): Effect.Effect<Record<string, string>, SystemError | GeneralError> =>
  pipe(
    readFile(inputPath),
    Effect.map((content) => content.trim()),
    Effect.flatMap((ciphertext) => decrypt(ciphertext, secretKey)),
    Effect.map(parseKeyValue)
  );
