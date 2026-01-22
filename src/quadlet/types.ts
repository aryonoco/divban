// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Type definitions for Quadlet file generation.
 * Quadlets are systemd generator files for Podman containers.
 */

import type { DurationString } from "../lib/types";
import type { ContainerCapabilitiesConfig } from "./container/capabilities";
import type { ContainerEnvironmentConfig } from "./container/environment";
import type { ImageConfig } from "./container/image";
import type { ContainerMiscConfig } from "./container/misc";
import type { ContainerNetworkConfig } from "./container/network";
import type { ContainerResourcesConfig } from "./container/resources";
import type { ContainerSecretsConfig } from "./container/secrets";
import type { ContainerSecurityConfig } from "./container/security";
import type { ContainerVolumeConfig } from "./container/volumes";

/**
 * Port mapping configuration.
 */
export interface PortMapping {
  /** Host IP to bind to (optional, defaults to all interfaces) */
  readonly hostIp?: string | undefined;
  /** Host port number */
  readonly host: number;
  /** Container port number */
  readonly container: number;
  /** Protocol (tcp or udp) */
  readonly protocol?: "tcp" | "udp" | undefined;
}

/**
 * Volume mount configuration.
 */
export interface VolumeMount {
  /** Source path or volume name */
  source: string;
  /** Target path inside container */
  target: string;
  /** Mount options (ro, rw, z, Z, etc.) */
  options?: string | undefined;
}

/**
 * Secret mount configuration.
 * Maps a podman secret to a container.
 */
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

/**
 * Health check configuration.
 */
export interface HealthCheck {
  /** Command to run for health check */
  cmd: string;
  /** Time between checks */
  interval: DurationString;
  /** Timeout for each check */
  timeout: DurationString;
  /** Number of retries before marking unhealthy */
  retries: number;
  /** Initial delay before starting checks */
  startPeriod: DurationString;
  /** Action on failure */
  onFailure: "none" | "kill" | "restart" | "stop";
}

/**
 * User namespace configuration discriminated union.
 */
export type UserNamespace =
  | {
      readonly mode: "keep-id";
      readonly uid?: number | undefined;
      readonly gid?: number | undefined;
    }
  | { readonly mode: "auto"; readonly size?: number | undefined }
  | { readonly mode: "host" };

/**
 * Service section configuration for systemd.
 */
export interface ServiceConfig {
  /** Restart policy */
  restart: "no" | "on-success" | "on-failure" | "on-abnormal" | "on-abort" | "always";
  /** Delay before restart */
  restartSec?: number | undefined;
  /** Timeout for service start */
  timeoutStartSec?: number | undefined;
  /** Timeout for service stop */
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
  // Required fields
  /** Container name (used for unit file name) */
  readonly name: string;
  /** Human-readable description */
  readonly description: string;
  /** Container image reference */
  readonly image: string;
  /** Service configuration */
  readonly service: ServiceConfig;

  // Unit dependencies (not from sub-configs)
  /** Hard dependencies - unit fails if these fail */
  readonly requires?: readonly string[] | undefined;
  /** Soft dependencies - unit doesn't fail if these fail */
  readonly wants?: readonly string[] | undefined;
  /** Order: start after these units */
  readonly after?: readonly string[] | undefined;
  /** Order: start before these units */
  readonly before?: readonly string[] | undefined;

  // Container-specific optionals (not from sub-configs)
  /** User namespace configuration */
  readonly userNs?: UserNamespace | undefined;
  /** Health check configuration */
  readonly healthCheck?: HealthCheck | undefined;
  /** Install section - target to install to */
  readonly wantedBy?: string | undefined;
}

/**
 * Network quadlet configuration.
 */
export interface NetworkQuadlet {
  /** Network name */
  name: string;
  /** Human-readable description */
  description?: string | undefined;
  /** Internal network (no external connectivity) */
  internal?: boolean | undefined;
  /** Network driver */
  driver?: "bridge" | "macvlan" | "ipvlan" | undefined;
  /** IPv6 support */
  ipv6?: boolean | undefined;
  /** Subnet CIDR */
  subnet?: string | undefined;
  /** Gateway IP */
  gateway?: string | undefined;
  /** IP range for containers */
  ipRange?: string | undefined;
  /** Network options */
  options?: Record<string, string> | undefined;
  /** DNS servers */
  dns?: string[] | undefined;
}

/**
 * Volume quadlet configuration.
 */
export interface VolumeQuadlet {
  /** Volume name */
  name: string;
  /** Human-readable description */
  description?: string | undefined;
  /** Volume driver */
  driver?: string | undefined;
  /** Volume driver options */
  options?: Record<string, string> | undefined;
  /** Volume labels */
  labels?: Record<string, string> | undefined;
}

/**
 * Generated quadlet file.
 */
export interface GeneratedQuadlet {
  /** Filename (e.g., "caddy.container") */
  filename: string;
  /** File content */
  content: string;
  /** File type */
  type: "container" | "network" | "volume";
}
