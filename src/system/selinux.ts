// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * SELinux detection module using Effect for error handling.
 * Provides runtime detection of SELinux status for conditional volume relabeling.
 */

import { Effect } from "effect";
import { commandExists, exec } from "./exec";

/**
 * SELinux enforcement mode.
 */
export type SELinuxMode = "enforcing" | "permissive" | "disabled";

/**
 * Get the current SELinux enforcement mode.
 * Returns "disabled" if SELinux/getenforce is not available (non-SELinux systems).
 */
export const getSELinuxMode = (): Effect.Effect<SELinuxMode, never> =>
  Effect.gen(function* () {
    // Check if getenforce command exists (SELinux not installed on Debian/Ubuntu)
    if (!commandExists("getenforce")) {
      return "disabled" as const;
    }

    const result = yield* Effect.either(exec(["getenforce"], { captureStdout: true }));

    if (result._tag === "Left") {
      // If command fails, assume SELinux is disabled
      return "disabled" as const;
    }

    const output = result.right.stdout.trim().toLowerCase();

    switch (output) {
      case "enforcing":
        return "enforcing" as const;
      case "permissive":
        return "permissive" as const;
      case "disabled":
        return "disabled" as const;
      default:
        // Unknown output, default to disabled
        return "disabled" as const;
    }
  });

/**
 * Check if SELinux is in enforcing mode.
 * This is the main function used to determine if :Z should be added to volumes.
 */
export const isSELinuxEnforcing = (): Effect.Effect<boolean, never> =>
  Effect.map(getSELinuxMode(), (mode) => mode === "enforcing");
