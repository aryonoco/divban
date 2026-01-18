/**
 * Actual Budget service configuration schema.
 */

import { z } from "zod";
import { absolutePathSchema, containerImageSchema } from "../../config/schema";

/**
 * Actual Budget configuration schema.
 * Simple single-container service for personal finance management.
 */
export const actualConfigSchema = z.object({
  /**
   * Path configuration.
   */
  paths: z.object({
    /** Directory for Actual data (database, user files) */
    dataDir: absolutePathSchema,
  }),

  /**
   * Container configuration.
   */
  container: z
    .object({
      /** Container image */
      image: containerImageSchema.default("docker.io/actualbudget/actual-server:latest"),
      /** Auto-update policy */
      autoUpdate: z.enum(["registry", "local"]).optional(),
    })
    .optional(),

  /**
   * Network configuration.
   */
  network: z
    .object({
      /** Host port to bind (default: 5006) */
      port: z.number().int().min(1).max(65535).default(5006),
      /** Host IP to bind (default: 127.0.0.1 for security) */
      host: z.string().ip().default("127.0.0.1"),
    })
    .optional(),

  /**
   * Logging configuration.
   */
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type ActualConfig = z.infer<typeof actualConfigSchema>;

/**
 * Default configuration values.
 */
export const actualDefaults = {
  container: {
    image: "docker.io/actualbudget/actual-server:latest",
  },
  network: {
    port: 5006,
    host: "127.0.0.1",
  },
} as const;
