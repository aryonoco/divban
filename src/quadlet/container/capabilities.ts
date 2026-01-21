// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Container Linux capabilities configuration for quadlet files.
 */

import type { Entries } from "../entry";
import { concat, fromArray } from "../entry-combinators";

export interface ContainerCapabilitiesConfig {
  /** Capabilities to add */
  readonly capAdd?: readonly string[] | undefined;
  /** Capabilities to drop */
  readonly capDrop?: readonly string[] | undefined;
}

/**
 * Pure function: Config → Entries
 * No side effects, explicit return type.
 */
export const getCapabilityEntries = (config: ContainerCapabilitiesConfig): Entries =>
  concat(fromArray("AddCapability", config.capAdd), fromArray("DropCapability", config.capDrop));

/**
 * Linux capabilities interface for isolatedDeclarations compatibility.
 */
interface CapabilitiesMap {
  readonly SYS_ADMIN: "SYS_ADMIN";
  readonly SYS_CHROOT: "SYS_CHROOT";
  readonly SYS_PTRACE: "SYS_PTRACE";
  readonly NET_RAW: "NET_RAW";
  readonly NET_BIND_SERVICE: "NET_BIND_SERVICE";
  readonly NET_ADMIN: "NET_ADMIN";
  readonly CHOWN: "CHOWN";
  readonly SETFCAP: "SETFCAP";
  readonly SETUID: "SETUID";
  readonly SETGID: "SETGID";
  readonly DAC_OVERRIDE: "DAC_OVERRIDE";
  readonly DAC_READ_SEARCH: "DAC_READ_SEARCH";
  readonly FOWNER: "FOWNER";
  readonly IPC_LOCK: "IPC_LOCK";
  readonly KILL: "KILL";
  readonly MKNOD: "MKNOD";
  readonly SYS_TIME: "SYS_TIME";
  readonly AUDIT_WRITE: "AUDIT_WRITE";
  readonly ALL: "ALL";
}

/**
 * Linux capabilities.
 * See capabilities(7) man page for full documentation.
 */
export const Capabilities: CapabilitiesMap = {
  /** Required for mounting filesystems */
  SYS_ADMIN: "SYS_ADMIN",
  /** Required for chroot */
  SYS_CHROOT: "SYS_CHROOT",
  /** Required for ptrace */
  SYS_PTRACE: "SYS_PTRACE",
  /** Required for raw sockets (ping, etc.) */
  NET_RAW: "NET_RAW",
  /** Required for binding to privileged ports */
  NET_BIND_SERVICE: "NET_BIND_SERVICE",
  /** Required for network administration */
  NET_ADMIN: "NET_ADMIN",
  /** Required for changing file ownership */
  CHOWN: "CHOWN",
  /** Required for setting file capabilities */
  SETFCAP: "SETFCAP",
  /** Required for setting UID */
  SETUID: "SETUID",
  /** Required for setting GID */
  SETGID: "SETGID",
  /** Required for dac_override */
  DAC_OVERRIDE: "DAC_OVERRIDE",
  /** Required for reading files regardless of DAC */
  DAC_READ_SEARCH: "DAC_READ_SEARCH",
  /** Required for file owner operations */
  FOWNER: "FOWNER",
  /** Required for IPC operations */
  IPC_LOCK: "IPC_LOCK",
  /** Required for killing processes */
  KILL: "KILL",
  /** Required for mknod */
  MKNOD: "MKNOD",
  /** Required for system time operations */
  SYS_TIME: "SYS_TIME",
  /** Required for audit operations */
  AUDIT_WRITE: "AUDIT_WRITE",
  /** All capabilities */
  ALL: "ALL",
};

/**
 * Drop all capabilities except those needed.
 */
export const dropAllExcept = (keep: string[]): ContainerCapabilitiesConfig => ({
  capDrop: [Capabilities.ALL],
  capAdd: keep,
});

/**
 * Common capability profiles.
 */
export const CapabilityProfiles: Record<string, ContainerCapabilitiesConfig> = {
  /** Drop all capabilities (most secure) */
  DROP_ALL: { capDrop: [Capabilities.ALL] } as ContainerCapabilitiesConfig,

  /** Keep only network binding capability */
  WEB_SERVER: dropAllExcept([Capabilities.NET_BIND_SERVICE]),

  /** Keep capabilities needed for init systems */
  INIT: dropAllExcept([Capabilities.SETUID, Capabilities.SETGID, Capabilities.KILL]),

  /** Capabilities needed for database servers */
  DATABASE: dropAllExcept([
    Capabilities.CHOWN,
    Capabilities.SETUID,
    Capabilities.SETGID,
    Capabilities.DAC_OVERRIDE,
  ]),

  /** Capabilities needed for browsers/chrome */
  BROWSER: {
    capAdd: [Capabilities.SYS_ADMIN], // Needed for sandboxing
  } as ContainerCapabilitiesConfig,
} as const satisfies Record<string, ContainerCapabilitiesConfig>;

/**
 * Check if a capability name is valid.
 */
export const isValidCapability = (cap: string): boolean => {
  return Object.values(Capabilities).includes(
    cap as (typeof Capabilities)[keyof typeof Capabilities]
  );
};
