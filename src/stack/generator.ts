// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Generate all quadlet files for a multi-container stack.
 */

import type { AbsolutePath } from "../lib/types";
import {
  type ContainerQuadlet,
  type GeneratedQuadlet,
  type UserNamespace,
  generateContainerQuadlet,
  generateNetworkQuadlet,
  generateVolumeQuadlet,
  relabelVolumes,
} from "../quadlet";
import { mergeServiceConfig } from "../quadlet/service";
import type { Stack, StackContainer, StackGeneratedFiles } from "./types";

// ============================================================================
// Types
// ============================================================================

/**
 * Context for generating stack files.
 */
export interface StackGeneratorContext {
  /** Environment file path (if using shared env file) */
  envFilePath?: AbsolutePath;
  /** User namespace configuration for all containers */
  userNs?: UserNamespace;
  /** Default auto-update setting */
  defaultAutoUpdate?: "registry" | "local" | false;
  /** Whether SELinux is in enforcing mode (for volume relabeling) */
  selinuxEnforcing?: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

/** Convert array of quadlets to Map (filename → content) */
const toQuadletMap = <T extends { filename: string; content: string }>(
  quadlets: readonly T[]
): Map<string, string> => new Map(quadlets.map((q) => [q.filename, q.content]));

/** Build environment files list from context and container config */
const buildEnvironmentFiles = (
  ctx: StackGeneratorContext,
  container: StackContainer
): string[] | undefined => {
  const files = [ctx.envFilePath, ...(container.environmentFiles ?? [])].filter(
    (f): f is string => f !== undefined
  );
  return files.length > 0 ? files : undefined;
};

// ============================================================================
// Container Quadlet Conversion
// ============================================================================

/**
 * Convert a stack container to a full container quadlet config.
 */
const containerToQuadlet = (
  stack: Stack,
  container: StackContainer,
  ctx: StackGeneratorContext
): ContainerQuadlet => ({
  name: container.name,
  // Set explicit container name for DNS resolution in podman networks
  containerName: container.name,
  description: container.description ?? `${stack.name} - ${container.name}`,
  image: container.image,
  imageDigest: container.imageDigest,

  // Dependencies
  requires: container.requires,
  wants: container.wants,
  after: container.requires, // Start after required containers

  // Network - use stack network
  network: stack.network?.name ? `${stack.network.name}.network` : undefined,
  ports: container.ports,
  hostname: container.hostname,

  // Volumes (apply SELinux relabeling if enforcing)
  volumes: relabelVolumes(container.volumes, ctx.selinuxEnforcing ?? false),

  // Environment
  environmentFiles: buildEnvironmentFiles(ctx, container),
  environment: container.environment,

  // Secrets
  secrets: container.secrets,

  // User namespace
  userNs: container.userNs ?? ctx.userNs,

  // Health check
  healthCheck: container.healthCheck,

  // Security
  readOnlyRootfs: container.readOnlyRootfs,
  noNewPrivileges: container.noNewPrivileges ?? true,
  capAdd: container.capAdd,
  capDrop: container.capDrop,
  seccompProfile: container.seccompProfile,

  // Resources
  shmSize: container.shmSize,
  memory: container.memory,
  pidsLimit: container.pidsLimit,

  // Devices
  devices: container.devices,

  // Misc
  init: container.init,
  workdir: container.workdir,
  entrypoint: container.entrypoint,
  exec: container.exec,

  // Auto-update
  autoUpdate: container.autoUpdate ?? ctx.defaultAutoUpdate ?? stack.defaultAutoUpdate,

  // Service config
  service: mergeServiceConfig(container.service ?? {}, stack.defaultService ?? {}),
});

// ============================================================================
// Quadlet Generation Functions
// ============================================================================

/** Generate primary network quadlet if defined */
const generatePrimaryNetworkQuadlet = (stack: Stack): GeneratedQuadlet[] =>
  stack.network
    ? [
        generateNetworkQuadlet({
          name: stack.network.name,
          description: `Internal network for ${stack.name}`,
          internal: stack.network.internal ?? true,
          options: stack.network.options,
        }),
      ]
    : [];

/** Generate additional network quadlets */
const generateAdditionalNetworkQuadlets = (stack: Stack): GeneratedQuadlet[] =>
  (stack.networks ?? []).map((network) =>
    generateNetworkQuadlet({
      name: network.name,
      description: `Network for ${stack.name}`,
      internal: network.internal,
      options: network.options,
    })
  );

/** Generate all network quadlets (primary + additional) */
const generateAllNetworkQuadlets = (stack: Stack): GeneratedQuadlet[] => [
  ...generatePrimaryNetworkQuadlet(stack),
  ...generateAdditionalNetworkQuadlets(stack),
];

/** Generate all volume quadlets */
const generateAllVolumeQuadlets = (stack: Stack): GeneratedQuadlet[] =>
  (stack.volumes ?? []).map((volume) =>
    generateVolumeQuadlet({
      name: volume.name,
      description: `Volume for ${stack.name}`,
      options: volume.options,
    })
  );

/** Generate all container quadlets */
const generateAllContainerQuadlets = (
  stack: Stack,
  ctx: StackGeneratorContext
): GeneratedQuadlet[] =>
  stack.containers.map((container) =>
    generateContainerQuadlet(containerToQuadlet(stack, container, ctx))
  );

// ============================================================================
// Public API
// ============================================================================

/**
 * Generate all quadlet files for a stack.
 */
export const generateStackQuadlets = (
  stack: Stack,
  ctx: StackGeneratorContext = {}
): StackGeneratedFiles => ({
  networks: toQuadletMap(generateAllNetworkQuadlets(stack)),
  volumes: toQuadletMap(generateAllVolumeQuadlets(stack)),
  containers: toQuadletMap(generateAllContainerQuadlets(stack, ctx)),
  environmentFiles: new Map(),
  other: new Map(),
});

/**
 * Get all filenames that would be generated for a stack.
 */
export const getStackFilenames = (stack: Stack): string[] => [
  ...(stack.network ? [`${stack.network.name}.network`] : []),
  ...(stack.networks ?? []).map((n) => `${n.name}.network`),
  ...(stack.volumes ?? []).map((v) => `${v.name}.volume`),
  ...stack.containers.map((c) => `${c.name}.container`),
];

/**
 * Create a basic stack from a list of container configs.
 */
export const createStack = (config: {
  name: string;
  description?: string;
  network?: { name: string; internal?: boolean };
  volumes?: Array<{ name: string }>;
  containers: StackContainer[];
}): Stack => ({
  name: config.name,
  description: config.description,
  network: config.network,
  volumes: config.volumes,
  containers: config.containers,
});
