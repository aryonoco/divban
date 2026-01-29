// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

export const LOG_LEVEL_VALUES = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVEL_VALUES)[number];
export const LOG_LEVEL_DEFAULT: LogLevel = "info";

export const LOG_FORMAT_VALUES = ["pretty", "json"] as const;
export type LogFormat = (typeof LOG_FORMAT_VALUES)[number];
export const LOG_FORMAT_DEFAULT: LogFormat = "pretty";

export const NETWORK_MODE_VALUES = ["pasta", "slirp4netns", "host", "none"] as const;
export type NetworkMode = (typeof NETWORK_MODE_VALUES)[number];

export const NETWORK_MODE_GLOBAL_VALUES = ["pasta", "slirp4netns"] as const;
export type NetworkModeGlobal = (typeof NETWORK_MODE_GLOBAL_VALUES)[number];

export const SERVICE_RESTART_VALUES = [
  "no",
  "on-success",
  "on-failure",
  "on-abnormal",
  "on-abort",
  "always",
] as const;
export type ServiceRestartPolicy = (typeof SERVICE_RESTART_VALUES)[number];

export const HEALTH_CHECK_ON_FAILURE_VALUES = ["none", "kill", "restart", "stop"] as const;
export type HealthCheckOnFailure = (typeof HEALTH_CHECK_ON_FAILURE_VALUES)[number];

export const PROTOCOL_VALUES = ["tcp", "udp"] as const;
export type Protocol = (typeof PROTOCOL_VALUES)[number];

export const AUTO_UPDATE_STRING_VALUES = ["registry", "local"] as const;
export type AutoUpdateString = (typeof AUTO_UPDATE_STRING_VALUES)[number];
