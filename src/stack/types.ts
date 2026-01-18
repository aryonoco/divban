/**
 * Type definitions for multi-container stack orchestration.
 */

import type {
  ContainerQuadlet,
  HealthCheck,
  NetworkQuadlet,
  PortMapping,
  ServiceConfig,
  UserNamespace,
  VolumeMount,
  VolumeQuadlet,
} from "../quadlet/types";

/**
 * Container definition within a stack.
 */
export interface StackContainer {
  /** Container name (unique within stack) */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Container image reference */
  image: string;
  /** Optional image digest for pinning */
  imageDigest?: string;

  /** Hard dependencies - must be running before this container */
  requires?: string[];
  /** Soft dependencies - should be running but not required */
  wants?: string[];

  /** Port mappings (for externally exposed containers) */
  ports?: PortMapping[];
  /** Volume mounts */
  volumes?: VolumeMount[];
  /** Environment variables */
  environment?: Record<string, string>;
  /** Environment file paths */
  environmentFiles?: string[];

  /** User namespace configuration */
  userNs?: UserNamespace;
  /** Health check configuration */
  healthCheck?: HealthCheck;

  /** Security options */
  readOnlyRootfs?: boolean;
  noNewPrivileges?: boolean;
  capAdd?: string[];
  capDrop?: string[];
  seccompProfile?: string;

  /** Resource limits */
  shmSize?: string;
  memory?: string;
  pidsLimit?: number;

  /** Devices to mount */
  devices?: string[];

  /** Misc options */
  init?: boolean;
  hostname?: string;
  workdir?: string;
  entrypoint?: string;
  exec?: string;

  /** Auto-update configuration */
  autoUpdate?: "registry" | "local" | false;
  /** Service configuration */
  service?: Partial<ServiceConfig>;
}

/**
 * Network definition within a stack.
 */
export interface StackNetwork {
  /** Network name */
  name: string;
  /** Internal network (no external connectivity) */
  internal?: boolean;
  /** Additional network options */
  options?: Record<string, string>;
}

/**
 * Volume definition within a stack.
 */
export interface StackVolume {
  /** Volume name */
  name: string;
  /** Volume options */
  options?: Record<string, string>;
}

/**
 * Complete stack definition.
 */
export interface Stack {
  /** Stack name (used as prefix for resources) */
  name: string;
  /** Human-readable description */
  description?: string;

  /** Internal network for stack communication */
  network?: StackNetwork;
  /** Additional networks */
  networks?: StackNetwork[];

  /** Named volumes */
  volumes?: StackVolume[];

  /** Container definitions */
  containers: StackContainer[];

  /** Default service configuration for all containers */
  defaultService?: Partial<ServiceConfig>;
  /** Default auto-update setting */
  defaultAutoUpdate?: "registry" | "local" | false;
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
