// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Caddy reverse proxy service implementation.
 */

import { Effect, Exit, ParseResult } from "effect";
import {
  type ConfigError,
  ErrorCode,
  GeneralError,
  ServiceError,
  type SystemError,
} from "../../lib/errors";
import type { PrivateIP, ServiceName } from "../../lib/types";
import { decodePrivateIP } from "../../lib/types";
import {
  createHttpHealthCheck,
  createRootMappedNs,
  generateContainerQuadlet,
  generateVolumeQuadlet,
  processVolumes,
} from "../../quadlet";
import {
  type FilesWriteResult,
  type ServicesEnableResult,
  type SetupStepAcquireResult,
  type SetupStepResource,
  createConfigValidator,
  createSingleContainerOps,
  executeSetupStepsScoped,
  releaseFileWrites,
  reloadAndEnableServicesTracked,
  rollbackServiceChanges,
  writeGeneratedFilesTracked,
} from "../helpers";
import type { GeneratedFiles, ServiceContext, ServiceDefinition, ServiceEffect } from "../types";
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
const validate = createConfigValidator(caddyConfigSchema);

/**
 * Generate all files for Caddy service.
 */
const generate = (
  ctx: ServiceContext<CaddyConfig>
): Effect.Effect<GeneratedFiles, ServiceError | GeneralError> =>
  Effect.gen(function* () {
    const { config } = ctx;
    const files = createGeneratedFiles();

    // Validate mapHostLoopback if provided
    let mapHostLoopback: PrivateIP | undefined;
    if (config.network?.mapHostLoopback) {
      mapHostLoopback = yield* decodePrivateIP(config.network.mapHostLoopback).pipe(
        Effect.mapError(
          (e) =>
            new ServiceError({
              code: ErrorCode.SERVICE_NOT_FOUND as 30,
              message: `Invalid mapHostLoopback IP: ${ParseResult.TreeFormatter.formatErrorSync(e)}`,
            })
        )
      );
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

    return files;
  });

/**
 * Setup state for Caddy - tracks data passed between steps.
 */
interface CaddySetupState {
  files?: GeneratedFiles;
  fileResults?: FilesWriteResult;
  serviceResults?: ServicesEnableResult;
}

/**
 * Full setup for Caddy service.
 * Uses executeSetupStepsScoped for clean sequential execution with state threading.
 */
const setup = (
  ctx: ServiceContext<CaddyConfig>
): Effect.Effect<void, ServiceError | SystemError | GeneralError> => {
  const steps: SetupStepResource<CaddyConfig, CaddySetupState>[] = [
    {
      message: "Generating configuration files...",
      acquire: (ctx): SetupStepAcquireResult<CaddySetupState, ServiceError | GeneralError> =>
        Effect.map(generate(ctx), (files) => ({ files })),
      // No release - pure in-memory computation
    },
    {
      message: "Writing configuration files...",
      acquire: (
        ctx,
        state
      ): SetupStepAcquireResult<CaddySetupState, ServiceError | SystemError | GeneralError> =>
        state.files
          ? Effect.map(writeGeneratedFilesTracked(state.files, ctx), (fileResults) => ({
              fileResults,
            }))
          : Effect.fail(
              new GeneralError({
                code: ErrorCode.GENERAL_ERROR as 1,
                message: "No files generated",
              })
            ),
      release: (_ctx, state, exit): Effect.Effect<void, never> =>
        releaseFileWrites(state.fileResults, Exit.isFailure(exit)),
    },
    {
      message: "Enabling and starting service...",
      acquire: (
        ctx
      ): SetupStepAcquireResult<CaddySetupState, ServiceError | SystemError | GeneralError> =>
        Effect.map(reloadAndEnableServicesTracked(ctx, ["caddy"], true), (serviceResults) => ({
          serviceResults,
        })),
      release: (ctx, state, exit): Effect.Effect<void, never> =>
        Exit.isFailure(exit) && state.serviceResults
          ? rollbackServiceChanges(ctx, state.serviceResults)
          : Effect.void,
    },
  ];

  return executeSetupStepsScoped(ctx, steps);
};

/**
 * Reload Caddy configuration.
 */
const reload = (
  ctx: ServiceContext<CaddyConfig>
): Effect.Effect<void, ConfigError | ServiceError | SystemError | GeneralError> =>
  reloadCaddy({
    user: ctx.user.name,
    uid: ctx.user.uid,
    logger: ctx.logger,
    containerName: "caddy",
  });

/**
 * Caddy service implementation.
 */
export const caddyService: ServiceEffect<CaddyConfig> = {
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
