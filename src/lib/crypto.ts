// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Cryptographic utilities for secure secret generation.
 *
 * Uses:
 * - Web Crypto API (crypto.getRandomValues) for secure random bytes - native in Bun
 * - Bun.CryptoHasher for cryptographic hashing when needed
 * - Bun's Uint8Array extensions (.toHex(), .toBase64()) for encoding
 *
 * Note: Bun.password.hash/verify are for password authentication (argon2/bcrypt),
 * not for generating random passwords. We need crypto.getRandomValues for that.
 */

/**
 * Character set for password generation.
 * Alphanumeric only - safe for env vars, shell, and all contexts.
 */
const PASSWORD_CHARSET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * Generate a cryptographically secure random password.
 * Uses rejection sampling to avoid modulo bias.
 *
 * @param length Password length (default: 32)
 * @returns Secure random password string
 */
export const generatePassword = (length = 32): string => {
  const charsetLength = PASSWORD_CHARSET.length;
  const maxValid = 256 - (256 % charsetLength); // Avoid modulo bias
  const result: string[] = [];

  while (result.length < length) {
    const randomBytes = new Uint8Array(length - result.length);
    crypto.getRandomValues(randomBytes);

    for (const byte of randomBytes) {
      if (byte < maxValid && result.length < length) {
        result.push(PASSWORD_CHARSET.charAt(byte % charsetLength));
      }
    }
  }

  return result.join("");
};

/**
 * Generate a cryptographically secure random hex string.
 * Uses Bun's Uint8Array.toHex() extension for optimal performance.
 *
 * @param bytes Number of random bytes (output is 2x this length)
 * @returns Hex-encoded random string
 */
export const generateHex = (bytes = 16): string => {
  const randomBytes = new Uint8Array(bytes);
  crypto.getRandomValues(randomBytes);
  // Use Bun's native Uint8Array.toHex() extension
  return randomBytes.toHex();
};

/**
 * Hash a string with SHA-256 using Bun.CryptoHasher.
 * Useful for deriving deterministic identifiers.
 */
export const sha256 = (data: string): string => {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(data);
  return hasher.digest("hex");
};
