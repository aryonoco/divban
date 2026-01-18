/**
 * Immich database backup command.
 * Uses Bun.gzipSync() for in-memory compression and Bun.Glob for file listing.
 */

import { Glob } from "bun";
import { formatBytes } from "../../../cli/commands/utils";
import { DivbanError, ErrorCode } from "../../../lib/errors";
import type { Logger } from "../../../lib/logger";
import { Err, Ok, type Result } from "../../../lib/result";
import type { AbsolutePath, UserId, Username } from "../../../lib/types";
import { execAsUser } from "../../../system/exec";
import { directoryExists, ensureDirectory } from "../../../system/fs";

/**
 * Compression method for backups.
 * - zstd: Zstandard compression (3-5x faster, better ratio) - default
 * - gzip: Standard gzip compression (good compatibility)
 */
export type CompressionMethod = "zstd" | "gzip";

/**
 * Compress data using the specified method.
 */
const compressData = (
  data: Uint8Array<ArrayBuffer>,
  method: CompressionMethod = "zstd"
): Uint8Array => {
  return method === "zstd" ? Bun.zstdCompressSync(data, { level: 6 }) : Bun.gzipSync(data);
};

/**
 * Get file extension for the compression method.
 */
const getCompressionExtension = (method: CompressionMethod): string => {
  return method === "zstd" ? ".zst" : ".gz";
};

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
  /** Compression method (default: zstd) */
  compression?: CompressionMethod;
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
    dbUser = "immich",
    compression = "zstd",
  } = options;

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const ext = getCompressionExtension(compression);
  const backupFilename = `immich-db-backup-${timestamp}.sql${ext}`;
  const backupPath = `${dataDir}/backups/${backupFilename}` as AbsolutePath;

  logger.info(`Creating database backup: ${backupFilename}`);

  // Ensure backup directory exists using native fs
  const backupDir = `${dataDir}/backups` as AbsolutePath;
  const mkdirResult = await ensureDirectory(backupDir);
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
    ["podman", "exec", containerName, "pg_dumpall", "-U", dbUser, "--clean", "--if-exists"],
    {
      captureStdout: true,
      captureStderr: true,
    }
  );

  if (!dumpResult.ok || dumpResult.value.exitCode !== 0) {
    const stderr = dumpResult.ok ? dumpResult.value.stderr : "";
    return Err(new DivbanError(ErrorCode.BACKUP_FAILED, `Database dump failed: ${stderr}`));
  }

  // Compress in-memory using Bun compression - no subprocess needed
  const dumpData = new Uint8Array(Buffer.from(dumpResult.value.stdout));
  const compressed = compressData(dumpData, compression);

  // Write compressed data to file
  try {
    await Bun.write(backupPath, compressed);
  } catch (e) {
    return Err(new DivbanError(ErrorCode.BACKUP_FAILED, `Failed to write backup file: ${e}`));
  }

  const file = Bun.file(backupPath);
  const size = file.size;

  logger.success(`Backup created: ${backupPath} (${formatBytes(size)})`);
  return Ok(backupPath);
};

/**
 * List available backups.
 * Uses Bun.Glob for native file discovery - no subprocess needed.
 * Finds both gzip (.sql.gz) and zstd (.sql.zst) compressed backups.
 */
export const listBackups = async (
  dataDir: AbsolutePath
): Promise<Result<string[], DivbanError>> => {
  const backupDir = `${dataDir}/backups`;

  if (!(await directoryExists(backupDir as AbsolutePath))) {
    return Ok([]);
  }

  // Match both gzip and zstd compressed backups
  const glob = new Glob("*.sql.{gz,zst}");
  const files: string[] = [];

  for await (const file of glob.scan({ cwd: backupDir, onlyFiles: true })) {
    files.push(file);
  }

  // Sort by modification time (newest first)
  const withStats = await Promise.all(
    files.map(async (f) => ({
      name: f,
      mtime: (await Bun.file(`${backupDir}/${f}`).stat())?.mtimeMs ?? 0,
    }))
  );

  withStats.sort((a, b) => b.mtime - a.mtime);
  return Ok(withStats.map((f) => f.name));
};
