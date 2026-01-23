// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Quadlet generation API - public interface for building Podman
 * systemd unit files. Re-exports composable entry builders,
 * section generators, and type definitions. Consumers build
 * quadlets declaratively by combining entries rather than
 * string-templating INI files manually.
 */

// Entry types
export type { Entries, Entry } from "./entry";
export { empty } from "./entry";

// Entry builders
export {
  concat,
  fromArray,
  fromArrayWith,
  fromMaybe,
  fromRecord,
  fromValue,
  when,
} from "./entry-combinators";

// Section and quadlet generators
export { makeSection } from "./section-factory";
export { makeSimpleQuadletGenerator } from "./factory";

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
  getUnitSectionEntries,
  toUnitName,
} from "./unit";
export type { UnitConfig } from "./unit";

// Service section
export {
  buildServiceSection,
  defaultServiceConfig,
  getServiceSectionEntries,
  mergeServiceConfig,
} from "./service";

// Install section
export {
  buildInstallSection,
  getInstallSectionEntries,
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
  getImageEntries,
  buildImageReference,
  parseImageReference,
  Registries,
  // Network
  getNetworkEntries,
  CommonPorts,
  createLocalhostPort,
  createPort,
  formatNetworkMode,
  formatPortMapping,
  // Volumes
  getVolumeEntries,
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
  getEnvironmentEntries,
  CommonEnvVars,
  filterEnvByPrefix,
  formatEnvironmentFile,
  mergeEnvironments,
  // Secrets
  getSecretEntries,
  createEnvSecret,
  createMountedSecret,
  formatSecretMount,
  getSecretMountPath,
  // Health
  getHealthCheckEntries,
  createHealthCheck,
  createHttpHealthCheck,
  createNoopHealthCheck,
  createPostgresHealthCheck,
  createRedisHealthCheck,
  createWgetHealthCheck,
  HealthOnFailure,
  // Security
  getSecurityEntries,
  createHardenedSecurity,
  createMinimalSecurity,
  SeccompProfiles,
  SecurityProfiles,
  // Capabilities
  getCapabilityEntries,
  CapabilityProfiles,
  Capabilities,
  dropAllExcept,
  isValidCapability,
  // Resources
  getResourceEntries,
  formatMemorySize,
  parseMemorySize,
  ResourceProfiles,
  // User namespace
  getUserNsEntries,
  createAutoNs,
  createHostNs,
  createKeepIdNs,
  createRootMappedNs,
  hasUidGidMapping,
  recommendUserNs,
  UserNsModes,
  // Misc
  getMiscEntries,
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
