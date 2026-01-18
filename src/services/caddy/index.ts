/**
 * Caddy reverse proxy service implementation.
 */

import { z } from "zod";
import { loadServiceConfig } from "../../config/loader";
import { getServiceUsername } from "../../config/schema";
import { DivbanError, ErrorCode } from "../../lib/errors";
import { Err, Ok, type Result } from "../../lib/result";
import type { AbsolutePath, ServiceName } from "../../lib/types";
import {
  generateContainerQuadlet,
  generateVolumeQuadlet,
  createHttpHealthCheck,
  createKeepIdNs,
} from "../../quadlet";
import { writeFile } from "../../system/fs";
import { createServiceUser } from "../../system/user";
import { enableLinger } from "../../system/linger";
import { ensureServiceDirectories } from "../../system/directories";
import {
  daemonReload,
  enableService,
  isServiceActive,
  journalctl,
  restartService,
  startService,
  stopService,
} from "../../system/systemctl";
import type {
  GeneratedFiles,
  LogOptions,
  Service,
  ServiceContext,
  ServiceDefinition,
  ServiceStatus,
} from "../types";
import { createGeneratedFiles } from "../types";
import { generateCaddyfile } from "./caddyfile";
import { reloadCaddy } from "./commands/reload";
import { caddyConfigSchema, type CaddyConfig } from "./schema";

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
 * Validate Caddy configuration file.
 */
const validate = async (configPath: AbsolutePath): Promise<Result<void, DivbanError>> => {
  const result = await loadServiceConfig(configPath, caddyConfigSchema);
  if (!result.ok) return result;
  return Ok(undefined);
};

/**
 * Generate all files for Caddy service.
 */
const generate = async (ctx: ServiceContext): Promise<Result<GeneratedFiles, DivbanError>> => {
  const config = ctx.config as CaddyConfig;
  const files = createGeneratedFiles();

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
  const containerConfig = config.container ?? {};
  const containerQuadlet = generateContainerQuadlet({
    name: "caddy",
    description: "Caddy reverse proxy",
    image: containerConfig.image ?? "docker.io/library/caddy:2-alpine",
    ports: containerConfig.ports ?? [
      { host: 80, container: 80, protocol: "tcp" },
      { host: 443, container: 443, protocol: "tcp" },
      { host: 443, container: 443, protocol: "udp" },
    ],
    volumes: [
      { source: `${ctx.paths.configDir}/Caddyfile`, target: "/etc/caddy/Caddyfile", options: "ro,Z" },
      { source: "caddy-data.volume", target: "/data" },
      { source: "caddy-config.volume", target: "/config" },
    ],
    userNs: createKeepIdNs(),
    healthCheck: createHttpHealthCheck("http://localhost:2019/reverse_proxy/upstreams", {
      interval: "30s",
      timeout: "10s",
      startPeriod: "10s",
      onFailure: "restart",
    }),
    noNewPrivileges: true,
    autoUpdate: containerConfig.autoUpdate ?? "registry",
    service: {
      restart: containerConfig.restart ?? "always",
      restartSec: 10,
      timeoutStartSec: 120,
      timeoutStopSec: 30,
    },
  });

  files.quadlets.set(containerQuadlet.filename, containerQuadlet.content);

  return Ok(files);
};

/**
 * Full setup for Caddy service.
 */
const setup = async (ctx: ServiceContext): Promise<Result<void, DivbanError>> => {
  const { logger } = ctx;

  // 1. Generate files
  logger.step(1, 5, "Generating configuration files...");
  const filesResult = await generate(ctx);
  if (!filesResult.ok) return filesResult;
  const files = filesResult.value;

  // 2. Write files
  logger.step(2, 5, "Writing configuration files...");

  // Write Caddyfile
  const caddyfileContent = files.other.get("Caddyfile");
  if (caddyfileContent) {
    const caddyfilePath = `${ctx.paths.configDir}/Caddyfile` as AbsolutePath;
    const writeResult = await writeFile(caddyfilePath, caddyfileContent);
    if (!writeResult.ok) return writeResult;
  }

  // Write quadlets
  for (const [filename, content] of files.quadlets) {
    const path = `${ctx.paths.quadletDir}/${filename}` as AbsolutePath;
    const writeResult = await writeFile(path, content);
    if (!writeResult.ok) return writeResult;
  }

  for (const [filename, content] of files.volumes) {
    const path = `${ctx.paths.quadletDir}/${filename}` as AbsolutePath;
    const writeResult = await writeFile(path, content);
    if (!writeResult.ok) return writeResult;
  }

  // 3. Reload systemd daemon
  logger.step(3, 5, "Reloading systemd daemon...");
  const reloadResult = await daemonReload({ user: ctx.user.name, uid: ctx.user.uid });
  if (!reloadResult.ok) return reloadResult;

  // 4. Enable service
  logger.step(4, 5, "Enabling service...");
  const enableResult = await enableService("caddy.service", { user: ctx.user.name, uid: ctx.user.uid });
  if (!enableResult.ok) return enableResult;

  // 5. Start service
  logger.step(5, 5, "Starting service...");
  const startResult = await startService("caddy.service", { user: ctx.user.name, uid: ctx.user.uid });
  if (!startResult.ok) return startResult;

  logger.success("Caddy setup completed successfully");
  return Ok(undefined);
};

/**
 * Start Caddy service.
 */
const start = async (ctx: ServiceContext): Promise<Result<void, DivbanError>> => {
  ctx.logger.info("Starting Caddy...");
  const result = await startService("caddy.service", { user: ctx.user.name, uid: ctx.user.uid });
  if (result.ok) {
    ctx.logger.success("Caddy started successfully");
  }
  return result;
};

/**
 * Stop Caddy service.
 */
const stop = async (ctx: ServiceContext): Promise<Result<void, DivbanError>> => {
  ctx.logger.info("Stopping Caddy...");
  const result = await stopService("caddy.service", { user: ctx.user.name, uid: ctx.user.uid });
  if (result.ok) {
    ctx.logger.success("Caddy stopped successfully");
  }
  return result;
};

/**
 * Restart Caddy service.
 */
const restart = async (ctx: ServiceContext): Promise<Result<void, DivbanError>> => {
  ctx.logger.info("Restarting Caddy...");
  const result = await restartService("caddy.service", { user: ctx.user.name, uid: ctx.user.uid });
  if (result.ok) {
    ctx.logger.success("Caddy restarted successfully");
  }
  return result;
};

/**
 * Get Caddy status.
 */
const status = async (ctx: ServiceContext): Promise<Result<ServiceStatus, DivbanError>> => {
  const running = await isServiceActive("caddy.service", { user: ctx.user.name, uid: ctx.user.uid });

  return Ok({
    running,
    containers: [
      {
        name: "caddy",
        status: running ? "running" : "stopped",
      },
    ],
  });
};

/**
 * View Caddy logs.
 */
const logs = async (ctx: ServiceContext, options: LogOptions): Promise<Result<void, DivbanError>> => {
  return journalctl("caddy.service", {
    user: ctx.user.name,
    uid: ctx.user.uid,
    follow: options.follow,
    lines: options.lines,
  });
};

/**
 * Reload Caddy configuration.
 */
const reload = async (ctx: ServiceContext): Promise<Result<void, DivbanError>> => {
  return reloadCaddy({
    caddyfilePath: `${ctx.paths.configDir}/Caddyfile` as AbsolutePath,
    user: ctx.user.name,
    uid: ctx.user.uid,
    logger: ctx.logger,
  });
};

/**
 * Caddy service implementation.
 */
export const caddyService: Service = {
  definition,
  validate,
  generate,
  setup,
  start,
  stop,
  restart,
  status,
  logs,
  reload,
};
