// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Configuration file loading and parsing.
 * Supports TOML format with Effect Schema validation.
 * Uses Bun's native TOML parser for optimal performance.
 */

import type { Schema } from "effect";
import { DivbanError, ErrorCode, wrapError } from "../lib/errors";
import { toAbsolutePath } from "../lib/paths";
import { Err, Ok, type Result, tryCatch } from "../lib/result";
import { decodeOrThrow, decodeToResult } from "../lib/schema-utils";
import type { AbsolutePath } from "../lib/types";
import { type GlobalConfig, globalConfigSchema } from "./schema";

/**
 * Load and parse a TOML file.
 */
export const loadTomlFile = async <A, I = A>(
  filePath: AbsolutePath,
  schema: Schema.Schema<A, I, never>
): Promise<Result<A, DivbanError>> => {
  // Check if file exists
  const file = Bun.file(filePath);
  const exists = await file.exists();

  if (!exists) {
    return Err(
      new DivbanError(ErrorCode.CONFIG_NOT_FOUND, `Configuration file not found: ${filePath}`)
    );
  }

  // Read file content
  const contentResult = await tryCatch(
    () => file.text(),
    (e) => wrapError(e, ErrorCode.FILE_READ_FAILED, `Failed to read ${filePath}`)
  );

  if (!contentResult.ok) {
    return contentResult;
  }

  // Parse TOML using Bun's native parser
  let parsed: unknown;
  try {
    parsed = Bun.TOML.parse(contentResult.value);
  } catch (e) {
    return Err(wrapError(e, ErrorCode.CONFIG_PARSE_ERROR, `Failed to parse TOML in ${filePath}`));
  }

  // Validate with Effect Schema
  return decodeToResult(schema, parsed, filePath);
};

/**
 * Load global configuration from divban.toml.
 * Returns default values if file doesn't exist.
 */
export const loadGlobalConfig = async (
  configPath?: AbsolutePath
): Promise<Result<GlobalConfig, DivbanError>> => {
  // Try default paths if not specified
  // Search paths are plain strings (may be relative), converted at boundary
  const paths: string[] = configPath
    ? [configPath]
    : [
        "/etc/divban/divban.toml",
        `${Bun.env["HOME"] ?? "/root"}/.config/divban/divban.toml`,
        "./divban.toml",
      ];

  for (const p of paths) {
    const file = Bun.file(p);
    if (await file.exists()) {
      const absoluteResult = toAbsolutePath(p);
      if (!absoluteResult.ok) {
        return absoluteResult;
      }
      // Use explicit type assertion due to Effect Schema's input/output type inference
      // with exactOptionalPropertyTypes. The schema has defaults on all
      // nested objects, so the output type always has defined properties.
      const result = await loadTomlFile(absoluteResult.value, globalConfigSchema);
      return result as Result<GlobalConfig, DivbanError>;
    }
  }

  // Return defaults if no config file found
  return Ok(decodeOrThrow(globalConfigSchema, {}) as GlobalConfig);
};

/**
 * Load service-specific configuration.
 */
export const loadServiceConfig = <A, I = A>(
  filePath: AbsolutePath,
  schema: Schema.Schema<A, I, never>
): Promise<Result<A, DivbanError>> => {
  return loadTomlFile(filePath, schema);
};

/**
 * Find service config file using common patterns.
 * Search paths are plain strings (may be relative).
 * Returns AbsolutePath once found.
 */
export const findServiceConfig = async (
  serviceName: string,
  searchPaths?: string[]
): Promise<Result<AbsolutePath, DivbanError>> => {
  const defaultPaths: string[] = [
    `./divban-${serviceName}.toml`,
    `./${serviceName}/divban-${serviceName}.toml`,
    `/etc/divban/divban-${serviceName}.toml`,
  ];

  const paths = searchPaths ?? defaultPaths;

  for (const p of paths) {
    const file = Bun.file(p);
    if (await file.exists()) {
      return toAbsolutePath(p);
    }
  }

  return Err(
    new DivbanError(
      ErrorCode.CONFIG_NOT_FOUND,
      `No configuration found for service '${serviceName}'. Searched: ${paths.join(", ")}`
    )
  );
};
