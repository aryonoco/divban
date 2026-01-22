// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Archive service using Context.Tag pattern.
 * Wraps all functions from src/system/archive.ts for dependency injection.
 * Works with isolatedDeclarations: true.
 */

import { Context, Layer } from "effect";
import {
  createArchive,
  createArchiveFromDirectory,
  extractArchive,
  extractArchiveToDirectory,
  listArchive,
  readArchiveMetadata,
} from "../archive";

/**
 * Archive service interface - provides tar archive operations via Effect DI.
 * Uses Bun's native Archive API - no external tar commands.
 */
export interface ArchiveService {
  readonly createArchive: typeof createArchive;
  readonly createArchiveFromDirectory: typeof createArchiveFromDirectory;
  readonly extractArchive: typeof extractArchive;
  readonly extractArchiveToDirectory: typeof extractArchiveToDirectory;
  readonly listArchive: typeof listArchive;
  readonly readArchiveMetadata: typeof readArchiveMetadata;
}

/**
 * Archive tag identifier type.
 * Used in Effect's R type parameter to track this dependency.
 */
export interface Archive {
  readonly _tag: "Archive";
}

/**
 * Archive context tag.
 * Use with `yield* Archive` to access the service in Effect generators.
 */
export const Archive: Context.Tag<Archive, ArchiveService> = Context.GenericTag<
  Archive,
  ArchiveService
>("divban/Archive");

/**
 * Archive live layer with all implementations.
 */
export const ArchiveLive: Layer.Layer<Archive> = Layer.succeed(Archive, {
  createArchive,
  createArchiveFromDirectory,
  extractArchive,
  extractArchiveToDirectory,
  listArchive,
  readArchiveMetadata,
});
