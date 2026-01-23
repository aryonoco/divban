// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * User namespace modes for UID mapping between container and host.
 * keep-id maps the host user to container root (UID 0) - essential
 * when containers expect root but must access host-owned files.
 * auto provides maximum isolation via subuid ranges but breaks
 * host file access. host mode disables namespacing entirely and
 * should never be used in production.
 */

import { Array as Arr, Match, Option, pipe } from "effect";
import type { Entries, Entry } from "../entry";
import { empty } from "../entry";
import type { UserNamespace } from "../types";

/**
 * Format keep-id mode with optional uid/gid.
 */
const formatKeepId = (config: Extract<UserNamespace, { mode: "keep-id" }>): string =>
  pipe(
    [
      pipe(
        Option.fromNullable(config.uid),
        Option.map((uid) => `uid=${uid}`)
      ),
      pipe(
        Option.fromNullable(config.gid),
        Option.map((gid) => `gid=${gid}`)
      ),
    ],
    // filterMap with identity extracts Some values
    Arr.filterMap((opt) => opt),
    (parts) => (parts.length > 0 ? `keep-id:${parts.join(",")}` : "keep-id")
  );

/**
 * Convert user namespace config to INI entries.
 */
export const getUserNsEntries = (config: UserNamespace | undefined): Entries =>
  pipe(
    Option.fromNullable(config),
    Option.map(
      (ns): Entry =>
        pipe(
          Match.value(ns),
          Match.when({ mode: "keep-id" }, (c) => ({
            key: "UserNS",
            value: formatKeepId(c),
          })),
          Match.when({ mode: "auto" }, () => ({
            key: "UserNS",
            value: "auto",
          })),
          Match.when({ mode: "host" }, () => ({
            key: "UserNS",
            value: "host",
          })),
          Match.exhaustive
        )
    ),
    Option.match({
      onNone: (): Entries => empty,
      onSome: (entry): Entries => [entry],
    })
  );

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
 * on the host side.
 */
export const createRootMappedNs = (): UserNamespace => ({
  mode: "keep-id",
  uid: 0,
  gid: 0,
});

/**
 * Check if a user namespace uses UID/GID mapping that differs from the default.
 */
export const hasUidGidMapping = (ns: UserNamespace | undefined): boolean =>
  pipe(
    Match.value(ns),
    Match.when(undefined, () => false),
    Match.when({ mode: "keep-id" }, (keepId) => {
      const hasUid = Option.match(Option.fromNullable(keepId.uid), {
        onNone: (): boolean => false,
        onSome: (): boolean => true,
      });
      const hasGid = Option.match(Option.fromNullable(keepId.gid), {
        onNone: (): boolean => false,
        onSome: (): boolean => true,
      });
      return hasUid || hasGid;
    }),
    Match.orElse(() => false)
  );

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
   * NEVER USE - minimizes isolation
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
}): UserNamespace =>
  pipe(
    Match.value(options),
    Match.when({ maxIsolation: true }, () => createAutoNs()),
    Match.when({ needsHostFiles: true }, () => createKeepIdNs()),
    Match.when({ needsPrivilegedPorts: true }, () => createKeepIdNs()),
    Match.orElse(() => createAutoNs())
  );
