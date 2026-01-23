// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Linger service using Context.Tag pattern.
 * Wraps all functions from src/system/linger.ts for dependency injection.
 * Works with isolatedDeclarations: true.
 */

import { Context, Layer } from "effect";
import {
  disableLinger,
  enableLinger,
  enableLingerTracked,
  ensureLinger,
  getLingeringUsers,
  isLingerEnabled,
} from "../linger";

/**
 * Linger service interface - provides user linger management via Effect DI.
 * Enables services to run without an active login session.
 */
export interface LingerService {
  readonly isLingerEnabled: typeof isLingerEnabled;
  readonly enableLinger: typeof enableLinger;
  readonly disableLinger: typeof disableLinger;
  readonly getLingeringUsers: typeof getLingeringUsers;
  readonly ensureLinger: typeof ensureLinger;
  // Tracked operations
  readonly enableLingerTracked: typeof enableLingerTracked;
}

/**
 * Linger service identifier for Effect dependency injection.
 */
export interface Linger {
  readonly _tag: "Linger";
}

/**
 * Linger context tag.
 * Use with `yield* Linger` to access the service in Effect generators.
 */
export const Linger: Context.Tag<Linger, LingerService> = Context.GenericTag<Linger, LingerService>(
  "divban/Linger"
);

/**
 * Linger live layer with all implementations.
 */
export const LingerLive: Layer.Layer<Linger> = Layer.succeed(Linger, {
  isLingerEnabled,
  enableLinger,
  disableLinger,
  getLingeringUsers,
  ensureLinger,
  // Tracked operations
  enableLingerTracked,
});
