// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Container quadlet composition - assembles separate config modules into
 * a complete Container section. Each aspect (network, volumes, security,
 * etc.) is handled by a dedicated module for testability and reuse.
 * The builder combines them using structural subtyping - ContainerQuadlet
 * satisfies all sub-config interfaces, enabling direct pass-through.
 */

import { concat } from "../entry-combinators";
import type { IniSection } from "../format";
import { createQuadletFile } from "../format";
import { buildInstallSection } from "../install";
import { buildServiceSection } from "../service";
import type { ContainerQuadlet, GeneratedQuadlet } from "../types";
import { buildUnitDependencies, buildUnitSection } from "../unit";
import { getCapabilityEntries } from "./capabilities";
import { getEnvironmentEntries } from "./environment";
import { getHealthCheckEntries } from "./health";
import { getImageEntries } from "./image";
import { getMiscEntries } from "./misc";
import { getNetworkEntries } from "./network";
import { getResourceEntries } from "./resources";
import { getSecretEntries } from "./secrets";
import { getSecurityEntries } from "./security";
import { getUserNsEntries } from "./user";
import { getVolumeEntries } from "./volumes";

/**
 * Build container section by composing all entry generators.
 */
export const buildContainerSection = (config: ContainerQuadlet): IniSection => ({
  name: "Container",
  entries: concat(
    // ImageConfig: explicit object needed because image is required in ImageConfig
    getImageEntries({
      image: config.image,
      imageDigest: config.imageDigest,
      autoUpdate: config.autoUpdate,
    }),
    // These all accept their respective config types - direct pass via structural subtyping
    getNetworkEntries(config),
    getVolumeEntries(config),
    getEnvironmentEntries(config),
    getSecretEntries(config),
    getSecurityEntries(config),
    getCapabilityEntries(config),
    getResourceEntries(config),
    // These take specific types, not config interfaces
    getUserNsEntries(config.userNs),
    getHealthCheckEntries(config.healthCheck),
    // MiscConfig: need spread for containerName default (falls back to unit name)
    getMiscEntries({ ...config, containerName: config.containerName ?? config.name })
  ),
});

/**
 * Generate a complete container quadlet file.
 */
export const generateContainerQuadlet = (config: ContainerQuadlet): GeneratedQuadlet => {
  const unitDeps = buildUnitDependencies(
    config.requires,
    config.wants,
    config.after ?? config.requires,
    config.before
  );

  const sections: IniSection[] = [
    buildUnitSection({ description: config.description, ...unitDeps }),
    buildContainerSection(config),
    buildServiceSection(config.service),
    buildInstallSection({
      ...(config.wantedBy !== undefined && { wantedBy: config.wantedBy }),
    }),
  ];

  return {
    filename: `${config.name}.container`,
    content: createQuadletFile(sections),
    type: "container",
  };
};

// Re-export all container modules

// capabilities.ts
export type { ContainerCapabilitiesConfig } from "./capabilities";
export {
  getCapabilityEntries,
  Capabilities,
  dropAllExcept,
  CapabilityProfiles,
  isValidCapability,
} from "./capabilities";

// environment.ts
export type { ContainerEnvironmentConfig } from "./environment";
export {
  getEnvironmentEntries,
  formatEnvironmentFile,
  CommonEnvVars,
  mergeEnvironments,
  filterEnvByPrefix,
} from "./environment";

// secrets.ts
export type { ContainerSecretsConfig } from "./secrets";
export {
  getSecretEntries,
  createEnvSecret,
  createMountedSecret,
  formatSecretMount,
  getSecretMountPath,
} from "./secrets";

// health.ts
export {
  getHealthCheckEntries,
  createHealthCheck,
  createHttpHealthCheck,
  createWgetHealthCheck,
  createPostgresHealthCheck,
  createRedisHealthCheck,
  createNoopHealthCheck,
  HealthOnFailure,
} from "./health";

// image.ts
export type { ImageConfig } from "./image";
export {
  getImageEntries,
  parseImageReference,
  buildImageReference,
  Registries,
} from "./image";

// misc.ts
export type { ContainerMiscConfig } from "./misc";
export {
  getMiscEntries,
  LogDrivers,
  StopSignals,
  PullPolicies,
  CommonDevices,
} from "./misc";

// network.ts
export type { ContainerNetworkConfig } from "./network";
export {
  formatPortMapping,
  formatNetworkMode,
  getNetworkEntries,
  createPort,
  createLocalhostPort,
  CommonPorts,
} from "./network";

// resources.ts
export type { ContainerResourcesConfig } from "./resources";
export {
  getResourceEntries,
  parseMemorySize,
  formatMemorySize,
  ResourceProfiles,
} from "./resources";

// security.ts
export type { ContainerSecurityConfig } from "./security";
export {
  getSecurityEntries,
  createHardenedSecurity,
  createMinimalSecurity,
  SecurityProfiles,
  SeccompProfiles,
} from "./security";

// user.ts
export {
  getUserNsEntries,
  createAutoNs,
  createHostNs,
  createKeepIdNs,
  createRootMappedNs,
  hasUidGidMapping,
  recommendUserNs,
  UserNsModes,
} from "./user";

// volumes.ts
export type { ContainerVolumeConfig, VolumeProcessingOptions } from "./volumes";
export {
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
} from "./volumes";
