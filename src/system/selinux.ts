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

export type SELinuxMode = "enforcing" | "permissive" | "disabled";

/** Falls back to "disabled" on systems without SELinux/getenforce. */
export const getSELinuxMode = (): Effect.Effect<SELinuxMode, never> =>
  Effect.gen(function* () {
    // Check if getenforce command exists (SELinux not installed on Debian/Ubuntu)
    return yield* Effect.if(commandExists("getenforce"), {
      onTrue: (): Effect.Effect<SELinuxMode> =>
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
        ),
      onFalse: (): Effect.Effect<SELinuxMode> => Effect.succeed<SELinuxMode>("disabled"),
    });
  });

/** Used by volume mount generation to decide whether :Z relabeling is needed. */
export const isSELinuxEnforcing = (): Effect.Effect<boolean, never> =>
  Effect.map(getSELinuxMode(), (mode) => mode === "enforcing");
