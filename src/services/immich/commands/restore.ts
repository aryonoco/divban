/**
 * Immich database restore command.
 */

import { DivbanError, ErrorCode } from "../../../lib/errors";
import { Err, Ok, type Result } from "../../../lib/result";
import type { Logger } from "../../../lib/logger";
import type { AbsolutePath, UserId, Username } from "../../../lib/types";
import { execAsUser } from "../../../system/exec";
import { fileExists } from "../../../system/fs";

export interface RestoreOptions {
  /** Path to backup file */
  backupPath: AbsolutePath;
  /** Service user */
  user: Username;
  /** Service user UID */
  uid: UserId;
  /** Logger instance */
  logger: Logger;
  /** Database container name */
  containerName?: string;
  /** Database name */
  database?: string;
  /** Database user */
  dbUser?: string;
}

/**
 * Restore a PostgreSQL database from backup.
 */
export const restoreDatabase = async (
  options: RestoreOptions
): Promise<Result<void, DivbanError>> => {
  const {
    backupPath,
    user,
    uid,
    logger,
    containerName = "immich-postgres",
    database = "immich",
    dbUser = "immich",
  } = options;

  // Check backup file exists
  if (!(await fileExists(backupPath))) {
    return Err(
      new DivbanError(
        ErrorCode.BACKUP_NOT_FOUND,
        `Backup file not found: ${backupPath}`
      )
    );
  }

  logger.info(`Restoring database from: ${backupPath}`);
  logger.warn("This will overwrite the existing database!");

  // Decompress the backup
  const gunzipResult = await execAsUser(
    user,
    uid,
    ["gunzip", "-c", backupPath],
    { captureStdout: true, captureStderr: true }
  );

  if (!gunzipResult.ok || gunzipResult.value.exitCode !== 0) {
    const stderr = gunzipResult.ok ? gunzipResult.value.stderr : "";
    return Err(
      new DivbanError(
        ErrorCode.RESTORE_FAILED,
        `Failed to decompress backup: ${stderr}`
      )
    );
  }

  // Restore using psql
  const restoreResult = await execAsUser(
    user,
    uid,
    [
      "podman",
      "exec",
      "-i",
      containerName,
      "psql",
      "-U",
      dbUser,
      "-d",
      database,
    ],
    {
      stdin: gunzipResult.value.stdout,
      captureStdout: true,
      captureStderr: true,
    }
  );

  if (!restoreResult.ok) {
    return Err(
      new DivbanError(
        ErrorCode.RESTORE_FAILED,
        "Failed to restore database",
        restoreResult.error
      )
    );
  }

  if (restoreResult.value.exitCode !== 0) {
    // psql may return non-zero for warnings, check stderr
    const stderr = restoreResult.value.stderr;
    if (stderr.includes("ERROR")) {
      return Err(
        new DivbanError(
          ErrorCode.RESTORE_FAILED,
          `Database restore failed: ${stderr}`
        )
      );
    }
    // Warnings are OK
    logger.warn(`Restore completed with warnings: ${stderr}`);
  }

  logger.success("Database restored successfully");
  return Ok(undefined);
};

/**
 * Validate a backup file.
 */
export const validateBackup = async (
  backupPath: AbsolutePath,
  user: Username,
  uid: UserId
): Promise<Result<void, DivbanError>> => {
  // Check file exists
  if (!(await fileExists(backupPath))) {
    return Err(
      new DivbanError(
        ErrorCode.BACKUP_NOT_FOUND,
        `Backup file not found: ${backupPath}`
      )
    );
  }

  // Check it's a valid gzip file
  const result = await execAsUser(
    user,
    uid,
    ["gzip", "-t", backupPath],
    { captureStderr: true }
  );

  if (!result.ok || result.value.exitCode !== 0) {
    return Err(
      new DivbanError(
        ErrorCode.GENERAL_ERROR,
        `Invalid backup file (not valid gzip): ${backupPath}`
      )
    );
  }

  return Ok(undefined);
};
