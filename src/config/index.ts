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
  directoryExists,
  fileExists,
  findServiceConfig,
  loadGlobalConfig,
  loadServiceConfig,
  loadTomlFile,
} from "./loader";

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
