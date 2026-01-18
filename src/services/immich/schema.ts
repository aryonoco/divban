// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Immich service configuration schema.
 */

import { z } from "zod";
import { absolutePathSchema } from "../../config/schema";

/**
 * Hardware acceleration options for transcoding.
 */
export type TranscodingBackend = "nvenc" | "qsv" | "vaapi" | "vaapi-wsl" | "rkmpp" | "disabled";

export const transcodingBackendSchema: z.ZodEnum<
  ["nvenc", "qsv", "vaapi", "vaapi-wsl", "rkmpp", "disabled"]
> = z.enum([
  "nvenc", // NVIDIA NVENC
  "qsv", // Intel Quick Sync Video
  "vaapi", // VA-API (Intel/AMD)
  "vaapi-wsl", // VA-API in WSL
  "rkmpp", // Rockchip MPP
  "disabled", // No hardware acceleration
]);

/**
 * Hardware acceleration options for machine learning.
 */
export type MlBackend = "cuda" | "openvino" | "armnn" | "rknn" | "rocm" | "disabled";

export const mlBackendSchema: z.ZodEnum<["cuda", "openvino", "armnn", "rknn", "rocm", "disabled"]> =
  z.enum([
    "cuda", // NVIDIA CUDA
    "openvino", // Intel OpenVINO
    "armnn", // ARM NN
    "rknn", // Rockchip NPU
    "rocm", // AMD ROCm
    "disabled", // CPU only
  ]);

/**
 * Hardware acceleration configuration.
 */
export interface HardwareConfig {
  transcoding: TranscodingBackend;
  ml: MlBackend;
}

export const hardwareSchema: z.ZodType<HardwareConfig> = z.object({
  transcoding: transcodingBackendSchema.default("disabled"),
  ml: mlBackendSchema.default("disabled"),
}) as z.ZodType<HardwareConfig>;

/**
 * External library configuration.
 */
export interface ExternalLibrary {
  path: string;
  name?: string | undefined;
  readOnly: boolean;
}

export const externalLibrarySchema: z.ZodType<ExternalLibrary> = z.object({
  path: absolutePathSchema,
  name: z.string().optional(),
  readOnly: z.boolean().default(true),
}) as z.ZodType<ExternalLibrary>;

/**
 * Database configuration.
 */
export interface DatabaseConfig {
  password: string;
  database: string;
  username: string;
}

export const databaseSchema: z.ZodType<DatabaseConfig> = z.object({
  password: z.string(),
  database: z.string().default("immich"),
  username: z.string().default("immich"),
}) as z.ZodType<DatabaseConfig>;

/**
 * Container-specific configuration.
 */
export interface ImmichContainersConfig {
  server?: { image: string } | undefined;
  machineLearning?: { image?: string | undefined; enabled: boolean } | undefined;
  redis?: { image: string } | undefined;
  postgres?: { image: string } | undefined;
}

export const immichContainersSchema: z.ZodType<ImmichContainersConfig> = z.object({
  server: z
    .object({
      image: z.string().default("ghcr.io/immich-app/immich-server:release"),
    })
    .optional(),
  machineLearning: z
    .object({
      image: z.string().optional(), // Derived from ML backend
      enabled: z.boolean().default(true),
    })
    .optional(),
  redis: z
    .object({
      image: z.string().default("docker.io/library/redis:7-alpine"),
    })
    .optional(),
  postgres: z
    .object({
      image: z.string().default("docker.io/tensorchord/pgvecto-rs:pg16-v0.2.0"),
    })
    .optional(),
}) as z.ZodType<ImmichContainersConfig>;

/**
 * Full Immich service configuration.
 */
export interface ImmichConfig {
  paths: {
    dataDir: string;
    uploadDir?: string | undefined;
    profileDir?: string | undefined;
    thumbsDir?: string | undefined;
    encodedDir?: string | undefined;
  };
  database: DatabaseConfig;
  hardware?: HardwareConfig | undefined;
  externalLibraries?: ExternalLibrary[] | undefined;
  containers?: ImmichContainersConfig | undefined;
  publicUrl?: string | undefined;
  logLevel: "verbose" | "debug" | "log" | "warn" | "error";
}

export const immichConfigSchema: z.ZodType<ImmichConfig> = z.object({
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
}) as z.ZodType<ImmichConfig>;
