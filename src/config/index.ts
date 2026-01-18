/**
 * Configuration module exports.
 */

// Schema exports
export {
  absolutePathSchema,
  containerBaseSchema,
  containerImageSchema,
  getConfigDir,
  getQuadletDir,
  getServiceDataDir,
  getServiceUsername,
  globalConfigSchema,
  healthCheckSchema,
  portSchema,
  serviceBaseSchema,
  serviceRestartSchema,
  usernameSchema,
  volumeMountSchema,
} from "./schema";
export type {
  ContainerBaseConfig,
  GlobalConfig,
  ServiceBaseConfig,
} from "./schema";

// Loader exports
export {
  findServiceConfig,
  loadGlobalConfig,
  loadServiceConfig,
  loadTomlFile,
} from "./loader";

// Re-export filesystem utilities from system/fs for backwards compatibility
export { directoryExists, fileExists } from "../system/fs";

// Merge exports
export {
  addTimezoneToEnv,
  deepMerge,
  getLoggingSettings,
  getPathSettings,
  getUserAllocationSettings,
  mergeContainerDefaults,
  mergeEnvironment,
} from "./merge";
