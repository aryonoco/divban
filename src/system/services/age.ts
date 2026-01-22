// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Age service using Context.Tag pattern.
 * Wraps all functions from src/system/age.ts for dependency injection.
 * Works with isolatedDeclarations: true.
 */

import { Context, Layer } from "effect";
import {
  decrypt,
  decryptSecretsFromFile,
  encrypt,
  encryptSecretsToFile,
  ensureKeypair,
  generateKeypair,
} from "../age";

/**
 * Age service interface - provides age encryption utilities via Effect DI.
 * Uses age-encryption (FiloSottile's official TypeScript implementation).
 */
export interface AgeService {
  readonly generateKeypair: typeof generateKeypair;
  readonly encrypt: typeof encrypt;
  readonly decrypt: typeof decrypt;
  readonly ensureKeypair: typeof ensureKeypair;
  readonly encryptSecretsToFile: typeof encryptSecretsToFile;
  readonly decryptSecretsFromFile: typeof decryptSecretsFromFile;
}

/**
 * Age tag identifier type.
 * Used in Effect's R type parameter to track this dependency.
 */
export interface Age {
  readonly _tag: "Age";
}

/**
 * Age context tag.
 * Use with `yield* Age` to access the service in Effect generators.
 */
export const Age: Context.Tag<Age, AgeService> = Context.GenericTag<Age, AgeService>("divban/Age");

/**
 * Age live layer with all implementations.
 */
export const AgeLive: Layer.Layer<Age> = Layer.succeed(Age, {
  generateKeypair,
  encrypt,
  decrypt,
  ensureKeypair,
  encryptSecretsToFile,
  decryptSecretsFromFile,
});
