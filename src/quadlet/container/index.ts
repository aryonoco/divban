// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Container quadlet builder.
 * Combines all container configuration modules into a single builder.
 */

import { fromUndefined, isSome } from "../../lib/option";
import type { IniSection } from "../format";
import { createQuadletFile } from "../format";
import { buildInstallSection } from "../install";
import { buildServiceSection } from "../service";
import type { ContainerQuadlet, GeneratedQuadlet } from "../types";
import { buildUnitDependencies, buildUnitSection } from "../unit";
import { addCapabilityEntries } from "./capabilities";
import { addEnvironmentEntries } from "./environment";
import { addHealthCheckEntries } from "./health";
import { addImageEntries } from "./image";
import { addMiscEntries } from "./misc";
import { addNetworkEntries } from "./network";
import { addResourceEntries } from "./resources";
import { addSecretEntries } from "./secrets";
import { addSecurityEntries } from "./security";
import { addUserNsEntries } from "./user";
import { addVolumeEntries } from "./volumes";

/**
 * Create an object with only defined properties.
 * Useful for passing objects to functions with optional properties
 * when exactOptionalPropertyTypes is enabled in TypeScript.
 */
const defined = <T extends Record<string, unknown>>(obj: T): T => {
  const result = {} as T;
  for (const key of Object.keys(obj) as (keyof T)[]) {
    if (isSome(fromUndefined(obj[key]))) {
      result[key] = obj[key];
    }
  }
  return result;
};

/**
 * Build the [Container] section for a container quadlet.
 */
export const buildContainerSection = (config: ContainerQuadlet): IniSection => {
  const entries: Array<{ key: string; value: string }> = [];

  // Image configuration
  addImageEntries(
    entries,
    defined({
      image: config.image,
      imageDigest: config.imageDigest,
      autoUpdate: config.autoUpdate,
    })
  );

  // Network configuration
  addNetworkEntries(
    entries,
    defined({
      network: config.network,
      networkMode: config.networkMode,
      mapHostLoopback: config.mapHostLoopback,
      ports: config.ports,
      hostname: config.hostname,
      dns: config.dns,
    })
  );

  // Volume configuration
  addVolumeEntries(
    entries,
    defined({
      volumes: config.volumes,
      tmpfs: config.tmpfs,
    })
  );

  // Environment configuration
  addEnvironmentEntries(
    entries,
    defined({
      environmentFiles: config.environmentFiles,
      environment: config.environment,
    })
  );

  // Secrets configuration
  addSecretEntries(entries, defined({ secrets: config.secrets }));

  // User namespace configuration
  addUserNsEntries(entries, config.userNs);

  // Health check configuration
  addHealthCheckEntries(entries, config.healthCheck);

  // Security configuration
  addSecurityEntries(
    entries,
    defined({
      readOnlyRootfs: config.readOnlyRootfs,
      noNewPrivileges: config.noNewPrivileges,
      seccompProfile: config.seccompProfile,
    })
  );

  // Capability configuration
  addCapabilityEntries(
    entries,
    defined({
      capAdd: config.capAdd,
      capDrop: config.capDrop,
    })
  );

  // Resource configuration
  addResourceEntries(
    entries,
    defined({
      shmSize: config.shmSize,
      memory: config.memory,
      pidsLimit: config.pidsLimit,
    })
  );

  // Misc configuration
  // Default containerName to name for DNS resolution in podman networks
  addMiscEntries(
    entries,
    defined({
      init: config.init,
      logDriver: config.logDriver,
      entrypoint: config.entrypoint,
      exec: config.exec,
      workdir: config.workdir,
      devices: config.devices,
      sysctl: config.sysctl,
      containerName: config.containerName ?? config.name,
    })
  );

  return { name: "Container", entries };
};

/**
 * Generate a complete container quadlet file.
 */
export const generateContainerQuadlet = (config: ContainerQuadlet): GeneratedQuadlet => {
  const sections: IniSection[] = [];

  // Unit section with dependencies
  const unitDeps = buildUnitDependencies(
    config.requires,
    config.wants,
    config.after ?? config.requires, // Default: after = requires
    config.before
  );

  sections.push(
    buildUnitSection({
      description: config.description,
      ...unitDeps,
    })
  );

  // Container section
  sections.push(buildContainerSection(config));

  // Service section
  sections.push(buildServiceSection(config.service));

  // Install section
  sections.push(buildInstallSection(defined({ wantedBy: config.wantedBy })));

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
  addCapabilityEntries,
  Capabilities,
  dropAllExcept,
  CapabilityProfiles,
  isValidCapability,
} from "./capabilities";

// environment.ts
export type { ContainerEnvironmentConfig } from "./environment";
export {
  addEnvironmentEntries,
  formatEnvironmentFile,
  CommonEnvVars,
  mergeEnvironments,
  filterEnvByPrefix,
} from "./environment";

// secrets.ts
export type { ContainerSecretsConfig } from "./secrets";
export {
  addSecretEntries,
  createEnvSecret,
  createMountedSecret,
  formatSecretMount,
  getSecretMountPath,
} from "./secrets";

// health.ts
export {
  addHealthCheckEntries,
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
export { addImageEntries, parseImageReference, buildImageReference, Registries } from "./image";

// misc.ts
export type { ContainerMiscConfig } from "./misc";
export { addMiscEntries, LogDrivers, StopSignals, PullPolicies, CommonDevices } from "./misc";

// network.ts
export type { ContainerNetworkConfig } from "./network";
export {
  formatPortMapping,
  formatNetworkMode,
  addNetworkEntries,
  createPort,
  createLocalhostPort,
  CommonPorts,
} from "./network";

// resources.ts
export type { ContainerResourcesConfig } from "./resources";
export {
  addResourceEntries,
  parseMemorySize,
  formatMemorySize,
  ResourceProfiles,
} from "./resources";

// security.ts
export type { ContainerSecurityConfig } from "./security";
export {
  addSecurityEntries,
  createHardenedSecurity,
  createMinimalSecurity,
  SecurityProfiles,
  SeccompProfiles,
} from "./security";

// user.ts
export {
  addUserNsEntries,
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
} from "./volumes";
