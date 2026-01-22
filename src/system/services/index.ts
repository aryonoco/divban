// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * System services index - re-exports all Context.Tag service wrappers.
 * Provides a composed layer with all system services for convenient importing.
 */

import { Layer } from "effect";
import { type Age, AgeLive } from "./age";
import { type Archive, ArchiveLive } from "./archive";
import { type Compress, CompressLive } from "./compress";
import { type Directory, DirectoryLive } from "./directory";
import { type CommandExecutor, CommandExecutorLive } from "./executor";
import { type FileSystem, FileSystemLive } from "./filesystem";
import { type Linger, LingerLive } from "./linger";
import { type Lock, LockLive } from "./lock";
import { type Secrets, SecretsLive } from "./secrets";
import { type SELinux, SELinuxLive } from "./selinux";
import { type Sysctl, SysctlLive } from "./sysctl";
import { type SystemCtl, SystemCtlLive } from "./systemctl";
import { type UidAllocator, UidAllocatorLive } from "./uid-allocator";
import { type UserService, UserServiceLive } from "./user";

// Re-export all services for convenient importing
export { Age, type AgeService, AgeLive } from "./age";
export { Archive, type ArchiveService, ArchiveLive } from "./archive";
export { CommandExecutor, type CommandExecutorService, CommandExecutorLive } from "./executor";
export { Compress, type CompressService, CompressLive } from "./compress";
export { Directory, type DirectoryService, DirectoryLive } from "./directory";
export { FileSystem, type FileSystemService, FileSystemLive } from "./filesystem";
export { Linger, type LingerService, LingerLive } from "./linger";
export { Lock, type LockService, LockLive } from "./lock";
export { Secrets, type SecretsService, SecretsLive } from "./secrets";
export { SELinux, type SELinuxService, SELinuxLive } from "./selinux";
export { Sysctl, type SysctlService, SysctlLive } from "./sysctl";
export { SystemCtl, type SystemCtlService, SystemCtlLive } from "./systemctl";
export { UidAllocator, type UidAllocatorService, UidAllocatorLive } from "./uid-allocator";
export { UserService, type UserServiceInterface, UserServiceLive } from "./user";

/**
 * Composed layer with all system services.
 * Layer memoization prevents duplicate construction automatically.
 *
 * Usage:
 *   Effect.provide(effect, SystemServicesLive)
 *
 * Dependency graph:
 * - FileSystem (base - no deps)
 * - CommandExecutor (base - no deps)
 * - Lock (uses fs internally)
 * - UserService (uses exec, fs, lock internally)
 * - SystemCtl (uses execAsUser from exec)
 * - Linger (uses exec, fs)
 * - Directory (uses exec, fs)
 * - Age (uses fs, chmod from directories)
 * - Secrets (uses exec, age, directories, fs)
 * - UidAllocator (uses exec, fs, lock)
 * - SELinux (uses exec)
 * - Sysctl (uses exec, fs)
 * - Archive (uses Bun directly)
 * - Compress (uses Bun directly)
 */
export const SystemServicesLive: Layer.Layer<
  | FileSystem
  | CommandExecutor
  | Lock
  | UserService
  | SystemCtl
  | Linger
  | Directory
  | Age
  | Secrets
  | UidAllocator
  | SELinux
  | Sysctl
  | Archive
  | Compress
> = Layer.mergeAll(
  FileSystemLive,
  CommandExecutorLive,
  LockLive,
  UserServiceLive,
  SystemCtlLive,
  LingerLive,
  DirectoryLive,
  AgeLive,
  SecretsLive,
  UidAllocatorLive,
  SELinuxLive,
  SysctlLive,
  ArchiveLive,
  CompressLive
);

/**
 * Type alias for all system services context requirement.
 * Can be used in type annotations:
 *   Effect.Effect<A, E, SystemServices>
 */
export type SystemServices =
  | FileSystem
  | CommandExecutor
  | Lock
  | UserService
  | SystemCtl
  | Linger
  | Directory
  | Age
  | Secrets
  | UidAllocator
  | SELinux
  | Sysctl
  | Archive
  | Compress;
