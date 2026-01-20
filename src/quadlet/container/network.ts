// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

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
  /** Map private IP to host loopback (pasta only) */
  mapHostLoopback?: string | undefined;
  /** Port mappings */
  ports?: readonly PortMapping[] | undefined;
  /** Ports to expose (no host mapping) */
  exposePort?: readonly number[] | undefined;
  /** Container hostname */
  hostname?: string | undefined;
  /** DNS servers */
  dns?: readonly string[] | undefined;
  /** DNS search domains */
  dnsSearch?: readonly string[] | undefined;
  /** DNS options */
  dnsOption?: readonly string[] | undefined;
  /** Add extra hosts (/etc/hosts entries) */
  addHost?: readonly string[] | undefined;
}

/**
 * Check if an IP address is IPv6.
 */
const isIPv6 = (ip: string): boolean => ip.includes(":");

/**
 * Format host IP for port mapping, wrapping IPv6 in brackets.
 */
const formatHostIp = (ip: string): string => (isIPv6(ip) ? `[${ip}]` : ip);

/**
 * Format a port mapping for quadlet.
 */
export const formatPortMapping = (port: PortMapping): string => {
  const protocol = port.protocol ?? "tcp";
  const hostIp = port.hostIp ? `${formatHostIp(port.hostIp)}:` : "";

  return `${hostIp}${port.host}:${port.container}/${protocol}`;
};

/**
 * Format network mode value with pasta options if applicable.
 */
export const formatNetworkMode = (
  mode: "pasta" | "slirp4netns" | "host" | "none",
  mapHostLoopback?: string
): string => {
  if (mode !== "pasta" || !mapHostLoopback) {
    return mode;
  }
  return `${mode}:--map-host-loopback=${mapHostLoopback}`;
};

/**
 * Add network-related entries to a section.
 */
export const addNetworkEntries = (
  entries: Array<{ key: string; value: string }>,
  config: ContainerNetworkConfig
): void => {
  // Named network (for joining named networks)
  addEntry(entries, "Network", config.network);

  // Network mode (pasta, slirp4netns, host, none)
  if (config.networkMode) {
    const value = formatNetworkMode(config.networkMode, config.mapHostLoopback);
    entries.push({ key: "Network", value });
  }

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
export const CommonPorts: Record<string, PortMapping> = {
  HTTP: createPort(80, 80),
  HTTPS: createPort(443, 443),
  HTTPS_UDP: createPort(443, 443, "udp"), // For HTTP/3
  SSH: createPort(22, 22),
  POSTGRES: createLocalhostPort(5432, 5432),
  REDIS: createLocalhostPort(6379, 6379),
  MYSQL: createLocalhostPort(3306, 3306),
} as const satisfies Record<string, PortMapping>;
