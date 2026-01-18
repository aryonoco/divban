// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

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
