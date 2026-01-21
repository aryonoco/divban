// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * [Install] section builder for quadlet files.
 */

import type { Entries } from "./entry";
import { fromValue } from "./entry-combinators";
import { makeSection } from "./factory";
import type { IniSection } from "./format";

export interface InstallConfig {
  /** Target to install to (default: default.target) */
  wantedBy?: string | undefined;
}

export const getInstallSectionEntries = (config: InstallConfig): Entries =>
  fromValue("WantedBy", config.wantedBy ?? "default.target");

/**
 * Build the [Install] section for a quadlet file.
 */
export const buildInstallSection = (config: InstallConfig = {}): IniSection =>
  makeSection("Install", getInstallSectionEntries)(config);

/**
 * Common install targets.
 */
export const InstallTargets: Record<string, string> = {
  /** Default user target (most common) */
  DEFAULT: "default.target",
  /** Multi-user system target */
  MULTI_USER: "multi-user.target",
  /** Graphical target */
  GRAPHICAL: "graphical.target",
} as const satisfies Record<string, string>;
