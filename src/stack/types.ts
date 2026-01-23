// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Stack types for multi-container service composition. A Stack groups
 * related containers (e.g., app + database + cache) with shared networking.
 * Containers declare dependencies via requires/wants for correct startup
 * order. StackGeneratedFiles tracks all quadlet outputs for atomic writes.
 */

import type {
  HealthCheck,
  PortMapping,
  SecretMount,
  ServiceConfig,
  UserNamespace,
  VolumeMount,
} from "../quadlet/types";

/**
 * Container definition within a stack.
 */
export interface StackContainer {
  /** Container name (unique within stack) */
  name: string;
  /** Human-readable description */
  description?: string | undefined;
  /** Container image reference */
  image: string;
  /** Optional image digest for pinning */
  imageDigest?: string | undefined;

  /** Hard dependencies - must be running before this container */
  requires?: string[] | undefined;
  /** Soft dependencies - should be running but not required */
  wants?: string[] | undefined;

  /** Port mappings (for externally exposed containers) */
  ports?: readonly PortMapping[] | undefined;
  /** Volume mounts */
  volumes?: readonly VolumeMount[] | undefined;
  /** Environment variables */
  environment?: Readonly<Record<string, string>> | undefined;
  /** Environment file paths */
  environmentFiles?: readonly string[] | undefined;
  /** Podman secrets to mount or inject */
  secrets?: readonly SecretMount[] | undefined;

  /** User namespace configuration */
  userNs?: UserNamespace | undefined;
  /** Health check configuration */
  healthCheck?: HealthCheck | undefined;

  /** Security options */
  readOnlyRootfs?: boolean | undefined;
  noNewPrivileges?: boolean | undefined;
  capAdd?: string[] | undefined;
  capDrop?: string[] | undefined;
  seccompProfile?: string | undefined;

  /** Resource limits */
  shmSize?: string | undefined;
  memory?: string | undefined;
  pidsLimit?: number | undefined;

  /** Devices to mount */
  devices?: string[] | undefined;

  /** Misc options */
  init?: boolean | undefined;
  hostname?: string | undefined;
  workdir?: string | undefined;
  entrypoint?: string | undefined;
  exec?: string | undefined;

  /** Auto-update configuration */
  autoUpdate?: "registry" | "local" | false | undefined;
  /** Service configuration */
  service?: Partial<ServiceConfig> | undefined;
}

/**
 * Network definition within a stack.
 */
export interface StackNetwork {
  /** Network name */
  name: string;
  /** Internal network (no external connectivity) */
  internal?: boolean | undefined;
  /** Additional network options */
  options?: Record<string, string> | undefined;
}

/**
 * Volume definition within a stack.
 */
export interface StackVolume {
  /** Volume name */
  name: string;
  /** Volume options */
  options?: Record<string, string> | undefined;
}

/**
 * Complete stack definition.
 */
export interface Stack {
  /** Stack name (used as prefix for resources) */
  name: string;
  /** Human-readable description */
  description?: string | undefined;

  /** Internal network for stack communication */
  network?: StackNetwork | undefined;
  /** Additional networks */
  networks?: StackNetwork[] | undefined;

  /** Named volumes */
  volumes?: StackVolume[] | undefined;

  /** Container definitions */
  containers: StackContainer[];

  /** Default service configuration for all containers */
  defaultService?: Partial<ServiceConfig> | undefined;
  /** Default auto-update setting */
  defaultAutoUpdate?: "registry" | "local" | false | undefined;
}

/**
 * Generated files from a stack.
 */
export interface StackGeneratedFiles {
  /** Container quadlet files */
  containers: Map<string, string>;
  /** Network quadlet files */
  networks: Map<string, string>;
  /** Volume quadlet files */
  volumes: Map<string, string>;
  /** Environment files */
  environmentFiles: Map<string, string>;
  /** Other generated files */
  other: Map<string, string>;
}

/**
 * Container dependency node for graph operations.
 */
export interface DependencyNode {
  /** Container name */
  name: string;
  /** Hard dependencies */
  requires: string[];
  /** Soft dependencies */
  wants: string[];
}

/**
 * Resolved start order for containers.
 */
export interface StartOrder {
  /** Containers in order of startup */
  order: string[];
  /** Containers that can start in parallel at each level */
  levels: string[][];
}
