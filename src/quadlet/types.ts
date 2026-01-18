/**
 * Type definitions for Quadlet file generation.
 * Quadlets are systemd generator files for Podman containers.
 */

/**
 * Port mapping configuration.
 */
export interface PortMapping {
  /** Host IP to bind to (optional, defaults to all interfaces) */
  hostIp?: string;
  /** Host port number */
  host: number;
  /** Container port number */
  container: number;
  /** Protocol (tcp or udp) */
  protocol?: "tcp" | "udp";
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
  options?: string;
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
 * User namespace configuration.
 */
export interface UserNamespace {
  /** Namespace mode */
  mode: "keep-id" | "auto" | "host";
  /** UID mapping (for keep-id) */
  uid?: number;
  /** GID mapping (for keep-id) */
  gid?: number;
}

/**
 * Service section configuration for systemd.
 */
export interface ServiceConfig {
  /** Restart policy */
  restart: "no" | "on-success" | "on-failure" | "on-abnormal" | "on-abort" | "always";
  /** Delay before restart */
  restartSec?: number;
  /** Timeout for service start */
  timeoutStartSec?: number;
  /** Timeout for service stop */
  timeoutStopSec?: number;
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
  imageDigest?: string;

  /** Unit dependencies */
  requires?: string[];
  wants?: string[];
  after?: string[];
  before?: string[];

  /** Network configuration */
  network?: string;
  networkMode?: "pasta" | "slirp4netns" | "host" | "none";
  ports?: PortMapping[];
  exposePort?: number[];
  hostname?: string;
  dns?: string[];

  /** Volume configuration */
  volumes?: VolumeMount[];
  tmpfs?: string[];

  /** Environment configuration */
  environmentFiles?: string[];
  environment?: Record<string, string>;

  /** User namespace configuration */
  userNs?: UserNamespace;

  /** Health check configuration */
  healthCheck?: HealthCheck;

  /** Security configuration */
  readOnlyRootfs?: boolean;
  noNewPrivileges?: boolean;
  seccompProfile?: string;
  apparmorProfile?: string;
  capAdd?: string[];
  capDrop?: string[];
  securityLabelDisable?: boolean;

  /** Resource limits */
  shmSize?: string;
  memory?: string;
  cpuQuota?: string;
  pidsLimit?: number;

  /** Devices */
  devices?: string[];

  /** Misc options */
  init?: boolean;
  logDriver?: string;
  entrypoint?: string;
  exec?: string;
  workdir?: string;
  user?: string;
  group?: string;

  /** Auto-update configuration */
  autoUpdate?: "registry" | "local" | false;

  /** Service configuration */
  service: ServiceConfig;

  /** Install section */
  wantedBy?: string;
}

/**
 * Network quadlet configuration.
 */
export interface NetworkQuadlet {
  /** Network name */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Internal network (no external connectivity) */
  internal?: boolean;
  /** Network driver */
  driver?: "bridge" | "macvlan" | "ipvlan";
  /** IPv6 support */
  ipv6?: boolean;
  /** Subnet CIDR */
  subnet?: string;
  /** Gateway IP */
  gateway?: string;
  /** IP range for containers */
  ipRange?: string;
  /** Network options */
  options?: Record<string, string>;
  /** DNS servers */
  dns?: string[];
}

/**
 * Volume quadlet configuration.
 */
export interface VolumeQuadlet {
  /** Volume name */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Volume driver */
  driver?: string;
  /** Volume driver options */
  options?: Record<string, string>;
  /** Volume labels */
  labels?: Record<string, string>;
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
