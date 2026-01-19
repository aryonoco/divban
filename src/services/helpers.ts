// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Service implementation helpers to reduce code duplication.
 */

import type { DivbanError } from "../lib/errors";
import { configFilePath, quadletFilePath } from "../lib/paths";
import { Ok, type Result, asyncFlatMapResult, mapResult, sequence } from "../lib/result";
import type { AbsolutePath } from "../lib/types";
import { chown } from "../system/directories";
import { writeFile } from "../system/fs";
import {
  daemonReload,
  enableService,
  isServiceActive,
  journalctl,
  restartService,
  startService,
  stopService,
} from "../system/systemctl";
import type {
  BackupResult,
  GeneratedFiles,
  LogOptions,
  ServiceContext,
  ServiceStatus,
} from "./types";

// ============================================================================
// File Writing Helpers
// ============================================================================

import type { GroupId, UserId } from "../lib/types";

/**
 * Write a file and set ownership.
 */
const writeAndOwn = async (
  path: AbsolutePath,
  content: string,
  owner: { uid: UserId; gid: GroupId }
): Promise<Result<void, DivbanError>> =>
  asyncFlatMapResult(await writeFile(path, content), () => chown(path, owner));

type WriteOp = () => Promise<Result<void, DivbanError>>;

/**
 * Write all generated files to their destinations.
 */
export const writeGeneratedFiles = async <C>(
  files: GeneratedFiles,
  ctx: ServiceContext<C>
): Promise<Result<void, DivbanError>> => {
  const { quadletDir, configDir } = ctx.paths;
  const owner = { uid: ctx.user.uid, gid: ctx.user.gid };

  const toQuadletOp =
    ([filename, content]: [string, string]): WriteOp =>
    (): Promise<Result<void, DivbanError>> =>
      writeAndOwn(quadletFilePath(quadletDir, filename), content, owner);

  const toConfigOp =
    ([filename, content]: [string, string]): WriteOp =>
    (): Promise<Result<void, DivbanError>> =>
      writeAndOwn(configFilePath(configDir, filename), content, owner);

  const ops: WriteOp[] = [
    ...[...files.quadlets].map(toQuadletOp),
    ...[...files.networks].map(toQuadletOp),
    ...[...files.volumes].map(toQuadletOp),
    ...[...files.environment].map(toConfigOp),
    ...[...files.other].map(toConfigOp),
  ];

  return mapResult(await sequence(ops), () => undefined);
};

// ============================================================================
// Single-Container Service Operations
// ============================================================================

export interface SingleContainerConfig {
  serviceName: string;
  displayName: string;
}

/**
 * Operations returned by createSingleContainerOps.
 */
export interface SingleContainerOps<C> {
  start: (ctx: ServiceContext<C>) => Promise<Result<void, DivbanError>>;
  stop: (ctx: ServiceContext<C>) => Promise<Result<void, DivbanError>>;
  restart: (ctx: ServiceContext<C>) => Promise<Result<void, DivbanError>>;
  status: (ctx: ServiceContext<C>) => Promise<Result<ServiceStatus, DivbanError>>;
  logs: (ctx: ServiceContext<C>, options: LogOptions) => Promise<Result<void, DivbanError>>;
}

/**
 * Create standard start/stop/restart/status/logs for single-container services.
 */
export const createSingleContainerOps = <C>(
  config: SingleContainerConfig
): SingleContainerOps<C> => {
  const unit = `${config.serviceName}.service`;

  return {
    start: async (ctx: ServiceContext<C>): Promise<Result<void, DivbanError>> => {
      ctx.logger.info(`Starting ${config.displayName}...`);
      const result = await startService(unit, { user: ctx.user.name, uid: ctx.user.uid });
      if (result.ok) {
        ctx.logger.success(`${config.displayName} started successfully`);
      }
      return result;
    },

    stop: async (ctx: ServiceContext<C>): Promise<Result<void, DivbanError>> => {
      ctx.logger.info(`Stopping ${config.displayName}...`);
      const result = await stopService(unit, { user: ctx.user.name, uid: ctx.user.uid });
      if (result.ok) {
        ctx.logger.success(`${config.displayName} stopped successfully`);
      }
      return result;
    },

    restart: async (ctx: ServiceContext<C>): Promise<Result<void, DivbanError>> => {
      ctx.logger.info(`Restarting ${config.displayName}...`);
      const result = await restartService(unit, { user: ctx.user.name, uid: ctx.user.uid });
      if (result.ok) {
        ctx.logger.success(`${config.displayName} restarted successfully`);
      }
      return result;
    },

    status: async (ctx: ServiceContext<C>): Promise<Result<ServiceStatus, DivbanError>> => {
      const running = await isServiceActive(unit, { user: ctx.user.name, uid: ctx.user.uid });
      return Ok({
        running,
        containers: [
          {
            name: config.serviceName,
            status: running ? { status: "running" } : { status: "stopped" },
          },
        ],
      });
    },

    logs: (ctx: ServiceContext<C>, options: LogOptions): Promise<Result<void, DivbanError>> => {
      return journalctl(unit, {
        user: ctx.user.name,
        uid: ctx.user.uid,
        follow: options.follow,
        lines: options.lines,
      });
    },
  };
};

// ============================================================================
// Systemd Helpers
// ============================================================================

/**
 * Reload daemon, enable services, optionally start them.
 */
export const reloadAndEnableServices = async <C>(
  ctx: ServiceContext<C>,
  services: string[],
  startAfterEnable = true
): Promise<Result<void, DivbanError>> => {
  const opts = { user: ctx.user.name, uid: ctx.user.uid };

  const reloadResult = await daemonReload(opts);
  if (!reloadResult.ok) {
    return reloadResult;
  }

  const ops = services.flatMap((svc) =>
    startAfterEnable
      ? [() => enableService(`${svc}.service`, opts), () => startService(`${svc}.service`, opts)]
      : [() => enableService(`${svc}.service`, opts)]
  );

  return mapResult(await sequence(ops), () => undefined);
};

// ============================================================================
// Backup Helper
// ============================================================================

/**
 * Wrap a backup function to return BackupResult with file stats.
 */
export const wrapBackupResult = async (
  backupFn: () => Promise<Result<AbsolutePath, DivbanError>>
): Promise<Result<BackupResult, DivbanError>> => {
  return mapResult(await backupFn(), (path) => {
    const file = Bun.file(path);
    return {
      path,
      size: file.size,
      timestamp: new Date(),
    };
  });
};
