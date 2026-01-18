/**
 * Miscellaneous container configuration for quadlet files.
 */

import { addEntries, addEntry } from "../format";

export interface ContainerMiscConfig {
  /** Run an init process */
  init?: boolean | undefined;
  /** Log driver */
  logDriver?: string | undefined;
  /** Custom entrypoint */
  entrypoint?: string | undefined;
  /** Command to execute */
  exec?: string | undefined;
  /** Working directory inside container */
  workdir?: string | undefined;
  /** Stop signal */
  stopSignal?: string | undefined;
  /** Stop timeout in seconds */
  stopTimeout?: number | undefined;
  /** Container labels */
  labels?: Record<string, string> | undefined;
  /** Annotations */
  annotations?: Record<string, string> | undefined;
  /** Devices to add */
  devices?: string[] | undefined;
  /** Pull policy */
  pull?: "always" | "missing" | "never" | "newer" | undefined;
  /** Container name (if different from unit name) */
  containerName?: string | undefined;
  /** Pod name to join */
  pod?: string | undefined;
}

/**
 * Add miscellaneous entries to a section.
 */
export const addMiscEntries = (
  entries: Array<{ key: string; value: string }>,
  config: ContainerMiscConfig
): void => {
  addEntry(entries, "Init", config.init);
  addEntry(entries, "LogDriver", config.logDriver);
  addEntry(entries, "Entrypoint", config.entrypoint);
  addEntry(entries, "Exec", config.exec);
  addEntry(entries, "WorkingDir", config.workdir);
  addEntry(entries, "StopSignal", config.stopSignal);
  addEntry(entries, "StopTimeout", config.stopTimeout);
  addEntry(entries, "Pull", config.pull);
  addEntry(entries, "ContainerName", config.containerName);
  addEntry(entries, "Pod", config.pod);

  // Devices
  addEntries(entries, "AddDevice", config.devices);

  // Labels
  if (config.labels) {
    for (const [key, value] of Object.entries(config.labels)) {
      entries.push({ key: "Label", value: `${key}=${value}` });
    }
  }

  // Annotations
  if (config.annotations) {
    for (const [key, value] of Object.entries(config.annotations)) {
      entries.push({ key: "Annotation", value: `${key}=${value}` });
    }
  }
};

/**
 * Common log drivers.
 */
export const LogDrivers = {
  /** Journald (default for systemd) */
  JOURNALD: "journald",
  /** JSON file logging */
  JSON_FILE: "json-file",
  /** No logging */
  NONE: "none",
  /** Passthrough to conmon */
  PASSTHROUGH: "passthrough",
  /** syslog */
  SYSLOG: "syslog",
} as const;

/**
 * Common stop signals.
 */
export const StopSignals = {
  TERM: "SIGTERM",
  INT: "SIGINT",
  QUIT: "SIGQUIT",
  KILL: "SIGKILL",
  HUP: "SIGHUP",
  USR1: "SIGUSR1",
  USR2: "SIGUSR2",
} as const;

/**
 * Pull policies.
 */
export const PullPolicies = {
  /** Always pull the image */
  ALWAYS: "always",
  /** Pull only if not present locally */
  MISSING: "missing",
  /** Never pull (use local only) */
  NEVER: "never",
  /** Pull if remote is newer */
  NEWER: "newer",
} as const;

/**
 * Common device mappings.
 */
export const CommonDevices = {
  /** GPU devices for NVIDIA */
  NVIDIA_GPU: "/dev/nvidia0",
  NVIDIA_CTL: "/dev/nvidiactl",
  NVIDIA_UVM: "/dev/nvidia-uvm",
  /** DRI devices for Intel/AMD GPU */
  DRI_CARD: "/dev/dri/card0",
  DRI_RENDERNODE: "/dev/dri/renderD128",
  /** Video devices */
  VIDEO: "/dev/video0",
  /** Sound devices */
  SND: "/dev/snd",
  /** Fuse device */
  FUSE: "/dev/fuse",
} as const;
