// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Directory service using Context.Tag pattern.
 * Wraps all functions from src/system/directories.ts for dependency injection.
 * Works with isolatedDeclarations: true.
 */

import { Context, Layer } from "effect";
import {
  chmod,
  chown,
  ensureDirectories,
  ensureDirectoriesTracked,
  ensureDirectory,
  ensureServiceDirectories,
  ensureServiceDirectoriesTracked,
  getServiceDirectories,
  removeDirectoriesReverse,
  removeDirectory,
} from "../directories";

/**
 * Directory service interface - provides directory management via Effect DI.
 */
export interface DirectoryService {
  readonly ensureDirectory: typeof ensureDirectory;
  readonly ensureDirectories: typeof ensureDirectories;
  readonly chown: typeof chown;
  readonly chmod: typeof chmod;
  readonly getServiceDirectories: typeof getServiceDirectories;
  readonly ensureServiceDirectories: typeof ensureServiceDirectories;
  readonly removeDirectory: typeof removeDirectory;
  // Tracked operations
  readonly ensureDirectoriesTracked: typeof ensureDirectoriesTracked;
  readonly removeDirectoriesReverse: typeof removeDirectoriesReverse;
  readonly ensureServiceDirectoriesTracked: typeof ensureServiceDirectoriesTracked;
}

/**
 * Directory tag identifier type.
 * Used in Effect's R type parameter to track this dependency.
 */
export interface Directory {
  readonly _tag: "Directory";
}

/**
 * Directory context tag.
 * Use with `yield* Directory` to access the service in Effect generators.
 */
export const Directory: Context.Tag<Directory, DirectoryService> = Context.GenericTag<
  Directory,
  DirectoryService
>("divban/Directory");

/**
 * Directory live layer with all implementations.
 */
export const DirectoryLive: Layer.Layer<Directory> = Layer.succeed(Directory, {
  ensureDirectory,
  ensureDirectories,
  chown,
  chmod,
  getServiceDirectories,
  ensureServiceDirectories,
  removeDirectory,
  // Tracked operations
  ensureDirectoriesTracked,
  removeDirectoriesReverse,
  ensureServiceDirectoriesTracked,
});
