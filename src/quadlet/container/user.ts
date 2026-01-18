/**
 * Container user namespace configuration for quadlet files.
 */

import type { UserNamespace } from "../types";

/**
 * Add user namespace entries to a section.
 */
export const addUserNsEntries = (
  entries: Array<{ key: string; value: string }>,
  config: UserNamespace | undefined
): void => {
  if (!config) {
    return;
  }

  switch (config.mode) {
    case "keep-id":
      // keep-id maps container UID 0 to host user's UID
      if (config.uid !== undefined || config.gid !== undefined) {
        const uidPart = config.uid !== undefined ? `:uid=${config.uid}` : "";
        const gidPart = config.gid !== undefined ? `,gid=${config.gid}` : "";
        entries.push({ key: "UserNS", value: `keep-id${uidPart}${gidPart}` });
      } else {
        entries.push({ key: "UserNS", value: "keep-id" });
      }
      break;
    case "auto":
      // auto creates an automatic user namespace mapping
      entries.push({ key: "UserNS", value: "auto" });
      break;
    case "host":
      // host disables user namespacing
      entries.push({ key: "UserNS", value: "host" });
      break;
    default: {
      // Exhaustiveness check - TypeScript will error if new modes are added
      const unknownMode: never = config.mode;
      throw new Error(`Unknown user namespace mode: ${unknownMode}`);
    }
  }
};

/**
 * Create a keep-id user namespace configuration.
 * This maps the container root to the host user.
 */
export const createKeepIdNs = (uid?: number, gid?: number): UserNamespace => {
  const result: UserNamespace = { mode: "keep-id" };
  if (uid !== undefined) {
    result.uid = uid;
  }
  if (gid !== undefined) {
    result.gid = gid;
  }
  return result;
};

/**
 * Create an auto user namespace configuration.
 */
export const createAutoNs = (): UserNamespace => ({
  mode: "auto",
});

/**
 * Create a host user namespace configuration.
 * Warning: This disables user namespace isolation.
 */
export const createHostNs = (): UserNamespace => ({
  mode: "host",
});

/**
 * User namespace modes.
 */
export const UserNsModes = {
  /**
   * keep-id: Map container UID 0 to host user's UID.
   * Best for rootless containers that need to access host files.
   */
  KEEP_ID: "keep-id",
  /**
   * auto: Automatic UID/GID mapping using subuid/subgid.
   * Best for isolated containers that don't need host file access.
   */
  AUTO: "auto",
  /**
   * host: No user namespace (container UIDs = host UIDs).
   * Use sparingly - reduces isolation.
   */
  HOST: "host",
} as const;

/**
 * Determine the best user namespace mode for a use case.
 */
export const recommendUserNs = (options: {
  needsHostFiles: boolean;
  needsPrivilegedPorts: boolean;
  maxIsolation: boolean;
}): UserNamespace => {
  if (options.maxIsolation) {
    return createAutoNs();
  }
  if (options.needsHostFiles || options.needsPrivilegedPorts) {
    return createKeepIdNs();
  }
  return createAutoNs();
};
