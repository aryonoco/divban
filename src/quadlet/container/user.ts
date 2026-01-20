// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Container user namespace configuration for quadlet files.
 */

import { Option, pipe } from "effect";
import { assertNever } from "../../lib/types";
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
    case "keep-id": {
      // keep-id maps container UID 0 to host user's UID
      // Transform each optional value to Option<string>, then collect present values
      const parts = [
        ...Option.toArray(
          pipe(
            Option.fromNullable(config.uid),
            Option.map((uid) => `uid=${uid}`)
          )
        ),
        ...Option.toArray(
          pipe(
            Option.fromNullable(config.gid),
            Option.map((gid) => `gid=${gid}`)
          )
        ),
      ];
      const suffix = parts.length > 0 ? `:${parts.join(",")}` : "";
      entries.push({ key: "UserNS", value: `keep-id${suffix}` });
      break;
    }
    case "auto":
      // auto creates an automatic user namespace mapping
      entries.push({ key: "UserNS", value: "auto" });
      break;
    case "host":
      // host disables user namespacing
      entries.push({ key: "UserNS", value: "host" });
      break;
    default:
      assertNever(config);
  }
};

/**
 * Create a keep-id user namespace configuration.
 * This maps the container root to the host user.
 */
export const createKeepIdNs = (uid?: number, gid?: number): UserNamespace => ({
  mode: "keep-id",
  uid,
  gid,
});

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
 * Create a keep-id user namespace with root mapping.
 * Maps the host user to UID 0 (root) inside the container.
 *
 * Use this when:
 * - Service uses named volumes that need write access
 * - Container image expects to run as root
 * - Files in container are owned by root
 *
 * Security note: The container still runs isolated as the host service user
 * on the host side. Root inside the container is NOT root on the host.
 */
export const createRootMappedNs = (): UserNamespace => ({
  mode: "keep-id",
  uid: 0,
  gid: 0,
});

/**
 * Check if a user namespace uses UID/GID mapping that differs from the default.
 */
export const hasUidGidMapping = (ns: UserNamespace | undefined): boolean => {
  if (!ns) {
    return false;
  }
  if (ns.mode !== "keep-id") {
    return false;
  }
  return Option.isSome(Option.fromNullable(ns.uid)) || Option.isSome(Option.fromNullable(ns.gid));
};

/**
 * User namespace modes.
 */
export const UserNsModes: Record<string, string> = {
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
} as const satisfies Record<string, string>;

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
