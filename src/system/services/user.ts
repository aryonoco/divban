// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * UserService using Context.Tag pattern.
 * Wraps all functions from src/system/user.ts for dependency injection.
 * Works with isolatedDeclarations: true.
 */

import { Context, Layer } from "effect";
import {
  acquireServiceUser,
  configureSubordinateIds,
  createServiceUser,
  deleteServiceUser,
  getServiceUser,
  getUserByName,
  isRoot,
  releaseServiceUser,
  requireRoot,
} from "../user";

/**
 * UserService interface - provides user management via Effect DI.
 * Creates isolated users with proper subuid/subgid configuration.
 */
export interface UserServiceInterface {
  readonly configureSubordinateIds: typeof configureSubordinateIds;
  readonly createServiceUser: typeof createServiceUser;
  readonly deleteServiceUser: typeof deleteServiceUser;
  readonly getServiceUser: typeof getServiceUser;
  readonly getUserByName: typeof getUserByName;
  readonly isRoot: typeof isRoot;
  readonly requireRoot: typeof requireRoot;
  // Tracked operations
  readonly acquireServiceUser: typeof acquireServiceUser;
  readonly releaseServiceUser: typeof releaseServiceUser;
}

/**
 * UserService service identifier for Effect dependency injection.
 */
export interface UserService {
  readonly _tag: "UserService";
}

/**
 * UserService context tag.
 * Use with `yield* UserService` to access the service in Effect generators.
 */
export const UserService: Context.Tag<UserService, UserServiceInterface> = Context.GenericTag<
  UserService,
  UserServiceInterface
>("divban/UserService");

/**
 * UserService live layer with all implementations.
 */
export const UserServiceLive: Layer.Layer<UserService> = Layer.succeed(UserService, {
  configureSubordinateIds,
  createServiceUser,
  deleteServiceUser,
  getServiceUser,
  getUserByName,
  isRoot,
  requireRoot,
  // Tracked operations
  acquireServiceUser,
  releaseServiceUser,
});
