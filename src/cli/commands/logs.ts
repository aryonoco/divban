// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Logs command - view service logs.
 */

import type { DivbanError } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import { type Result, asyncFlatMapResult } from "../../lib/result";
import type { AnyService } from "../../services/types";
import type { ParsedArgs } from "../parser";
import { buildServiceContext } from "./utils";

export interface LogsCommandOptions {
  service: AnyService;
  args: ParsedArgs;
  logger: Logger;
}

/**
 * Execute the logs command.
 * Uses buildServiceContext for FP-friendly context resolution.
 */
export const executeLogs = async (
  options: LogsCommandOptions
): Promise<Result<void, DivbanError>> =>
  asyncFlatMapResult(await buildServiceContext(options), ({ ctx }) =>
    options.service.logs(ctx, {
      follow: options.args.follow,
      lines: options.args.lines,
      ...(options.args.container && { container: options.args.container }),
    })
  );
