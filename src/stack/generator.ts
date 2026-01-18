/**
 * Generate all quadlet files for a multi-container stack.
 */

import type { AbsolutePath } from "../lib/types";
import {
  type ContainerQuadlet,
  type UserNamespace,
  generateContainerQuadlet,
  generateNetworkQuadlet,
  generateVolumeQuadlet,
} from "../quadlet";
import { mergeServiceConfig } from "../quadlet/service";
import type { Stack, StackContainer, StackGeneratedFiles } from "./types";

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
}

/**
 * Convert a stack container to a full container quadlet config.
 */
const containerToQuadlet = (
  stack: Stack,
  container: StackContainer,
  ctx: StackGeneratorContext
): ContainerQuadlet => {
  // Build environment files list
  const environmentFiles: string[] = [];
  if (ctx.envFilePath) {
    environmentFiles.push(ctx.envFilePath);
  }
  if (container.environmentFiles) {
    environmentFiles.push(...container.environmentFiles);
  }

  return {
    name: container.name,
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

    // Volumes
    volumes: container.volumes,

    // Environment
    environmentFiles: environmentFiles.length > 0 ? environmentFiles : undefined,
    environment: container.environment,

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
  };
};

/**
 * Generate all quadlet files for a stack.
 */
export const generateStackQuadlets = (
  stack: Stack,
  ctx: StackGeneratorContext = {}
): StackGeneratedFiles => {
  const files: StackGeneratedFiles = {
    containers: new Map(),
    networks: new Map(),
    volumes: new Map(),
    environmentFiles: new Map(),
    other: new Map(),
  };

  // Generate network quadlet
  if (stack.network) {
    const networkQuadlet = generateNetworkQuadlet({
      name: stack.network.name,
      description: `Internal network for ${stack.name}`,
      internal: stack.network.internal ?? true,
      options: stack.network.options,
    });
    files.networks.set(networkQuadlet.filename, networkQuadlet.content);
  }

  // Generate additional networks
  if (stack.networks) {
    for (const network of stack.networks) {
      const networkQuadlet = generateNetworkQuadlet({
        name: network.name,
        description: `Network for ${stack.name}`,
        internal: network.internal,
        options: network.options,
      });
      files.networks.set(networkQuadlet.filename, networkQuadlet.content);
    }
  }

  // Generate volume quadlets
  if (stack.volumes) {
    for (const volume of stack.volumes) {
      const volumeQuadlet = generateVolumeQuadlet({
        name: volume.name,
        description: `Volume for ${stack.name}`,
        options: volume.options,
      });
      files.volumes.set(volumeQuadlet.filename, volumeQuadlet.content);
    }
  }

  // Generate container quadlets
  for (const container of stack.containers) {
    const quadletConfig = containerToQuadlet(stack, container, ctx);
    const containerQuadlet = generateContainerQuadlet(quadletConfig);
    files.containers.set(containerQuadlet.filename, containerQuadlet.content);
  }

  return files;
};

/**
 * Get all filenames that would be generated for a stack.
 */
export const getStackFilenames = (stack: Stack): string[] => {
  const filenames: string[] = [];

  // Network files
  if (stack.network) {
    filenames.push(`${stack.network.name}.network`);
  }
  if (stack.networks) {
    for (const network of stack.networks) {
      filenames.push(`${network.name}.network`);
    }
  }

  // Volume files
  if (stack.volumes) {
    for (const volume of stack.volumes) {
      filenames.push(`${volume.name}.volume`);
    }
  }

  // Container files
  for (const container of stack.containers) {
    filenames.push(`${container.name}.container`);
  }

  return filenames;
};

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
