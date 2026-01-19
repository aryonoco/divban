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
import { Ok, type Result, mapResult } from "../lib/result";
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

/**
 * Write all generated files to their destinations.
 */
export const writeGeneratedFiles = async <C>(
  files: GeneratedFiles,
  ctx: ServiceContext<C>
): Promise<Result<void, DivbanError>> => {
  const { quadletDir, configDir } = ctx.paths;
  const owner = { uid: ctx.user.uid, gid: ctx.user.gid };

  // Write quadlet files
  for (const [filename, content] of files.quadlets) {
    const path = quadletFilePath(quadletDir, filename);
    const result = await writeFile(path, content);
    if (!result.ok) {
      return result;
    }
    const chownResult = await chown(path, owner);
    if (!chownResult.ok) {
      return chownResult;
    }
  }

  // Write network files
  for (const [filename, content] of files.networks) {
    const path = quadletFilePath(quadletDir, filename);
    const result = await writeFile(path, content);
    if (!result.ok) {
      return result;
    }
    const chownResult = await chown(path, owner);
    if (!chownResult.ok) {
      return chownResult;
    }
  }

  // Write volume files
  for (const [filename, content] of files.volumes) {
    const path = quadletFilePath(quadletDir, filename);
    const result = await writeFile(path, content);
    if (!result.ok) {
      return result;
    }
    const chownResult = await chown(path, owner);
    if (!chownResult.ok) {
      return chownResult;
    }
  }

  // Write environment files
  for (const [filename, content] of files.environment) {
    const path = configFilePath(configDir, filename);
    const result = await writeFile(path, content);
    if (!result.ok) {
      return result;
    }
    const chownResult = await chown(path, owner);
    if (!chownResult.ok) {
      return chownResult;
    }
  }

  // Write other config files
  for (const [filename, content] of files.other) {
    const path = configFilePath(configDir, filename);
    const result = await writeFile(path, content);
    if (!result.ok) {
      return result;
    }
    const chownResult = await chown(path, owner);
    if (!chownResult.ok) {
      return chownResult;
    }
  }

  return Ok(undefined);
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

  for (const svc of services) {
    const enableResult = await enableService(`${svc}.service`, opts);
    if (!enableResult.ok) {
      return enableResult;
    }

    if (startAfterEnable) {
      const startResult = await startService(`${svc}.service`, opts);
      if (!startResult.ok) {
        return startResult;
      }
    }
  }

  return Ok(undefined);
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
