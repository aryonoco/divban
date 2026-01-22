// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Lock service using Context.Tag pattern.
 * Wraps the withLock function from src/system/lock.ts for dependency injection.
 * Works with isolatedDeclarations: true.
 */

import { Context, Layer } from "effect";
import { withLock } from "../lock";

/**
 * Lock service interface - provides file-based locking via Effect DI.
 * Uses O_EXCL (via writeFileExclusive) for atomic lock acquisition.
 */
export interface LockService {
  readonly withLock: typeof withLock;
}

/**
 * Lock tag identifier type.
 * Used in Effect's R type parameter to track this dependency.
 */
export interface Lock {
  readonly _tag: "Lock";
}

/**
 * Lock context tag.
 * Use with `yield* Lock` to access the service in Effect generators.
 */
export const Lock: Context.Tag<Lock, LockService> = Context.GenericTag<Lock, LockService>(
  "divban/Lock"
);

/**
 * Lock live layer with all implementations.
 */
export const LockLive: Layer.Layer<Lock> = Layer.succeed(Lock, {
  withLock,
});
