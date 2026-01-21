// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Container security configuration for quadlet files.
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

/**
 * Pure function: Config → Entries
 * No side effects, explicit return type.
 */
export const getSecurityEntries = (config: ContainerSecurityConfig): Entries =>
  concat(
    fromValue("ReadOnly", config.readOnlyRootfs),
    fromValue("NoNewPrivileges", config.noNewPrivileges),
    fromValue("SeccompProfile", config.seccompProfile),
    fromValue("User", config.user),
    fromValue("Group", config.group)
  );

/**
 * Create a hardened security configuration.
 */
export const createHardenedSecurity = (): ContainerSecurityConfig => ({
  readOnlyRootfs: true,
  noNewPrivileges: true,
});

/**
 * Create a minimal security configuration (no special restrictions).
 */
export const createMinimalSecurity = (): ContainerSecurityConfig => ({
  noNewPrivileges: true,
});

/**
 * Security profiles for common use cases.
 */
export const SecurityProfiles: Record<string, ContainerSecurityConfig> = {
  /** Maximum security - read-only rootfs, no privilege escalation */
  HARDENED: createHardenedSecurity(),
  /** Minimal restrictions */
  MINIMAL: createMinimalSecurity(),
  /** No restrictions (use sparingly) */
  NONE: {} as ContainerSecurityConfig,
} as const satisfies Record<string, ContainerSecurityConfig>;

/**
 * Common seccomp profile locations.
 */
export const SeccompProfiles: Record<string, string> = {
  /** Default Podman seccomp profile */
  DEFAULT: "default",
  /** Chrome/Chromium seccomp profile */
  CHROME: "/usr/share/containers/seccomp/chrome.json",
} as const satisfies Record<string, string>;
