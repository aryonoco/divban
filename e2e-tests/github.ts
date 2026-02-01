// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Effect, pipe } from "effect";
import { exec } from "../src/system/exec.ts";
import { E2EError } from "./types.ts";

const GITHUB_REPO = "aryonoco/divban";
const BINARY_CACHE_PATH = "/var/tmp/divban-e2e-binary" as const;

// Get latest release tag from GitHub API
const getLatestReleaseTag = (): Effect.Effect<string, E2EError> =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Fetching latest divban release from GitHub...");

    const result = yield* exec([
      "curl",
      "-sL",
      "-H",
      "Accept: application/vnd.github+json",
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
    ]);

    // Parse JSON response
    const release = JSON.parse(result.stdout);
    const tag = release.tag_name;

    return yield* pipe(
      tag,
      Effect.fromNullable,
      Effect.mapError(() => new E2EError("Failed to get latest release tag")),
      Effect.tap((t) => Effect.logInfo(`Latest release: ${t}`))
    );
  });

// Download divban binary from GitHub release
export const downloadDivbanBinary = (): Effect.Effect<string, E2EError> =>
  Effect.gen(function* () {
    const tag = yield* getLatestReleaseTag();

    // Construct download URL for Linux binary
    const downloadURL = `https://github.com/${GITHUB_REPO}/releases/download/${tag}/divban-linux-x86_64`;

    yield* Effect.logInfo(`Downloading divban binary from ${downloadURL}...`);

    // Download binary
    yield* exec(["curl", "-sL", "-o", BINARY_CACHE_PATH, downloadURL]);

    // Make executable
    yield* exec(["chmod", "+x", BINARY_CACHE_PATH]);

    yield* Effect.logInfo(`divban binary downloaded to ${BINARY_CACHE_PATH}`);

    return BINARY_CACHE_PATH;
  });
