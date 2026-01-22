// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * FileSystem service using Context.Tag pattern.
 * Wraps all functions from src/system/fs.ts for dependency injection.
 * Works with isolatedDeclarations: true.
 */

import { Context, Layer } from "effect";
import {
  appendFile,
  atomicWrite,
  backupFile,
  copyFile,
  createFileWriter,
  deleteDirectory,
  deleteFile,
  deleteFileIfExists,
  directoryExists,
  ensureDirectory,
  fileExists,
  filesEqual,
  getFileSize,
  globFiles,
  globMatch,
  hashContent,
  hashContentWith,
  hashFile,
  isDirectory,
  listDirectory,
  objectsEqual,
  readBytes,
  readFile,
  readFileOrEmpty,
  readLines,
  renameFile,
  sha256File,
  watchFile,
  writeBytes,
  writeFile,
  writeFileExclusive,
} from "../fs";

/**
 * FileSystem service interface - provides filesystem operations via Effect DI.
 * Base service with no dependencies.
 */
export interface FileSystemService {
  // Core read operations
  readonly readFile: typeof readFile;
  readonly readLines: typeof readLines;
  readonly readBytes: typeof readBytes;
  readonly readFileOrEmpty: typeof readFileOrEmpty;

  // Core write operations
  readonly writeFile: typeof writeFile;
  readonly writeBytes: typeof writeBytes;
  readonly writeFileExclusive: typeof writeFileExclusive;
  readonly appendFile: typeof appendFile;
  readonly atomicWrite: typeof atomicWrite;
  readonly createFileWriter: typeof createFileWriter;

  // Existence/info checks
  readonly fileExists: typeof fileExists;
  readonly directoryExists: typeof directoryExists;
  readonly isDirectory: typeof isDirectory;
  readonly getFileSize: typeof getFileSize;

  // File operations
  readonly copyFile: typeof copyFile;
  readonly renameFile: typeof renameFile;
  readonly deleteFile: typeof deleteFile;
  readonly deleteFileIfExists: typeof deleteFileIfExists;
  readonly deleteDirectory: typeof deleteDirectory;
  readonly backupFile: typeof backupFile;
  readonly filesEqual: typeof filesEqual;

  // Directory operations
  readonly ensureDirectory: typeof ensureDirectory;
  readonly listDirectory: typeof listDirectory;

  // Glob operations
  readonly globFiles: typeof globFiles;
  readonly globMatch: typeof globMatch;

  // Hashing
  readonly hashFile: typeof hashFile;
  readonly hashContent: typeof hashContent;
  readonly hashContentWith: typeof hashContentWith;
  readonly sha256File: typeof sha256File;

  // Utilities
  readonly objectsEqual: typeof objectsEqual;
  readonly watchFile: typeof watchFile;
}

/**
 * FileSystem tag identifier type.
 * Used in Effect's R type parameter to track this dependency.
 */
export interface FileSystem {
  readonly _tag: "FileSystem";
}

/**
 * FileSystem context tag.
 * Use with `yield* FileSystem` to access the service in Effect generators.
 */
export const FileSystem: Context.Tag<FileSystem, FileSystemService> = Context.GenericTag<
  FileSystem,
  FileSystemService
>("divban/FileSystem");

/**
 * FileSystem live layer with all implementations.
 */
export const FileSystemLive: Layer.Layer<FileSystem> = Layer.succeed(FileSystem, {
  // Core read operations
  readFile,
  readLines,
  readBytes,
  readFileOrEmpty,

  // Core write operations
  writeFile,
  writeBytes,
  writeFileExclusive,
  appendFile,
  atomicWrite,
  createFileWriter,

  // Existence/info checks
  fileExists,
  directoryExists,
  isDirectory,
  getFileSize,

  // File operations
  copyFile,
  renameFile,
  deleteFile,
  deleteFileIfExists,
  deleteDirectory,
  backupFile,
  filesEqual,

  // Directory operations
  ensureDirectory,
  listDirectory,

  // Glob operations
  globFiles,
  globMatch,

  // Hashing
  hashFile,
  hashContent,
  hashContentWith,
  sha256File,

  // Utilities
  objectsEqual,
  watchFile,
});
