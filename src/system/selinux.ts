// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * SELinux detection module.
 * Provides runtime detection of SELinux status for conditional volume relabeling.
 */

import type { DivbanError } from "../lib/errors";
import { Ok, type Result } from "../lib/result";
import { commandExists, exec } from "./exec";

/**
 * SELinux enforcement mode.
 */
export type SELinuxMode = "enforcing" | "permissive" | "disabled";

/**
 * Get the current SELinux enforcement mode.
 * Returns "disabled" if SELinux/getenforce is not available (non-SELinux systems).
 */
export const getSELinuxMode = async (): Promise<Result<SELinuxMode, DivbanError>> => {
  // Check if getenforce command exists (SELinux not installed on Debian/Ubuntu)
  if (!commandExists("getenforce")) {
    return Ok("disabled");
  }

  const result = await exec(["getenforce"], { captureStdout: true });

  if (!result.ok) {
    // If command fails, assume SELinux is disabled
    return Ok("disabled");
  }

  const output = result.value.stdout.trim().toLowerCase();

  switch (output) {
    case "enforcing":
      return Ok("enforcing");
    case "permissive":
      return Ok("permissive");
    case "disabled":
      return Ok("disabled");
    default:
      // Unknown output, default to disabled
      return Ok("disabled");
  }
};

/**
 * Check if SELinux is in enforcing mode.
 * This is the main function used to determine if :Z should be added to volumes.
 */
export const isSELinuxEnforcing = async (): Promise<boolean> => {
  const result = await getSELinuxMode();
  return result.ok && result.value === "enforcing";
};
