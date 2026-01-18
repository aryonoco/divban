/**
 * Configuration file loading and parsing.
 * Supports TOML format with Zod validation.
 * Uses Bun's native TOML parser for optimal performance.
 */

import type { ZodType } from "zod";
import { DivbanError, ErrorCode, wrapError } from "../lib/errors";
import { Err, Ok, type Result, tryCatch } from "../lib/result";
import type { AbsolutePath } from "../lib/types";
import { type GlobalConfig, globalConfigSchema } from "./schema";

/**
 * Load and parse a TOML file.
 */
export const loadTomlFile = async <T>(
  filePath: AbsolutePath,
  schema: ZodType<T>
): Promise<Result<T, DivbanError>> => {
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

  // Validate with Zod schema
  const parseResult = schema.safeParse(parsed);

  if (!parseResult.success) {
    const issues = parseResult.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    return Err(
      new DivbanError(
        ErrorCode.CONFIG_VALIDATION_ERROR,
        `Configuration validation failed for ${filePath}:\n${issues}`
      )
    );
  }

  return Ok(parseResult.data);
};

/**
 * Load global configuration from divban.toml.
 * Returns default values if file doesn't exist.
 */
export const loadGlobalConfig = async (
  configPath?: AbsolutePath
): Promise<Result<GlobalConfig, DivbanError>> => {
  // Try default paths if not specified
  const paths: AbsolutePath[] = configPath
    ? [configPath]
    : ([
        "/etc/divban/divban.toml",
        `${Bun.env["HOME"] ?? "/root"}/.config/divban/divban.toml`,
        "./divban.toml",
      ] as AbsolutePath[]);

  for (const path of paths) {
    const file = Bun.file(path);
    if (await file.exists()) {
      // Use explicit type assertion due to Zod's input/output type inference
      // with exactOptionalPropertyTypes. The schema has .default() on all
      // nested objects, so the output type always has defined properties.
      const result = await loadTomlFile(path, globalConfigSchema);
      return result as Result<GlobalConfig, DivbanError>;
    }
  }

  // Return defaults if no config file found
  return Ok(globalConfigSchema.parse({}) as GlobalConfig);
};

/**
 * Load service-specific configuration.
 */
export const loadServiceConfig = <T>(
  filePath: AbsolutePath,
  schema: ZodType<T>
): Promise<Result<T, DivbanError>> => {
  return loadTomlFile(filePath, schema);
};

/**
 * Find service config file using common patterns.
 */
export const findServiceConfig = async (
  serviceName: string,
  searchPaths?: AbsolutePath[]
): Promise<Result<AbsolutePath, DivbanError>> => {
  const defaultPaths: AbsolutePath[] = [
    `./divban-${serviceName}.toml` as AbsolutePath,
    `./${serviceName}/divban-${serviceName}.toml` as AbsolutePath,
    `/etc/divban/divban-${serviceName}.toml` as AbsolutePath,
  ];

  const paths = searchPaths ?? defaultPaths;

  for (const path of paths) {
    const file = Bun.file(path);
    if (await file.exists()) {
      return Ok(path);
    }
  }

  return Err(
    new DivbanError(
      ErrorCode.CONFIG_NOT_FOUND,
      `No configuration found for service '${serviceName}'. Searched: ${paths.join(", ")}`
    )
  );
};
