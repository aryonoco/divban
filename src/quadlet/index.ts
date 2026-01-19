// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Quadlet file generation module exports.
 */

// Types
export type {
  ContainerQuadlet,
  GeneratedQuadlet,
  HealthCheck,
  NetworkQuadlet,
  PortMapping,
  SecretMount,
  ServiceConfig,
  UserNamespace,
  VolumeMount,
  VolumeQuadlet,
} from "./types";

// Format utilities
export {
  addEntries,
  addEntry,
  addEnvironment,
  createQuadletFile,
  escapeIniValue,
  formatQuadletFile,
  formatSection,
  SECTION_ORDER,
  sortSections,
} from "./format";
export type { IniSection } from "./format";

// Unit section
export {
  buildUnitDependencies,
  buildUnitSection,
  fromUnitName,
  toUnitName,
} from "./unit";
export type { UnitConfig } from "./unit";

// Service section
export {
  buildServiceSection,
  defaultServiceConfig,
  mergeServiceConfig,
} from "./service";

// Install section
export {
  buildInstallSection,
  InstallTargets,
} from "./install";
export type { InstallConfig } from "./install";

// Network quadlet
export {
  buildNetworkSection,
  createExternalNetwork,
  createInternalNetwork,
  generateNetworkQuadlet,
} from "./network";

// Volume quadlet
export {
  buildVolumeSection,
  createNamedVolume,
  createVolumeWithOptions,
  generateVolumeQuadlet,
} from "./volume";

// Container quadlet (includes all sub-modules)
export {
  buildContainerSection,
  generateContainerQuadlet,
  // Image
  addImageEntries,
  buildImageReference,
  parseImageReference,
  Registries,
  // Network
  addNetworkEntries,
  CommonPorts,
  createLocalhostPort,
  createPort,
  formatNetworkMode,
  formatPortMapping,
  // Volumes
  addVolumeEntries,
  CommonMounts,
  createBindMount,
  createNamedVolumeMount,
  createReadOnlyMount,
  createRelabeledMount,
  formatVolumeMount,
  isBindMount,
  isNamedVolume,
  processVolumes,
  relabelVolumes,
  withOwnershipFlag,
  withSELinuxRelabel,
  // Environment
  addEnvironmentEntries,
  CommonEnvVars,
  filterEnvByPrefix,
  formatEnvironmentFile,
  mergeEnvironments,
  // Secrets
  addSecretEntries,
  createEnvSecret,
  createMountedSecret,
  formatSecretMount,
  getSecretMountPath,
  // Health
  addHealthCheckEntries,
  createHealthCheck,
  createHttpHealthCheck,
  createNoopHealthCheck,
  createPostgresHealthCheck,
  createRedisHealthCheck,
  createWgetHealthCheck,
  HealthOnFailure,
  // Security
  addSecurityEntries,
  createHardenedSecurity,
  createMinimalSecurity,
  SeccompProfiles,
  SecurityProfiles,
  // Capabilities
  addCapabilityEntries,
  CapabilityProfiles,
  Capabilities,
  dropAllExcept,
  isValidCapability,
  // Resources
  addResourceEntries,
  formatMemorySize,
  parseMemorySize,
  ResourceProfiles,
  // User namespace
  addUserNsEntries,
  createAutoNs,
  createHostNs,
  createKeepIdNs,
  createRootMappedNs,
  hasUidGidMapping,
  recommendUserNs,
  UserNsModes,
  // Misc
  addMiscEntries,
  CommonDevices,
  LogDrivers,
  PullPolicies,
  StopSignals,
} from "./container";
export type {
  ContainerCapabilitiesConfig,
  ContainerEnvironmentConfig,
  ContainerMiscConfig,
  ContainerNetworkConfig,
  ContainerResourcesConfig,
  ContainerSecretsConfig,
  ContainerSecurityConfig,
  ContainerVolumeConfig,
  ImageConfig,
  VolumeProcessingOptions,
} from "./container";
