/**
 * Container security configuration for quadlet files.
 */

import { addEntry } from "../format";

export interface ContainerSecurityConfig {
  /** Read-only root filesystem */
  readOnlyRootfs?: boolean | undefined;
  /** Prevent privilege escalation */
  noNewPrivileges?: boolean | undefined;
  /** Custom seccomp profile path */
  seccompProfile?: string | undefined;
  /** Custom AppArmor profile */
  apparmorProfile?: string | undefined;
  /** Disable security labels (SELinux/AppArmor) */
  securityLabelDisable?: boolean | undefined;
  /** Run as privileged (avoid if possible) */
  privileged?: boolean | undefined;
  /** User to run as inside container */
  user?: string | undefined;
  /** Group to run as inside container */
  group?: string | undefined;
}

/**
 * Add security-related entries to a section.
 */
export const addSecurityEntries = (
  entries: Array<{ key: string; value: string }>,
  config: ContainerSecurityConfig
): void => {
  addEntry(entries, "ReadOnly", config.readOnlyRootfs);
  addEntry(entries, "NoNewPrivileges", config.noNewPrivileges);
  addEntry(entries, "SeccompProfile", config.seccompProfile);
  addEntry(entries, "SecurityLabelDisable", config.securityLabelDisable);

  if (config.user) {
    addEntry(entries, "User", config.user);
  }
  if (config.group) {
    addEntry(entries, "Group", config.group);
  }
};

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
export const SecurityProfiles = {
  /** Maximum security - read-only rootfs, no privilege escalation */
  HARDENED: createHardenedSecurity(),
  /** Minimal restrictions */
  MINIMAL: createMinimalSecurity(),
  /** No restrictions (use sparingly) */
  NONE: {} as ContainerSecurityConfig,
} as const;

/**
 * Common seccomp profile locations.
 */
export const SeccompProfiles = {
  /** Default Podman seccomp profile */
  DEFAULT: "default",
  /** Chrome/Chromium seccomp profile */
  CHROME: "/usr/share/containers/seccomp/chrome.json",
} as const;
