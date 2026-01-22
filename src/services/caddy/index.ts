// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Caddy reverse proxy service implementation.
 * Uses Effect's context system - dependencies accessed via yield*.
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
import { AppLogger, ServicePaths, ServiceUser, SystemCapabilities } from "../context";
import {
  type FilesWriteResult,
  type ServicesEnableResult,
  type SetupStepResource,
  createConfigValidator,
  createSingleContainerOps,
  executeSetupStepsScoped,
  releaseFileWrites,
  reloadAndEnableServicesTracked,
  rollbackServiceChanges,
  writeGeneratedFilesTracked,
} from "../helpers";
import type { GeneratedFiles, ServiceDefinition, ServiceEffect } from "../types";
import { generateCaddyfile } from "./caddyfile";
import { reloadCaddy } from "./commands/reload";
import { CaddyConfigTag } from "./config";
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
 * Uses Effect context - no ctx parameter needed.
 */
const ops = createSingleContainerOps({
  serviceName: "caddy",
  displayName: "Caddy",
});

/**
 * Validate Caddy configuration file.
 */
const validate = createConfigValidator(caddyConfigSchema);

/**
 * Generate all files for Caddy service.
 * Dependencies accessed via Effect context.
 */
const generate = (): Effect.Effect<
  GeneratedFiles,
  ServiceError | GeneralError,
  CaddyConfigTag | ServicePaths | SystemCapabilities
> =>
  Effect.gen(function* () {
    const config = yield* CaddyConfigTag;
    const paths = yield* ServicePaths;
    const system = yield* SystemCapabilities;

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

    // Generate volume quadlet for caddy data
    const dataVolume = generateVolumeQuadlet({
      name: "caddy-data",
      description: "Caddy data volume (certificates, etc.)",
    });

    // Generate volume quadlet for caddy config
    const configVolume = generateVolumeQuadlet({
      name: "caddy-config",
      description: "Caddy configuration volume",
    });

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
            source: `${paths.configDir}/Caddyfile`,
            target: "/etc/caddy/Caddyfile",
            options: "ro",
          },
          { source: "caddy-data.volume", target: "/data" },
          { source: "caddy-config.volume", target: "/config" },
        ],
        {
          selinuxEnforcing: system.selinuxEnforcing,
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

    // Return GeneratedFiles with pre-built Maps (no mutations)
    return {
      quadlets: new Map([[containerQuadlet.filename, containerQuadlet.content]]),
      networks: new Map(),
      volumes: new Map([
        [dataVolume.filename, dataVolume.content],
        [configVolume.filename, configVolume.content],
      ]),
      environment: new Map(),
      other: new Map([["Caddyfile", caddyfileContent]]),
    };
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
 * Setup step dependencies - union of all step requirements.
 */
type CaddySetupDeps = CaddyConfigTag | ServicePaths | ServiceUser | SystemCapabilities | AppLogger;

/**
 * Full setup for Caddy service.
 * Dependencies accessed via Effect context.
 */
const setup = (): Effect.Effect<
  void,
  ServiceError | SystemError | GeneralError,
  CaddySetupDeps
> => {
  // Steps access dependencies via Effect context
  const steps: SetupStepResource<
    CaddySetupState,
    ServiceError | SystemError | GeneralError,
    CaddySetupDeps
  >[] = [
    {
      message: "Generating configuration files...",
      acquire: (
        _state
      ): Effect.Effect<
        { files: GeneratedFiles },
        ServiceError | GeneralError,
        CaddyConfigTag | ServicePaths | SystemCapabilities
      > => Effect.map(generate(), (files) => ({ files })),
      // No release - pure in-memory computation
    },
    {
      message: "Writing configuration files...",
      acquire: (
        state
      ): Effect.Effect<
        { fileResults: FilesWriteResult },
        SystemError | GeneralError,
        ServicePaths | ServiceUser
      > =>
        state.files
          ? Effect.map(writeGeneratedFilesTracked(state.files), (fileResults) => ({
              fileResults,
            }))
          : Effect.fail(
              new GeneralError({
                code: ErrorCode.GENERAL_ERROR as 1,
                message: "No files generated",
              })
            ),
      release: (
        state: CaddySetupState,
        exit: Exit.Exit<unknown, unknown>
      ): Effect.Effect<void, never, ServicePaths | ServiceUser | AppLogger> =>
        releaseFileWrites(state.fileResults, Exit.isFailure(exit)),
    },
    {
      message: "Enabling and starting service...",
      acquire: (
        _state
      ): Effect.Effect<
        { serviceResults: ServicesEnableResult },
        ServiceError | SystemError | GeneralError,
        ServiceUser
      > =>
        Effect.map(reloadAndEnableServicesTracked(["caddy"], true), (serviceResults) => ({
          serviceResults,
        })),
      release: (
        state: CaddySetupState,
        exit: Exit.Exit<unknown, unknown>
      ): Effect.Effect<void, never, ServiceUser> =>
        Exit.isFailure(exit) && state.serviceResults
          ? rollbackServiceChanges(state.serviceResults)
          : Effect.void,
    },
  ];

  return executeSetupStepsScoped(steps, {});
};

/**
 * Reload Caddy configuration.
 * Dependencies accessed via Effect context.
 */
const reload = (): Effect.Effect<
  void,
  ConfigError | ServiceError | SystemError | GeneralError,
  CaddyConfigTag | ServiceUser | AppLogger
> =>
  Effect.gen(function* () {
    const user = yield* ServiceUser;
    const logger = yield* AppLogger;

    yield* reloadCaddy({
      user: user.name,
      uid: user.uid,
      logger,
      containerName: "caddy",
    });
  });

/**
 * Caddy service implementation.
 */
export const caddyService: ServiceEffect<CaddyConfig, CaddyConfigTag, typeof CaddyConfigTag> = {
  definition,
  configTag: CaddyConfigTag,
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
