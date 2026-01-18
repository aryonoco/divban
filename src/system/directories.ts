/**
 * Directory management for service data and configuration.
 */

import { DivbanError, ErrorCode } from "../lib/errors";
import { Err, Ok, type Result, collectResults } from "../lib/result";
import type { AbsolutePath, GroupId, UserId } from "../lib/types";
import { execSuccess } from "./exec";

export interface DirectoryOwner {
  uid: UserId;
  gid: GroupId;
}

/**
 * Ensure a directory exists with proper ownership and permissions.
 * Creates parent directories as needed (like mkdir -p).
 */
export const ensureDirectory = async (
  path: AbsolutePath,
  owner: DirectoryOwner,
  mode: string = "0755"
): Promise<Result<void, DivbanError>> => {
  // Use install -d which creates directory with correct ownership and permissions
  const result = await execSuccess([
    "install",
    "-d",
    "-m",
    mode,
    "-o",
    String(owner.uid),
    "-g",
    String(owner.gid),
    path,
  ]);

  if (!result.ok) {
    return Err(
      new DivbanError(
        ErrorCode.DIRECTORY_CREATE_FAILED,
        `Failed to create directory ${path}: ${result.error.message}`,
        result.error
      )
    );
  }

  return Ok(undefined);
};

/**
 * Ensure multiple directories exist with the same ownership.
 */
export const ensureDirectories = async (
  paths: AbsolutePath[],
  owner: DirectoryOwner,
  mode: string = "0755"
): Promise<Result<void, DivbanError>> => {
  const results = await Promise.all(paths.map((path) => ensureDirectory(path, owner, mode)));

  const collected = collectResults(results);
  if (!collected.ok) return collected;

  return Ok(undefined);
};

/**
 * Change ownership of a file or directory.
 */
export const chown = async (
  path: AbsolutePath,
  owner: DirectoryOwner,
  recursive: boolean = false
): Promise<Result<void, DivbanError>> => {
  const args = recursive
    ? ["chown", "-R", `${owner.uid}:${owner.gid}`, path]
    : ["chown", `${owner.uid}:${owner.gid}`, path];

  const result = await execSuccess(args);

  if (!result.ok) {
    return Err(
      new DivbanError(
        ErrorCode.GENERAL_ERROR,
        `Failed to change ownership of ${path}: ${result.error.message}`,
        result.error
      )
    );
  }

  return Ok(undefined);
};

/**
 * Change permissions of a file or directory.
 */
export const chmod = async (
  path: AbsolutePath,
  mode: string,
  recursive: boolean = false
): Promise<Result<void, DivbanError>> => {
  const args = recursive ? ["chmod", "-R", mode, path] : ["chmod", mode, path];

  const result = await execSuccess(args);

  if (!result.ok) {
    return Err(
      new DivbanError(
        ErrorCode.GENERAL_ERROR,
        `Failed to change permissions of ${path}: ${result.error.message}`,
        result.error
      )
    );
  }

  return Ok(undefined);
};

/**
 * Get standard directories for a service.
 */
export const getServiceDirectories = (
  dataDir: AbsolutePath,
  homeDir: AbsolutePath
): {
  data: AbsolutePath;
  config: AbsolutePath;
  quadlet: AbsolutePath;
  logs: AbsolutePath;
} => ({
  data: dataDir,
  config: `${dataDir}/config` as AbsolutePath,
  quadlet: `${homeDir}/.config/containers/systemd` as AbsolutePath,
  logs: `${dataDir}/logs` as AbsolutePath,
});

/**
 * Ensure all standard service directories exist.
 */
export const ensureServiceDirectories = async (
  dataDir: AbsolutePath,
  homeDir: AbsolutePath,
  owner: DirectoryOwner
): Promise<Result<void, DivbanError>> => {
  const dirs = getServiceDirectories(dataDir, homeDir);

  // Data directories need to be owned by the service user
  const dataDirs: AbsolutePath[] = [dirs.data, dirs.config, dirs.logs];

  // Quadlet directory needs parent directories created first
  const quadletParent = `${homeDir}/.config/containers` as AbsolutePath;
  const configParent = `${homeDir}/.config` as AbsolutePath;

  // Create in order
  const results = await Promise.all([
    ensureDirectories(dataDirs, owner),
    ensureDirectory(configParent, owner),
  ]);

  const collected = collectResults(results);
  if (!collected.ok) return collected;

  // Now create containers directory and quadlet directory
  const containerResults = await ensureDirectory(quadletParent, owner);
  if (!containerResults.ok) return containerResults;

  const quadletResult = await ensureDirectory(dirs.quadlet, owner);
  if (!quadletResult.ok) return quadletResult;

  return Ok(undefined);
};

/**
 * Remove a directory and its contents.
 */
export const removeDirectory = async (
  path: AbsolutePath,
  force: boolean = false
): Promise<Result<void, DivbanError>> => {
  const args = force ? ["rm", "-rf", path] : ["rm", "-r", path];

  const result = await execSuccess(args);

  if (!result.ok) {
    return Err(
      new DivbanError(
        ErrorCode.GENERAL_ERROR,
        `Failed to remove directory ${path}: ${result.error.message}`,
        result.error
      )
    );
  }

  return Ok(undefined);
};
