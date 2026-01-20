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
  interval: string;
  /** Timeout for each check */
  timeout: string;
  /** Number of retries before marking unhealthy */
  retries: number;
  /** Initial delay before starting checks */
  startPeriod: string;
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
 */
export interface ContainerQuadlet {
  /** Container name (used for unit file name) */
  name: string;
  /** Human-readable description */
  description: string;
  /** Container image reference */
  image: string;
  /** Optional image digest for pinning */
  imageDigest?: string | undefined;

  /** Unit dependencies */
  requires?: string[] | undefined;
  wants?: string[] | undefined;
  after?: string[] | undefined;
  before?: string[] | undefined;

  /** Network configuration */
  network?: string | undefined;
  networkMode?: "pasta" | "slirp4netns" | "host" | "none" | undefined;
  /** Map private IP to host loopback (pasta networkMode only) */
  mapHostLoopback?: string | undefined;
  ports?: readonly PortMapping[] | undefined;
  exposePort?: readonly number[] | undefined;
  hostname?: string | undefined;
  dns?: readonly string[] | undefined;

  /** Volume configuration */
  volumes?: readonly VolumeMount[] | undefined;
  tmpfs?: readonly string[] | undefined;

  /** Environment configuration */
  environmentFiles?: string[] | undefined;
  environment?: Record<string, string> | undefined;

  /** Podman secrets to mount or inject */
  secrets?: readonly SecretMount[] | undefined;

  /** User namespace configuration */
  userNs?: UserNamespace | undefined;

  /** Health check configuration */
  healthCheck?: HealthCheck | undefined;

  /** Security configuration */
  readOnlyRootfs?: boolean | undefined;
  noNewPrivileges?: boolean | undefined;
  seccompProfile?: string | undefined;
  apparmorProfile?: string | undefined;
  capAdd?: string[] | undefined;
  capDrop?: string[] | undefined;

  /** Resource limits */
  shmSize?: string | undefined;
  memory?: string | undefined;
  cpuQuota?: string | undefined;
  pidsLimit?: number | undefined;

  /** Devices */
  devices?: string[] | undefined;

  /** Misc options */
  init?: boolean | undefined;
  logDriver?: string | undefined;
  entrypoint?: string | undefined;
  exec?: string | undefined;
  workdir?: string | undefined;
  user?: string | undefined;
  group?: string | undefined;
  /** Explicit container name (for DNS resolution in networks) */
  containerName?: string | undefined;

  /** Sysctl settings for the container */
  sysctl?: Record<string, string | number> | undefined;

  /** Auto-update configuration */
  autoUpdate?: "registry" | "local" | false | undefined;

  /** Service configuration */
  service: ServiceConfig;

  /** Install section */
  wantedBy?: string | undefined;
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
