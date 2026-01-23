// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Container network configuration with rootless Podman considerations.
 * Pasta (default) provides user-space networking with better performance
 * than slirp4netns. MapHostLoopback enables containers to reach host
 * services via 127.0.0.1 - critical for accessing local databases.
 * IPv6 addresses in port mappings require bracket notation.
 */

import type { Entries } from "../entry";
import { concat, fromArray, fromArrayWith, fromMaybe, fromValue } from "../entry-combinators";
import type { PortMapping } from "../types";

export interface ContainerNetworkConfig {
  /** Named network to join */
  readonly network?: string | undefined;
  /** Network mode */
  readonly networkMode?: "pasta" | "slirp4netns" | "host" | "none" | undefined;
  /** Map private IP to host loopback (pasta only) */
  readonly mapHostLoopback?: string | undefined;
  /** Port mappings */
  readonly ports?: readonly PortMapping[] | undefined;
  /** Ports to expose (no host mapping) */
  readonly exposePort?: readonly number[] | undefined;
  /** Container hostname */
  readonly hostname?: string | undefined;
  /** DNS servers */
  readonly dns?: readonly string[] | undefined;
  /** DNS search domains */
  readonly dnsSearch?: readonly string[] | undefined;
  /** DNS options */
  readonly dnsOption?: readonly string[] | undefined;
  /** Add extra hosts (/etc/hosts entries) */
  readonly addHost?: readonly string[] | undefined;
}

const isIPv6 = (ip: string): boolean => ip.includes(":");

const formatHostIp = (ip: string): string => (isIPv6(ip) ? `[${ip}]` : ip);

export const formatPortMapping = (port: PortMapping): string => {
  const protocol = port.protocol ?? "tcp";
  const hostIp = port.hostIp ? `${formatHostIp(port.hostIp)}:` : "";

  return `${hostIp}${port.host}:${port.container}/${protocol}`;
};

export const formatNetworkMode = (
  mode: "pasta" | "slirp4netns" | "host" | "none",
  mapHostLoopback?: string
): string =>
  mode !== "pasta" || !mapHostLoopback ? mode : `${mode}:--map-host-loopback=${mapHostLoopback}`;

export const getNetworkEntries = (config: ContainerNetworkConfig): Entries =>
  concat(
    fromValue("Network", config.network),
    fromMaybe("Network", config.networkMode, (mode) =>
      formatNetworkMode(mode, config.mapHostLoopback)
    ),
    fromArrayWith("PublishPort", config.ports, formatPortMapping),
    fromArrayWith("ExposePort", config.exposePort, String),
    fromValue("HostName", config.hostname),
    fromArray("DNS", config.dns),
    fromArray("DNSSearch", config.dnsSearch),
    fromArray("DNSOption", config.dnsOption),
    fromArray("AddHost", config.addHost)
  );

export const createPort = (
  host: number,
  container: number,
  protocol: "tcp" | "udp" = "tcp"
): PortMapping => ({
  host,
  container,
  protocol,
});

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

export const CommonPorts: Record<string, PortMapping> = {
  HTTP: createPort(80, 80),
  HTTPS: createPort(443, 443),
  HTTPS_UDP: createPort(443, 443, "udp"), // For HTTP/3
  SSH: createPort(22, 22),
  POSTGRES: createLocalhostPort(5432, 5432),
  REDIS: createLocalhostPort(6379, 6379),
  MYSQL: createLocalhostPort(3306, 3306),
} as const satisfies Record<string, PortMapping>;
