// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Effect-based logs command - view service logs.
 */

import { Effect } from "effect";
import type { DivbanEffectError } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import type { AnyServiceEffect } from "../../services/types";
import type { ParsedArgs } from "../parser";
import { buildServiceContext } from "./utils";

export interface LogsCommandOptions {
  service: AnyServiceEffect;
  args: ParsedArgs;
  logger: Logger;
}

/**
 * Execute the logs command.
 */
export const executeLogs = (options: LogsCommandOptions): Effect.Effect<void, DivbanEffectError> =>
  Effect.flatMap(
    buildServiceContext({
      service: options.service,
      args: options.args,
      logger: options.logger,
    }),
    ({ ctx }) =>
      options.service.logs(ctx, {
        follow: options.args.follow,
        lines: options.args.lines,
        ...(options.args.container && { container: options.args.container }),
      })
  );
