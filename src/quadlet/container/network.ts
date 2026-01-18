/**
 * Container network configuration for quadlet files.
 */

import { addEntries, addEntry } from "../format";
import type { PortMapping } from "../types";

export interface ContainerNetworkConfig {
  /** Named network to join */
  network?: string | undefined;
  /** Network mode */
  networkMode?: "pasta" | "slirp4netns" | "host" | "none" | undefined;
  /** Port mappings */
  ports?: PortMapping[] | undefined;
  /** Ports to expose (no host mapping) */
  exposePort?: number[] | undefined;
  /** Container hostname */
  hostname?: string | undefined;
  /** DNS servers */
  dns?: string[] | undefined;
  /** DNS search domains */
  dnsSearch?: string[] | undefined;
  /** DNS options */
  dnsOption?: string[] | undefined;
  /** Add extra hosts (/etc/hosts entries) */
  addHost?: string[] | undefined;
}

/**
 * Format a port mapping for quadlet.
 */
export const formatPortMapping = (port: PortMapping): string => {
  const protocol = port.protocol ?? "tcp";
  const hostIp = port.hostIp ? `${port.hostIp}:` : "";

  return `${hostIp}${port.host}:${port.container}/${protocol}`;
};

/**
 * Add network-related entries to a section.
 */
export const addNetworkEntries = (
  entries: Array<{ key: string; value: string }>,
  config: ContainerNetworkConfig
): void => {
  // Network name (for joining named networks)
  addEntry(entries, "Network", config.network);

  // Port mappings
  if (config.ports) {
    for (const port of config.ports) {
      entries.push({ key: "PublishPort", value: formatPortMapping(port) });
    }
  }

  // Exposed ports (internal only)
  if (config.exposePort) {
    for (const port of config.exposePort) {
      entries.push({ key: "ExposePort", value: String(port) });
    }
  }

  // Hostname
  addEntry(entries, "HostName", config.hostname);

  // DNS configuration
  addEntries(entries, "DNS", config.dns);
  addEntries(entries, "DNSSearch", config.dnsSearch);
  addEntries(entries, "DNSOption", config.dnsOption);

  // Extra hosts
  addEntries(entries, "AddHost", config.addHost);
};

/**
 * Create a standard port mapping.
 */
export const createPort = (
  host: number,
  container: number,
  protocol: "tcp" | "udp" = "tcp"
): PortMapping => ({
  host,
  container,
  protocol,
});

/**
 * Create a localhost-only port mapping.
 */
export const createLocalhostPort = (
  host: number,
  container: number,
  protocol: "tcp" | "udp" = "tcp"
): PortMapping => ({
  hostIp: "127.0.0.1",
  host,
  container,
  protocol,
});

/**
 * Create port mappings for common services.
 */
export const CommonPorts = {
  HTTP: createPort(80, 80),
  HTTPS: createPort(443, 443),
  HTTPS_UDP: createPort(443, 443, "udp"), // For HTTP/3
  SSH: createPort(22, 22),
  POSTGRES: createLocalhostPort(5432, 5432),
  REDIS: createLocalhostPort(6379, 6379),
  MYSQL: createLocalhostPort(3306, 3306),
} as const;
