/**
 * System operations module exports.
 */

// Exec - Command execution
export {
  commandExists,
  exec,
  execAsUser,
  execOutput,
  execSuccess,
} from "./exec";
export type { ExecOptions, ExecResult } from "./exec";

// FS - Filesystem operations
export {
  appendFile,
  atomicWrite,
  backupFile,
  copyFile,
  fileExists,
  filesEqual,
  getFileSize,
  isDirectory,
  readFile,
  readFileOrEmpty,
  readLines,
  writeFile,
} from "./fs";

// UID Allocator - Dynamic UID/subuid allocation
export {
  allocateSubuidRange,
  allocateUid,
  getExistingSubuidStart,
  getNologinShell,
  getUidByUsername,
  getUsedSubuidRanges,
  getUsedUids,
  SUBUID_RANGE,
  UID_RANGE,
  userExists,
} from "./uid-allocator";

// User - Service user management
export {
  configureSubordinateIds,
  createServiceUser,
  deleteServiceUser,
  getServiceUser,
  isRoot,
  requireRoot,
} from "./user";
export type { ServiceUser } from "./user";

// Linger - User linger management
export {
  disableLinger,
  enableLinger,
  ensureLinger,
  getLingeringUsers,
  isLingerEnabled,
} from "./linger";

// Directories - Directory management
export {
  chmod,
  chown,
  ensureDirectory,
  ensureDirectories,
  ensureServiceDirectories,
  getServiceDirectories,
  removeDirectory,
} from "./directories";
export type { DirectoryOwner } from "./directories";

// Systemctl - Systemd integration
export {
  daemonReload,
  disableService,
  enableService,
  getServiceStatus,
  isServiceActive,
  isServiceEnabled,
  journalctl,
  reloadService,
  restartService,
  startService,
  stopService,
  systemctl,
} from "./systemctl";
export type { SystemctlCommand, SystemctlOptions } from "./systemctl";
