// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Caddy reverse proxy service implementation.
 */

import { loadServiceConfig } from "../../config/loader";
import type { DivbanError } from "../../lib/errors";
import { Ok, type Result } from "../../lib/result";
import type { AbsolutePath, PrivateIP, ServiceName } from "../../lib/types";
import { PrivateIP as validatePrivateIP } from "../../lib/types";
import {
  createHttpHealthCheck,
  createRootMappedNs,
  generateContainerQuadlet,
  generateVolumeQuadlet,
  processVolumes,
} from "../../quadlet";
import { createSingleContainerOps, reloadAndEnableServices, writeGeneratedFiles } from "../helpers";
import type { GeneratedFiles, Service, ServiceContext, ServiceDefinition } from "../types";
import { createGeneratedFiles } from "../types";
import { generateCaddyfile } from "./caddyfile";
import { reloadCaddy } from "./commands/reload";
import { type CaddyConfig, caddyConfigSchema } from "./schema";

const SERVICE_NAME = "caddy" as ServiceName;

/**
 * Caddy service definition.
 */
const definition: ServiceDefinition = {
  name: SERVICE_NAME,
  description: "Caddy reverse proxy server with automatic HTTPS",
  version: "0.1.0",
  configSchema: caddyConfigSchema,
  capabilities: {
    multiContainer: false,
    hasReload: true,
    hasBackup: false,
    hasRestore: false,
    hardwareAcceleration: false,
  },
};

/**
 * Single-container operations for Caddy.
 */
const ops = createSingleContainerOps<CaddyConfig>({
  serviceName: "caddy",
  displayName: "Caddy",
});

/**
 * Validate Caddy configuration file.
 */
const validate = async (configPath: AbsolutePath): Promise<Result<void, DivbanError>> => {
  const result = await loadServiceConfig(configPath, caddyConfigSchema);
  if (!result.ok) {
    return result;
  }
  return Ok(undefined);
};

/**
 * Generate all files for Caddy service.
 */
const generate = (
  ctx: ServiceContext<CaddyConfig>
): Promise<Result<GeneratedFiles, DivbanError>> => {
  const { config } = ctx;
  const files = createGeneratedFiles();

  // Validate mapHostLoopback if provided
  let mapHostLoopback: PrivateIP | undefined;
  if (config.network?.mapHostLoopback) {
    const ipResult = validatePrivateIP(config.network.mapHostLoopback);
    if (!ipResult.ok) {
      return Promise.resolve(ipResult);
    }
    mapHostLoopback = ipResult.value;
  }

  // Generate Caddyfile
  const caddyfileContent = generateCaddyfile(config.caddyfile);
  files.other.set("Caddyfile", caddyfileContent);

  // Generate volume quadlet for caddy data
  const dataVolume = generateVolumeQuadlet({
    name: "caddy-data",
    description: "Caddy data volume (certificates, etc.)",
  });
  files.volumes.set(dataVolume.filename, dataVolume.content);

  // Generate volume quadlet for caddy config
  const configVolume = generateVolumeQuadlet({
    name: "caddy-config",
    description: "Caddy configuration volume",
  });
  files.volumes.set(configVolume.filename, configVolume.content);

  // Generate container quadlet
  const containerQuadlet = generateContainerQuadlet({
    name: "caddy",
    containerName: "caddy",
    description: "Caddy reverse proxy",
    image: config.container?.image ?? "docker.io/library/caddy:2-alpine",
    networkMode: "pasta",
    mapHostLoopback,
    ports: config.container?.ports ?? [
      { hostIp: "0.0.0.0", host: 80, container: 80, protocol: "tcp" },
      { hostIp: "0.0.0.0", host: 443, container: 443, protocol: "tcp" },
      { hostIp: "0.0.0.0", host: 443, container: 443, protocol: "udp" },
    ],
    volumes: processVolumes(
      [
        {
          source: `${ctx.paths.configDir}/Caddyfile`,
          target: "/etc/caddy/Caddyfile",
          options: "ro",
        },
        { source: "caddy-data.volume", target: "/data" },
        { source: "caddy-config.volume", target: "/config" },
      ],
      {
        selinuxEnforcing: ctx.system.selinuxEnforcing,
        applyOwnership: true,
      }
    ),
    userNs: createRootMappedNs(),
    healthCheck: createHttpHealthCheck("http://localhost:2019/reverse_proxy/upstreams", {
      interval: "30s",
      timeout: "10s",
      startPeriod: "10s",
      onFailure: "restart",
    }),
    noNewPrivileges: true,
    autoUpdate: config.container?.autoUpdate ?? "registry",
    // Allow binding to privileged ports (80, 443) in rootless container
    sysctl: {
      "net.ipv4.ip_unprivileged_port_start": 70,
    },
    service: {
      restart: config.container?.restart ?? "always",
      restartSec: 10,
      timeoutStartSec: 120,
      timeoutStopSec: 30,
    },
  });

  files.quadlets.set(containerQuadlet.filename, containerQuadlet.content);

  return Promise.resolve(Ok(files));
};

/**
 * Full setup for Caddy service.
 */
const setup = async (ctx: ServiceContext<CaddyConfig>): Promise<Result<void, DivbanError>> => {
  const { logger } = ctx;

  // 1. Generate files
  logger.step(1, 3, "Generating configuration files...");
  const filesResult = await generate(ctx);
  if (!filesResult.ok) {
    return filesResult;
  }

  // 2. Write files
  logger.step(2, 3, "Writing configuration files...");
  const writeResult = await writeGeneratedFiles(filesResult.value, ctx);
  if (!writeResult.ok) {
    return writeResult;
  }

  // 3. Reload and enable
  logger.step(3, 3, "Enabling and starting service...");
  const enableResult = await reloadAndEnableServices(ctx, ["caddy"]);
  if (!enableResult.ok) {
    return enableResult;
  }

  logger.success("Caddy setup completed successfully");
  return Ok(undefined);
};

/**
 * Reload Caddy configuration.
 */
const reload = (ctx: ServiceContext<CaddyConfig>): Promise<Result<void, DivbanError>> => {
  return reloadCaddy({
    user: ctx.user.name,
    uid: ctx.user.uid,
    logger: ctx.logger,
    containerName: "caddy",
  });
};

/**
 * Caddy service implementation.
 */
export const caddyService: Service<CaddyConfig> = {
  definition,
  validate,
  generate,
  setup,
  start: ops.start,
  stop: ops.stop,
  restart: ops.restart,
  status: ops.status,
  logs: ops.logs,
  reload,
};
