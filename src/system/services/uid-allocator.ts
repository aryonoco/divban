// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * UidAllocator service using Context.Tag pattern.
 * Wraps all functions from src/system/uid-allocator.ts for dependency injection.
 * Works with isolatedDeclarations: true.
 */

import { Context, Layer } from "effect";
import {
  SUBUID_RANGE,
  UID_RANGE,
  allocateSubuidRange,
  allocateUid,
  getExistingSubuidStart,
  getNologinShell,
  getUidByUsername,
  getUsedSubuidRanges,
  getUsedUids,
  userExists,
} from "../uid-allocator";

/**
 * UidAllocator service interface - provides UID/subuid allocation via Effect DI.
 * Dynamic UID and subuid allocation, cross-distribution compatible.
 */
export interface UidAllocatorService {
  // Range constants
  readonly UID_RANGE: typeof UID_RANGE;
  readonly SUBUID_RANGE: typeof SUBUID_RANGE;

  // Query functions
  readonly userExists: typeof userExists;
  readonly getUidByUsername: typeof getUidByUsername;
  readonly getNologinShell: typeof getNologinShell;
  readonly getUsedUids: typeof getUsedUids;
  readonly getUsedSubuidRanges: typeof getUsedSubuidRanges;
  readonly getExistingSubuidStart: typeof getExistingSubuidStart;

  // Allocation functions
  readonly allocateUid: typeof allocateUid;
  readonly allocateSubuidRange: typeof allocateSubuidRange;
}

/**
 * UidAllocator service identifier for Effect dependency injection.
 */
export interface UidAllocator {
  readonly _tag: "UidAllocator";
}

/**
 * UidAllocator context tag.
 * Use with `yield* UidAllocator` to access the service in Effect generators.
 */
export const UidAllocator: Context.Tag<UidAllocator, UidAllocatorService> = Context.GenericTag<
  UidAllocator,
  UidAllocatorService
>("divban/UidAllocator");

/**
 * UidAllocator live layer with all implementations.
 */
export const UidAllocatorLive: Layer.Layer<UidAllocator> = Layer.succeed(UidAllocator, {
  // Range constants
  UID_RANGE,
  SUBUID_RANGE,

  // Query functions
  userExists,
  getUidByUsername,
  getNologinShell,
  getUsedUids,
  getUsedSubuidRanges,
  getExistingSubuidStart,

  // Allocation functions
  allocateUid,
  allocateSubuidRange,
});
