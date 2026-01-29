// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

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
  usernameSchema,
  volumeMountSchema,
} from "./schema";
export type {
  ContainerBaseConfig,
  GlobalConfig,
  ServiceBaseConfig,
  VolumeMountConfig,
  VolumeMountConfigInput,
} from "./schema";
export type { ServiceRestartPolicy } from "./field-values";

export {
  findServiceConfig,
  loadGlobalConfig,
  loadServiceConfig,
  loadTomlFile,
} from "./loader";

export {
  BaseDataDirOptionConfig,
  DebugModeConfig,
  HomeConfig,
  LogFormatOptionConfig,
  LogLevelOptionConfig,
} from "./env";

export { resolve } from "./resolve";
export type { ConfigField } from "./resolve";

export {
  AUTO_UPDATE_STRING_VALUES,
  HEALTH_CHECK_ON_FAILURE_VALUES,
  LOG_FORMAT_DEFAULT,
  LOG_FORMAT_VALUES,
  LOG_LEVEL_DEFAULT,
  LOG_LEVEL_VALUES,
  NETWORK_MODE_GLOBAL_VALUES,
  NETWORK_MODE_VALUES,
  PROTOCOL_VALUES,
  SERVICE_RESTART_VALUES,
} from "./field-values";
export type {
  AutoUpdateString,
  HealthCheckOnFailure,
  LogFormat,
  LogLevel,
  NetworkMode,
  NetworkModeGlobal,
  Protocol,
} from "./field-values";

export {
  CURRENT_CONFIG_SCHEMA_VERSION,
  SUPPORTED_CONFIG_SCHEMA_VERSIONS,
  validateConfigCompatibility,
} from "./version-compat";
