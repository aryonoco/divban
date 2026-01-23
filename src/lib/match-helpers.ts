// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Helper functions for exhaustive pattern matching using Effect's Match module.
 */

import { Match, pipe } from "effect";

/**
 * Extract cause from unknown error for error constructors.
 * Replaces: `e instanceof Error ? { cause: e } : {}`
 *
 * @example
 * new SystemError({
 *   code: ErrorCode.FILE_WRITE_FAILED,
 *   message: `Failed to write ${path}`,
 *   ...extractCauseProps(e),
 * })
 */
export const extractCauseProps = (e: unknown): { readonly cause?: Error } =>
  pipe(
    Match.value(e),
    Match.when(Match.instanceOf(Error), (err) => ({ cause: err })),
    Match.orElse(() => ({}))
  );

/**
 * Extract message from unknown error.
 * Replaces: `e instanceof Error ? e.message : String(e)`
 *
 * @example
 * new GeneralError({
 *   code: ErrorCode.INVALID_ARGS,
 *   message: extractMessage(e),
 * })
 */
export const extractMessage = (e: unknown): string =>
  pipe(
    Match.value(e),
    Match.when(Match.instanceOf(Error), (err) => err.message),
    Match.orElse(() => String(e))
  );
