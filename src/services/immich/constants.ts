// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { type ContainerName, containerName } from "../../lib/types";

/** Centralized constants for Immich service. */

interface ImmichContainers {
  readonly redis: ContainerName;
  readonly postgres: ContainerName;
  readonly server: ContainerName;
  readonly ml: ContainerName;
}

export const CONTAINERS: ImmichContainers = {
  redis: containerName("immich-redis"),
  postgres: containerName("immich-postgres"),
  server: containerName("immich-server"),
  ml: containerName("immich-machine-learning"),
};

export const NETWORK_NAME = "immich-net";

export const DEFAULT_IMAGES = {
  redis: "docker.io/library/redis:7-alpine",
  postgres: "docker.io/tensorchord/pgvecto-rs:pg16-v0.2.0",
  server: "ghcr.io/immich-app/immich-server:release",
  ml: "ghcr.io/immich-app/immich-machine-learning:release",
} as const;

export const INTERNAL_URLS = {
  server: "http://immich-server:2283",
  ml: "http://immich-machine-learning:3003",
} as const;
