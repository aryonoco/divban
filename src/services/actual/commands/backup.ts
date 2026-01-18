/**
 * Actual Budget backup command.
 * Creates a compressed archive of the Actual data directory.
 */

import { DivbanError, ErrorCode } from "../../../lib/errors";
import type { Logger } from "../../../lib/logger";
import { Err, Ok, type Result } from "../../../lib/result";
import type { AbsolutePath, UserId, Username } from "../../../lib/types";
import { execAsUser } from "../../../system/exec";
import { directoryExists } from "../../../system/fs";

export interface BackupOptions {
  /** Data directory containing Actual files */
  dataDir: AbsolutePath;
  /** Service user */
  user: Username;
  /** Service user UID */
  uid: UserId;
  /** Logger instance */
  logger: Logger;
}

/**
 * Create a backup of the Actual data directory.
 * Creates a compressed tar archive of all data files.
 */
export const backupActual = async (
  options: BackupOptions
): Promise<Result<AbsolutePath, DivbanError>> => {
  const { dataDir, user, uid, logger } = options;

  // Check data directory exists
  if (!(await directoryExists(dataDir))) {
    return Err(new DivbanError(ErrorCode.BACKUP_FAILED, `Data directory not found: ${dataDir}`));
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFilename = `actual-backup-${timestamp}.tar.gz`;
  const backupsDir = `${dataDir}/backups` as AbsolutePath;
  const backupPath = `${backupsDir}/${backupFilename}` as AbsolutePath;

  logger.info(`Creating backup: ${backupFilename}`);

  // Ensure backup directory exists
  const mkdirResult = await execAsUser(user, uid, ["mkdir", "-p", backupsDir]);
  if (!mkdirResult.ok) {
    return Err(
      new DivbanError(
        ErrorCode.BACKUP_FAILED,
        "Failed to create backup directory",
        mkdirResult.error
      )
    );
  }

  // Create tar archive of data directory
  // Exclude the backups directory itself to avoid recursion
  const tarResult = await execAsUser(
    user,
    uid,
    ["tar", "-czf", backupPath, "--exclude=backups", "-C", dataDir, "."],
    { captureStderr: true }
  );

  if (!tarResult.ok) {
    return Err(
      new DivbanError(ErrorCode.BACKUP_FAILED, "Failed to create backup archive", tarResult.error)
    );
  }

  if (tarResult.value.exitCode !== 0) {
    return Err(new DivbanError(ErrorCode.BACKUP_FAILED, `tar failed: ${tarResult.value.stderr}`));
  }

  // Get backup size
  const statResult = await execAsUser(user, uid, ["stat", "-c", "%s", backupPath], {
    captureStdout: true,
  });

  let sizeStr = "unknown";
  if (statResult.ok && statResult.value.exitCode === 0) {
    const bytes = Number.parseInt(statResult.value.stdout.trim(), 10);
    sizeStr = formatBytes(bytes);
  }

  logger.success(`Backup created: ${backupPath} (${sizeStr})`);
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
  const backupsDir = `${dataDir}/backups`;

  const result = await execAsUser(user, uid, ["ls", "-1t", backupsDir], { captureStdout: true });

  if (!result.ok) {
    return Err(new DivbanError(ErrorCode.GENERAL_ERROR, "Failed to list backups", result.error));
  }

  if (result.value.exitCode !== 0) {
    // Directory might not exist yet
    return Ok([]);
  }

  const files = result.value.stdout.split("\n").filter((f) => f.endsWith(".tar.gz"));

  return Ok(files);
};

/**
 * Restore from a backup archive.
 */
export const restoreActual = async (
  backupPath: AbsolutePath,
  dataDir: AbsolutePath,
  user: Username,
  uid: UserId,
  logger: Logger
): Promise<Result<void, DivbanError>> => {
  // Check backup file exists
  const checkResult = await execAsUser(user, uid, ["test", "-f", backupPath], {});

  if (!checkResult.ok || checkResult.value.exitCode !== 0) {
    return Err(new DivbanError(ErrorCode.BACKUP_NOT_FOUND, `Backup file not found: ${backupPath}`));
  }

  logger.info(`Restoring from: ${backupPath}`);
  logger.warn("This will overwrite existing data!");

  // Extract archive to data directory
  const tarResult = await execAsUser(user, uid, ["tar", "-xzf", backupPath, "-C", dataDir], {
    captureStderr: true,
  });

  if (!tarResult.ok) {
    return Err(
      new DivbanError(ErrorCode.RESTORE_FAILED, "Failed to extract backup archive", tarResult.error)
    );
  }

  if (tarResult.value.exitCode !== 0) {
    return Err(
      new DivbanError(ErrorCode.RESTORE_FAILED, `tar extract failed: ${tarResult.value.stderr}`)
    );
  }

  logger.success("Restore completed successfully");
  return Ok(undefined);
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
