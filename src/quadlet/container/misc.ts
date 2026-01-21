// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Miscellaneous container configuration for quadlet files.
 */

import type { Entries } from "../entry";
import { concat, fromArray, fromRecord, fromValue } from "../entry-combinators";

export interface ContainerMiscConfig {
  /** Run an init process */
  readonly init?: boolean | undefined;
  /** Log driver */
  readonly logDriver?: string | undefined;
  /** Custom entrypoint */
  readonly entrypoint?: string | undefined;
  /** Command to execute */
  readonly exec?: string | undefined;
  /** Working directory inside container */
  readonly workdir?: string | undefined;
  /** Stop signal */
  readonly stopSignal?: string | undefined;
  /** Stop timeout in seconds */
  readonly stopTimeout?: number | undefined;
  /** Container labels */
  readonly labels?: Readonly<Record<string, string>> | undefined;
  /** Annotations */
  readonly annotations?: Readonly<Record<string, string>> | undefined;
  /** Devices to add */
  readonly devices?: readonly string[] | undefined;
  /** Pull policy */
  readonly pull?: "always" | "missing" | "never" | "newer" | undefined;
  /** Container name (if different from unit name) */
  readonly containerName?: string | undefined;
  /** Pod name to join */
  readonly pod?: string | undefined;
  /** Sysctl settings for the container */
  readonly sysctl?: Readonly<Record<string, string | number>> | undefined;
}

/**
 * Pure function: Config → Entries
 * No side effects, explicit return type.
 * Eliminates 3 for-loops with fromRecord.
 */
export const getMiscEntries = (config: ContainerMiscConfig): Entries =>
  concat(
    fromValue("Init", config.init),
    fromValue("LogDriver", config.logDriver),
    fromValue("Entrypoint", config.entrypoint),
    fromValue("Exec", config.exec),
    fromValue("WorkingDir", config.workdir),
    fromValue("StopSignal", config.stopSignal),
    fromValue("StopTimeout", config.stopTimeout),
    fromValue("Pull", config.pull),
    fromValue("ContainerName", config.containerName),
    fromValue("Pod", config.pod),
    fromArray("AddDevice", config.devices),
    fromRecord("Label", config.labels),
    fromRecord("Annotation", config.annotations),
    fromRecord("Sysctl", config.sysctl)
  );

/**
 * Common log drivers.
 */
export const LogDrivers: Record<string, string> = {
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
} as const satisfies Record<string, string>;

/**
 * Common stop signals.
 */
export const StopSignals: Record<string, string> = {
  TERM: "SIGTERM",
  INT: "SIGINT",
  QUIT: "SIGQUIT",
  KILL: "SIGKILL",
  HUP: "SIGHUP",
  USR1: "SIGUSR1",
  USR2: "SIGUSR2",
} as const satisfies Record<string, string>;

/**
 * Pull policies.
 */
export const PullPolicies: Record<string, string> = {
  /** Always pull the image */
  ALWAYS: "always",
  /** Pull only if not present locally */
  MISSING: "missing",
  /** Never pull (use local only) */
  NEVER: "never",
  /** Pull if remote is newer */
  NEWER: "newer",
} as const satisfies Record<string, string>;

/**
 * Common device mappings.
 */
export const CommonDevices: Record<string, string> = {
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
} as const satisfies Record<string, string>;
