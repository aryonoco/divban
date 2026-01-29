// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Quadlet configuration types for systemd-Podman integration.
 * Quadlets are INI files that systemd generators convert to unit files
 * at boot. This enables declarative container definitions with systemd
 * lifecycle management (dependencies, restart policies, logging).
 */

import type { HealthCheckOnFailure, Protocol, ServiceRestartPolicy } from "../config/field-values";
import type { ContainerImage, ContainerName, DurationString } from "../lib/types";
import type { ContainerCapabilitiesConfig } from "./container/capabilities";
import type { ContainerEnvironmentConfig } from "./container/environment";
import type { ImageConfig } from "./container/image";
import type { ContainerMiscConfig } from "./container/misc";
import type { ContainerNetworkConfig } from "./container/network";
import type { ContainerResourcesConfig } from "./container/resources";
import type { ContainerSecretsConfig } from "./container/secrets";
import type { ContainerSecurityConfig } from "./container/security";
import type { ContainerVolumeConfig } from "./container/volumes";

/** Maps `--publish hostIp:host:container/protocol` in Podman. */
export interface PortMapping {
  /** Defaults to all interfaces when omitted. */
  readonly hostIp?: string | undefined;
  readonly host: number;
  readonly container: number;
  readonly protocol?: Protocol | undefined;
}

/** Maps `--volume source:target:options` in Podman. */
export interface VolumeMount {
  source: string;
  target: string;
  options?: string | undefined;
}

/** Maps `--secret` in Podman. Secrets must be pre-created via `podman secret create`. */
export interface SecretMount {
  /** Secret name (must exist in podman) */
  name: string;
  /** Target path or env var name */
  target?: string | undefined;
  /** How to expose the secret: mount as file or inject as env var */
  type?: "mount" | "env" | undefined;
  /** File mode for mounted secret (mount type only) */
  mode?: string | undefined;
}

/** Maps `--health-*` flags in Podman. Healthchecks run inside the container. */
export interface HealthCheck {
  cmd: string;
  interval: DurationString;
  timeout: DurationString;
  /** Consecutive failures before marking unhealthy. */
  retries: number;
  /** Grace period before checks start (for slow-starting apps). */
  startPeriod: DurationString;
  onFailure: HealthCheckOnFailure;
}

/**
 * User namespace isolation mode. `keep-id` maps host UID into container (for bind mounts);
 * `auto` allocates a subordinate UID range; `host` disables isolation entirely.
 */
export type UserNamespace =
  | {
      readonly mode: "keep-id";
      readonly uid?: number | undefined;
      readonly gid?: number | undefined;
    }
  | { readonly mode: "auto"; readonly size?: number | undefined }
  | { readonly mode: "host" };

/** Systemd [Service] section directives for restart behavior and timeouts. */
export interface ServiceConfig {
  restart: ServiceRestartPolicy;
  restartSec?: number | undefined;
  timeoutStartSec?: number | undefined;
  timeoutStopSec?: number | undefined;
}

/**
 * Full container quadlet configuration.
 * Composes sub-config interfaces via structural subtyping.
 * ContainerQuadlet extends Partial<XxxConfig> to enable direct passing to getXxxEntries.
 */
export interface ContainerQuadlet
  extends Partial<ContainerNetworkConfig>,
    Partial<ContainerSecurityConfig>,
    Partial<ContainerCapabilitiesConfig>,
    Partial<ContainerEnvironmentConfig>,
    Partial<ContainerResourcesConfig>,
    Partial<ContainerSecretsConfig>,
    Partial<ContainerVolumeConfig>,
    Partial<ContainerMiscConfig>,
    Partial<Omit<ImageConfig, "image">> {
  readonly name: ContainerName;
  readonly description: string;
  readonly image: ContainerImage;
  readonly service: ServiceConfig;

  // Unit dependencies: requires/wants control failure propagation, after/before control ordering only
  /** Hard dependency: unit fails if these fail. */
  readonly requires?: readonly string[] | undefined;
  /** Soft dependency: unit doesn't fail if these fail. */
  readonly wants?: readonly string[] | undefined;
  /** Ordering only: start after these units (no dependency relationship). */
  readonly after?: readonly string[] | undefined;
  /** Ordering only: start before these units (no dependency relationship). */
  readonly before?: readonly string[] | undefined;

  readonly userNs?: UserNamespace | undefined;
  readonly healthCheck?: HealthCheck | undefined;
  readonly wantedBy?: string | undefined;
}

/** Configuration for a `.network` quadlet file. */
export interface NetworkQuadlet {
  name: string;
  description?: string | undefined;
  internal?: boolean | undefined;
  driver?: "bridge" | "macvlan" | "ipvlan" | undefined;
  ipv6?: boolean | undefined;
  subnet?: string | undefined;
  gateway?: string | undefined;
  ipRange?: string | undefined;
  options?: Record<string, string> | undefined;
  dns?: string[] | undefined;
}

/** Configuration for a `.volume` quadlet file. */
export interface VolumeQuadlet {
  name: string;
  description?: string | undefined;
  driver?: string | undefined;
  options?: Record<string, string> | undefined;
  labels?: Record<string, string> | undefined;
}

/** Output artifact ready to be written to disk. */
export interface GeneratedQuadlet {
  filename: string;
  content: string;
  type: "container" | "network" | "volume";
}
