/**
 * Container environment configuration for quadlet files.
 */

import { addEntries, addEntry, escapeIniValue } from "../format";

export interface ContainerEnvironmentConfig {
  /** Environment files to load */
  environmentFiles?: string[];
  /** Environment variables */
  environment?: Record<string, string>;
  /** Secret files (mounted from host) */
  secretFiles?: Record<string, string>;
}

/**
 * Add environment-related entries to a section.
 */
export const addEnvironmentEntries = (
  entries: Array<{ key: string; value: string }>,
  config: ContainerEnvironmentConfig
): void => {
  // Environment files
  addEntries(entries, "EnvironmentFile", config.environmentFiles);

  // Individual environment variables
  if (config.environment) {
    for (const [key, value] of Object.entries(config.environment)) {
      entries.push({ key: "Environment", value: `${key}=${escapeIniValue(value)}` });
    }
  }

  // Secret files are handled via environment variables with _FILE suffix
  // and volume mounts - this is just documentation
};

/**
 * Format an environment file reference for quadlet.
 * Supports %h for home directory and other systemd specifiers.
 */
export const formatEnvironmentFile = (path: string): string => {
  // If path starts with home directory pattern, use %h
  if (path.startsWith("/home/")) {
    const parts = path.split("/");
    // /home/username/... -> %h/...
    return `%h/${parts.slice(3).join("/")}`;
  }
  return path;
};

/**
 * Create environment variable entries for a secret file pattern.
 * Convention: VAR_FILE points to a file containing the secret.
 */
export const createSecretFileEnv = (
  varName: string,
  filePath: string
): Record<string, string> => ({
  [`${varName}_FILE`]: filePath,
});

/**
 * Common environment variables.
 */
export const CommonEnvVars = {
  /** Timezone */
  TZ: (tz: string): Record<string, string> => ({ TZ: tz }),
  /** User ID */
  PUID: (uid: number): Record<string, string> => ({ PUID: String(uid) }),
  /** Group ID */
  PGID: (gid: number): Record<string, string> => ({ PGID: String(gid) }),
  /** Disable telemetry */
  NO_TELEMETRY: { DO_NOT_TRACK: "1" },
} as const;

/**
 * Merge multiple environment configurations.
 */
export const mergeEnvironments = (
  ...envs: (Record<string, string> | undefined)[]
): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const env of envs) {
    if (env) {
      Object.assign(result, env);
    }
  }
  return result;
};

/**
 * Filter environment variables by prefix.
 */
export const filterEnvByPrefix = (
  env: Record<string, string>,
  prefix: string
): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith(prefix)) {
      result[key] = value;
    }
  }
  return result;
};
