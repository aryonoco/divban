// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Caddy reverse proxy service. Context system provides DI; pasta network
 * mode allows rootless binding of privileged ports 80/443.
 */

import { Effect, Option, ParseResult, pipe } from "effect";
import type { ConfigError, GeneralError, SystemError } from "../../lib/errors";
import { ErrorCode, ServiceError } from "../../lib/errors";
import {
  type PrivateIP,
  containerImage,
  containerName,
  duration,
  serviceName,
} from "../../lib/types";
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
  type EmptyState,
  type FilesWriteResult,
  Outcome,
  type ServicesEnableResult,
  SetupStep,
  cleanupFileBackups,
  createConfigValidator,
  createSingleContainerOps,
  emptyState,
  pipeline,
  reloadAndEnableServicesTracked,
  rollbackFileWrites,
  rollbackServiceChanges,
  writeGeneratedFilesTracked,
} from "../helpers";
import type { GeneratedFiles, ServiceDefinition, ServiceEffect } from "../types";
import { generateCaddyfile } from "./caddyfile";
import { reloadCaddy } from "./commands/reload";
import { CaddyConfigTag } from "./config";
import { type CaddyConfig, caddyConfigSchema } from "./schema";

const SERVICE_NAME = serviceName("caddy");
const CONTAINER_NAME = containerName("caddy");

const definition: ServiceDefinition = {
  name: SERVICE_NAME,
  description: "Caddy reverse proxy server with automatic HTTPS",
  version: "0.1.0",
  capabilities: {
    multiContainer: false,
    hasReload: true,
    hasBackup: false,
    hasRestore: false,
    hardwareAcceleration: false,
  },
};

const ops = createSingleContainerOps({
  containerName: CONTAINER_NAME,
  displayName: "Caddy",
});

const validate = createConfigValidator(caddyConfigSchema);

// Generates two volumes: caddy-data for certificates (must persist across restarts)
// and caddy-config for Caddy's internal state. Uses pasta network mode to allow
// the rootless container to bind privileged ports 80/443.
const generate = (): Effect.Effect<
  GeneratedFiles,
  ServiceError | GeneralError,
  CaddyConfigTag | ServicePaths | SystemCapabilities
> =>
  Effect.gen(function* () {
    const config = yield* CaddyConfigTag;
    const paths = yield* ServicePaths;
    const system = yield* SystemCapabilities;

    type MapHostLoopbackEffect = Effect.Effect<Option.Option<PrivateIP>, ServiceError>;
    const mapHostLoopback: Option.Option<PrivateIP> = yield* pipe(
      Option.fromNullable(config.network?.mapHostLoopback),
      Option.match({
        onNone: (): MapHostLoopbackEffect => Effect.succeed(Option.none<PrivateIP>()),
        onSome: (ip): MapHostLoopbackEffect =>
          decodePrivateIP(ip).pipe(
            Effect.map(Option.some),
            Effect.mapError(
              (e) =>
                new ServiceError({
                  code: ErrorCode.SERVICE_NOT_FOUND,
                  message: `Invalid mapHostLoopback IP: ${ParseResult.TreeFormatter.formatErrorSync(e)}`,
                })
            )
          ),
      })
    );

    const caddyfileContent = generateCaddyfile(config.caddyfile);

    const dataVolume = generateVolumeQuadlet({
      name: "caddy-data",
      description: "Caddy data volume (certificates, etc.)",
    });

    const configVolume = generateVolumeQuadlet({
      name: "caddy-config",
      description: "Caddy configuration volume",
    });

    const containerQuadlet = generateContainerQuadlet({
      name: CONTAINER_NAME,
      containerName: CONTAINER_NAME,
      description: "Caddy reverse proxy",
      image: config.container?.image ?? containerImage("docker.io/library/caddy:2-alpine"),
      networkMode: "pasta",
      mapHostLoopback: Option.getOrUndefined(mapHostLoopback),
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
        interval: duration("30s"),
        timeout: duration("10s"),
        startPeriod: duration("10s"),
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

interface GenerateOutput {
  readonly files: GeneratedFiles;
}

interface WriteFilesOutput {
  readonly fileResults: FilesWriteResult;
}

interface EnableServicesOutput {
  readonly serviceResults: ServicesEnableResult;
}

// Pure step - no resources to release on failure
const generateStep: SetupStep<
  EmptyState,
  GenerateOutput,
  ServiceError | GeneralError,
  CaddyConfigTag | ServicePaths | SystemCapabilities
> = SetupStep.pure("Generating configuration files...", (_state: EmptyState) =>
  Effect.map(generate(), (files): GenerateOutput => ({ files }))
);

// Writes config files; on failure restores from .bak backups
const writeFilesStep: SetupStep<
  EmptyState & GenerateOutput,
  WriteFilesOutput,
  SystemError | GeneralError,
  ServicePaths | ServiceUser
> = SetupStep.resource(
  "Writing configuration files...",
  (state: EmptyState & GenerateOutput) =>
    Effect.map(
      writeGeneratedFilesTracked(state.files),
      (fileResults): WriteFilesOutput => ({ fileResults })
    ),
  (state, outcome): Effect.Effect<void, never, never> =>
    Outcome.match(outcome, {
      onSuccess: (): Effect.Effect<void, never, never> =>
        cleanupFileBackups(state.fileResults.results),
      onFailure: (): Effect.Effect<void, never, never> =>
        rollbackFileWrites(state.fileResults.results),
    })
);

// Enables and starts systemd units; on failure stops/disables what was enabled
const enableServicesStep: SetupStep<
  EmptyState & GenerateOutput & WriteFilesOutput,
  EnableServicesOutput,
  ServiceError | SystemError | GeneralError,
  ServiceUser
> = SetupStep.resource(
  "Enabling and starting service...",
  (_state: EmptyState & GenerateOutput & WriteFilesOutput) =>
    Effect.map(
      reloadAndEnableServicesTracked(["caddy"], true),
      (serviceResults): EnableServicesOutput => ({ serviceResults })
    ),
  (state, outcome): Effect.Effect<void, never, ServiceUser> =>
    Outcome.match(outcome, {
      onSuccess: (): Effect.Effect<void, never, never> => Effect.void,
      onFailure: (): Effect.Effect<void, never, ServiceUser> =>
        rollbackServiceChanges(state.serviceResults),
    })
);

const setup = (): Effect.Effect<
  void,
  ServiceError | SystemError | GeneralError,
  CaddyConfigTag | ServicePaths | ServiceUser | SystemCapabilities | AppLogger
> =>
  pipeline<EmptyState>()
    .andThen(generateStep)
    .andThen(writeFilesStep)
    .andThen(enableServicesStep)
    .execute(emptyState);

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

export const caddyService: ServiceEffect<CaddyConfig, CaddyConfigTag, typeof CaddyConfigTag> = {
  definition,
  configTag: CaddyConfigTag,
  configSchema: caddyConfigSchema,
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
