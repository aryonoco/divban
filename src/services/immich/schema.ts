/**
 * Immich service configuration schema.
 */

import { z } from "zod";
import { absolutePathSchema, containerBaseSchema } from "../../config/schema";

/**
 * Hardware acceleration options for transcoding.
 */
export const transcodingBackendSchema = z.enum([
  "nvenc",    // NVIDIA NVENC
  "qsv",      // Intel Quick Sync Video
  "vaapi",    // VA-API (Intel/AMD)
  "vaapi-wsl", // VA-API in WSL
  "rkmpp",    // Rockchip MPP
  "disabled", // No hardware acceleration
]);

/**
 * Hardware acceleration options for machine learning.
 */
export const mlBackendSchema = z.enum([
  "cuda",      // NVIDIA CUDA
  "openvino",  // Intel OpenVINO
  "armnn",     // ARM NN
  "rknn",      // Rockchip NPU
  "rocm",      // AMD ROCm
  "disabled",  // CPU only
]);

/**
 * Hardware acceleration configuration.
 */
export const hardwareSchema = z.object({
  transcoding: transcodingBackendSchema.default("disabled"),
  ml: mlBackendSchema.default("disabled"),
});

/**
 * External library configuration.
 */
export const externalLibrarySchema = z.object({
  path: absolutePathSchema,
  name: z.string().optional(),
  readOnly: z.boolean().default(true),
});

/**
 * Database configuration.
 */
export const databaseSchema = z.object({
  password: z.string(),
  database: z.string().default("immich"),
  username: z.string().default("immich"),
});

/**
 * Container-specific configuration.
 */
export const immichContainersSchema = z.object({
  server: z.object({
    image: z.string().default("ghcr.io/immich-app/immich-server:release"),
  }).optional(),
  machineLearning: z.object({
    image: z.string().optional(), // Derived from ML backend
    enabled: z.boolean().default(true),
  }).optional(),
  redis: z.object({
    image: z.string().default("docker.io/library/redis:7-alpine"),
  }).optional(),
  postgres: z.object({
    image: z.string().default("docker.io/tensorchord/pgvecto-rs:pg16-v0.2.0"),
  }).optional(),
});

/**
 * Full Immich service configuration schema.
 */
export const immichConfigSchema = z.object({
  paths: z.object({
    dataDir: absolutePathSchema,
    uploadDir: absolutePathSchema.optional(),
    profileDir: absolutePathSchema.optional(),
    thumbsDir: absolutePathSchema.optional(),
    encodedDir: absolutePathSchema.optional(),
  }),
  database: databaseSchema,
  hardware: hardwareSchema.optional(),
  externalLibraries: z.array(externalLibrarySchema).optional(),
  containers: immichContainersSchema.optional(),
  publicUrl: z.string().url().optional(),
  logLevel: z.enum(["verbose", "debug", "log", "warn", "error"]).default("log"),
});

export type ImmichConfig = z.infer<typeof immichConfigSchema>;
export type TranscodingBackend = z.infer<typeof transcodingBackendSchema>;
export type MlBackend = z.infer<typeof mlBackendSchema>;
export type ExternalLibrary = z.infer<typeof externalLibrarySchema>;
