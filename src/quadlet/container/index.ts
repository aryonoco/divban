/**
 * Container quadlet builder.
 * Combines all container configuration modules into a single builder.
 */

import { defined } from "../../lib/bun-utils";
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
import { addSecurityEntries } from "./security";
import { addUserNsEntries } from "./user";
import { addVolumeEntries } from "./volumes";

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
      securityLabelDisable: config.securityLabelDisable,
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
  addMiscEntries(
    entries,
    defined({
      init: config.init,
      logDriver: config.logDriver,
      entrypoint: config.entrypoint,
      exec: config.exec,
      workdir: config.workdir,
      devices: config.devices,
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
export * from "./capabilities";
export * from "./environment";
export * from "./health";
export * from "./image";
export * from "./misc";
export * from "./network";
export * from "./resources";
export * from "./security";
export * from "./user";
export * from "./volumes";
