/**
 * Container resource limits configuration for quadlet files.
 */

import { addEntry } from "../format";

/**
 * Top-level regex for memory size parsing (better performance).
 */
const MEMORY_SIZE_REGEX = /^(\d+(?:\.\d+)?)\s*([kmgtKMGT])?[bB]?$/;

export interface ContainerResourcesConfig {
  /** Shared memory size (e.g., "64m", "1g") */
  shmSize?: string | undefined;
  /** Memory limit (e.g., "512m", "2g") */
  memory?: string | undefined;
  /** Memory + swap limit */
  memorySwap?: string | undefined;
  /** Memory reservation (soft limit) */
  memoryReservation?: string | undefined;
  /** CPU quota (e.g., "50000" for 50% of one CPU) */
  cpuQuota?: number | undefined;
  /** CPU period (default 100000) */
  cpuPeriod?: number | undefined;
  /** CPU shares (relative weight) */
  cpuShares?: number | undefined;
  /** CPUs to use (e.g., "0-2" or "0,1") */
  cpusetCpus?: string | undefined;
  /** PIDs limit */
  pidsLimit?: number | undefined;
  /** Block IO weight (10-1000) */
  blkioWeight?: number | undefined;
}

/**
 * Add resource-related entries to a section.
 */
export const addResourceEntries = (
  entries: Array<{ key: string; value: string }>,
  config: ContainerResourcesConfig
): void => {
  addEntry(entries, "ShmSize", config.shmSize);
  addEntry(entries, "Memory", config.memory);
  addEntry(entries, "MemorySwap", config.memorySwap);
  addEntry(entries, "MemoryReservation", config.memoryReservation);
  addEntry(entries, "CpuQuota", config.cpuQuota);
  addEntry(entries, "CpuPeriod", config.cpuPeriod);
  addEntry(entries, "CpuShares", config.cpuShares);
  addEntry(entries, "CpusetCpus", config.cpusetCpus);
  addEntry(entries, "PidsLimit", config.pidsLimit);
  addEntry(entries, "BlkioWeight", config.blkioWeight);
};

/**
 * Parse a memory size string to bytes.
 */
export const parseMemorySize = (size: string): number => {
  const match = size.match(MEMORY_SIZE_REGEX);
  if (!match) {
    throw new Error(`Invalid memory size: ${size}`);
  }

  const value = Number.parseFloat(match[1] ?? "0");
  const unit = (match[2] ?? "").toLowerCase();

  const multipliers: Record<string, number> = {
    "": 1,
    k: 1024,
    m: 1024 * 1024,
    g: 1024 * 1024 * 1024,
    t: 1024 * 1024 * 1024 * 1024,
  };

  return Math.floor(value * (multipliers[unit] ?? 1));
};

/**
 * Format bytes as a memory size string.
 */
export const formatMemorySize = (bytes: number): string => {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${Math.floor(bytes / (1024 * 1024 * 1024))}g`;
  }
  if (bytes >= 1024 * 1024) {
    return `${Math.floor(bytes / (1024 * 1024))}m`;
  }
  if (bytes >= 1024) {
    return `${Math.floor(bytes / 1024)}k`;
  }
  return `${bytes}`;
};

/**
 * Common resource profiles.
 */
export const ResourceProfiles = {
  /** Minimal resources for lightweight containers */
  MINIMAL: {
    memory: "128m",
    pidsLimit: 100,
  } as ContainerResourcesConfig,

  /** Standard resources for typical services */
  STANDARD: {
    memory: "512m",
    shmSize: "64m",
    pidsLimit: 500,
  } as ContainerResourcesConfig,

  /** Higher resources for database servers */
  DATABASE: {
    memory: "1g",
    shmSize: "256m",
    pidsLimit: 500,
  } as ContainerResourcesConfig,

  /** Resources for ML/compute workloads */
  COMPUTE: {
    memory: "4g",
    shmSize: "1g",
    pidsLimit: 1000,
  } as ContainerResourcesConfig,
} as const;
