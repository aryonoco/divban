// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * SELinux detection for conditional :Z volume labeling.
 * SELinux blocks container access to host files unless relabeled.
 * On SELinux systems (RHEL/Fedora), volumes need :Z suffix. On
 * non-SELinux systems (Debian/Ubuntu), :Z is a no-op but harmless.
 */

import { Effect, Either, Match, pipe } from "effect";
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
    return yield* pipe(
      Match.value(commandExists("getenforce")),
      Match.when(false, () => Effect.succeed<SELinuxMode>("disabled")),
      Match.when(true, () =>
        pipe(
          Effect.either(exec(["getenforce"], { captureStdout: true })),
          Effect.map((result) =>
            Either.match(result, {
              onLeft: (): SELinuxMode => "disabled",
              onRight: (r): SELinuxMode =>
                pipe(
                  Match.value(r.stdout.trim().toLowerCase()),
                  Match.when("enforcing", (): SELinuxMode => "enforcing"),
                  Match.when("permissive", (): SELinuxMode => "permissive"),
                  Match.orElse((): SELinuxMode => "disabled")
                ),
            })
          )
        )
      ),
      Match.exhaustive
    );
  });

/**
 * Check if SELinux is in enforcing mode.
 * This is the main function used to determine if :Z should be added to volumes.
 */
export const isSELinuxEnforcing = (): Effect.Effect<boolean, never> =>
  Effect.map(getSELinuxMode(), (mode) => mode === "enforcing");
