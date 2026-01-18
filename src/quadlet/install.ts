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
export const InstallTargets = {
  /** Default user target (most common) */
  DEFAULT: "default.target",
  /** Multi-user system target */
  MULTI_USER: "multi-user.target",
  /** Graphical target */
  GRAPHICAL: "graphical.target",
} as const;
