/**
 * Immich database backup command.
 */

import { DivbanError, ErrorCode } from "../../../lib/errors";
import { Err, Ok, type Result } from "../../../lib/result";
import type { Logger } from "../../../lib/logger";
import type { AbsolutePath, UserId, Username } from "../../../lib/types";
import { execAsUser } from "../../../system/exec";

export interface BackupOptions {
  /** Data directory */
  dataDir: AbsolutePath;
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
 * Create a PostgreSQL database backup.
 */
export const backupDatabase = async (
  options: BackupOptions
): Promise<Result<AbsolutePath, DivbanError>> => {
  const {
    dataDir,
    user,
    uid,
    logger,
    containerName = "immich-postgres",
    database = "immich",
    dbUser = "immich",
  } = options;

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFilename = `immich-db-backup-${timestamp}.sql.gz`;
  const backupPath = `${dataDir}/backups/${backupFilename}` as AbsolutePath;

  logger.info(`Creating database backup: ${backupFilename}`);

  // Ensure backup directory exists
  const mkdirResult = await execAsUser(user, uid, ["mkdir", "-p", `${dataDir}/backups`]);
  if (!mkdirResult.ok) {
    return Err(
      new DivbanError(
        ErrorCode.BACKUP_FAILED,
        "Failed to create backup directory",
        mkdirResult.error
      )
    );
  }

  // Run pg_dumpall inside the postgres container
  const dumpResult = await execAsUser(
    user,
    uid,
    [
      "podman",
      "exec",
      containerName,
      "pg_dumpall",
      "-U",
      dbUser,
      "--clean",
      "--if-exists",
    ],
    {
      captureStdout: true,
      captureStderr: true,
    }
  );

  if (!dumpResult.ok || dumpResult.value.exitCode !== 0) {
    const stderr = dumpResult.ok ? dumpResult.value.stderr : "";
    return Err(
      new DivbanError(
        ErrorCode.BACKUP_FAILED,
        `Database dump failed: ${stderr}`
      )
    );
  }

  // Compress and write the backup
  const gzipResult = await execAsUser(
    user,
    uid,
    ["gzip", "-c"],
    {
      stdin: dumpResult.value.stdout,
      captureStdout: true,
    }
  );

  if (!gzipResult.ok) {
    return Err(
      new DivbanError(
        ErrorCode.BACKUP_FAILED,
        "Failed to compress backup",
        gzipResult.error
      )
    );
  }

  // Write compressed data to file
  try {
    await Bun.write(backupPath, gzipResult.value.stdout);
  } catch (e) {
    return Err(
      new DivbanError(
        ErrorCode.BACKUP_FAILED,
        `Failed to write backup file: ${e}`
      )
    );
  }

  const file = Bun.file(backupPath);
  const size = file.size;

  logger.success(`Backup created: ${backupPath} (${formatBytes(size)})`);
  return Ok(backupPath);
};

/**
 * List available backups.
 */
export const listBackups = async (
  dataDir: AbsolutePath,
  user: Username,
  uid: UserId
): Promise<Result<string[], DivbanError>> => {
  const result = await execAsUser(
    user,
    uid,
    ["ls", "-1t", `${dataDir}/backups`],
    { captureStdout: true }
  );

  if (!result.ok) {
    return Err(
      new DivbanError(
        ErrorCode.GENERAL_ERROR,
        "Failed to list backups",
        result.error
      )
    );
  }

  if (result.value.exitCode !== 0) {
    // Directory might not exist
    return Ok([]);
  }

  const files = result.value.stdout
    .split("\n")
    .filter((f) => f.endsWith(".sql.gz"));

  return Ok(files);
};

/**
 * Format bytes for display.
 */
const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  return `${bytes} B`;
};
