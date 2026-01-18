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
  shell,
  shellAsUser,
  shellBlob,
  shellJson,
  shellLines,
  shellText,
} from "./exec";
export type { ExecOptions, ExecResult, ShellOptions } from "./exec";

// FS - Filesystem operations
export {
  appendFile,
  atomicWrite,
  backupFile,
  copyFile,
  deleteFile,
  deleteFileIfExists,
  directoryExists,
  fileExists,
  filesEqual,
  getFileSize,
  globFiles,
  globMatch,
  hashContent,
  hashFile,
  isDirectory,
  listDirectory,
  objectsEqual,
  readFile,
  readFileOrEmpty,
  readLines,
  sha256File,
  watchFile,
  writeFile,
} from "./fs";

// Compress - Compression utilities (gzip, deflate, zstd)
export {
  compressFile,
  compressFileZstd,
  compressionRatio,
  decompressFile,
  decompressFileZstd,
  deflateSync,
  gunzipString,
  gunzipSync,
  gzipString,
  gzipSync,
  inflateSync,
  spaceSavings,
  zstdCompress,
  zstdCompressString,
  zstdCompressSync,
  zstdDecompress,
  zstdDecompressString,
  zstdDecompressSync,
} from "./compress";
export type { CompressionLevel, GzipOptions, ZstdLevel, ZstdOptions } from "./compress";

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
