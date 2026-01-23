// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Container security hardening options. NoNewPrivileges prevents
 * setuid escalation inside containers - always enable unless the
 * application specifically requires privilege changes. ReadOnly
 * rootfs forces all writes to explicit mounts, preventing hidden
 * state accumulation. Seccomp profiles restrict syscalls.
 */

import type { Entries } from "../entry";
import { concat, fromValue } from "../entry-combinators";

export interface ContainerSecurityConfig {
  /** Read-only root filesystem */
  readonly readOnlyRootfs?: boolean | undefined;
  /** Prevent privilege escalation */
  readonly noNewPrivileges?: boolean | undefined;
  /** Custom seccomp profile path */
  readonly seccompProfile?: string | undefined;
  /** Custom AppArmor profile */
  readonly apparmorProfile?: string | undefined;
  /** Run as privileged (avoid if possible) */
  readonly privileged?: boolean | undefined;
  /** User to run as inside container */
  readonly user?: string | undefined;
  /** Group to run as inside container */
  readonly group?: string | undefined;
}

export const getSecurityEntries = (config: ContainerSecurityConfig): Entries =>
  concat(
    fromValue("ReadOnly", config.readOnlyRootfs),
    fromValue("NoNewPrivileges", config.noNewPrivileges),
    fromValue("SeccompProfile", config.seccompProfile),
    fromValue("User", config.user),
    fromValue("Group", config.group)
  );

export const createHardenedSecurity = (): ContainerSecurityConfig => ({
  readOnlyRootfs: true,
  noNewPrivileges: true,
});

export const createMinimalSecurity = (): ContainerSecurityConfig => ({
  noNewPrivileges: true,
});

export const SecurityProfiles: Record<string, ContainerSecurityConfig> = {
  HARDENED: createHardenedSecurity(),
  MINIMAL: createMinimalSecurity(),
  NONE: {} as ContainerSecurityConfig,
} as const satisfies Record<string, ContainerSecurityConfig>;

export const SeccompProfiles: Record<string, string> = {
  DEFAULT: "default",
  CHROME: "/usr/share/containers/seccomp/chrome.json",
} as const satisfies Record<string, string>;
