// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * [Install] section builder for quadlet files.
 */

import type { IniSection } from "./format";
import { addEntry } from "./format";

export interface InstallConfig {
  /** Target to install to (default: default.target) */
  wantedBy?: string | undefined;
}

/**
 * Build the [Install] section for a quadlet file.
 */
export const buildInstallSection = (config: InstallConfig = {}): IniSection => {
  const entries: Array<{ key: string; value: string }> = [];

  // Default to default.target for user services
  addEntry(entries, "WantedBy", config.wantedBy ?? "default.target");

  return { name: "Install", entries };
};

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
