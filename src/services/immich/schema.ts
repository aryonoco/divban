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
 * Hardware acceleration configuration for video transcoding.
 * Discriminated union with associated configuration per backend.
 */
export type TranscodingConfig =
  | { readonly type: "nvenc"; readonly gpuIndex?: number | undefined }
  | { readonly type: "qsv"; readonly renderDevice?: string | undefined }
  | { readonly type: "vaapi"; readonly renderDevice?: string | undefined }
  | { readonly type: "vaapi-wsl" }
  | { readonly type: "rkmpp" }
  | { readonly type: "disabled" };

export const transcodingConfigSchema: z.ZodType<TranscodingConfig> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("nvenc"), gpuIndex: z.number().int().min(0).optional() }),
  z.object({ type: z.literal("qsv"), renderDevice: z.string().optional() }),
  z.object({ type: z.literal("vaapi"), renderDevice: z.string().optional() }),
  z.object({ type: z.literal("vaapi-wsl") }),
  z.object({ type: z.literal("rkmpp") }),
  z.object({ type: z.literal("disabled") }),
]) as z.ZodType<TranscodingConfig>;

/**
 * Hardware acceleration configuration for machine learning.
 * Discriminated union with associated configuration per backend.
 */
export type MlConfig =
  | { readonly type: "cuda"; readonly gpuIndex?: number | undefined }
  | { readonly type: "openvino"; readonly device?: "CPU" | "GPU" | "AUTO" | undefined }
  | { readonly type: "armnn" }
  | { readonly type: "rknn" }
  | { readonly type: "rocm"; readonly gfxVersion?: string | undefined }
  | { readonly type: "disabled" };

export const mlConfigSchema: z.ZodType<MlConfig> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("cuda"), gpuIndex: z.number().int().min(0).optional() }),
  z.object({ type: z.literal("openvino"), device: z.enum(["CPU", "GPU", "AUTO"]).optional() }),
  z.object({ type: z.literal("armnn") }),
  z.object({ type: z.literal("rknn") }),
  z.object({ type: z.literal("rocm"), gfxVersion: z.string().optional() }),
  z.object({ type: z.literal("disabled") }),
]) as z.ZodType<MlConfig>;

/**
 * Hardware acceleration configuration.
 */
export interface HardwareConfig {
  transcoding: TranscodingConfig;
  ml: MlConfig;
}

export const hardwareSchema: z.ZodType<HardwareConfig> = z.object({
  transcoding: transcodingConfigSchema.default({ type: "disabled" }),
  ml: mlConfigSchema.default({ type: "disabled" }),
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
 * Network configuration.
 */
export interface ImmichNetworkConfig {
  /** Host port to bind (default: 2283) */
  port: number;
  /** Host IP to bind (default: 127.0.0.1 for security) */
  host: string;
}

export const immichNetworkSchema: z.ZodType<ImmichNetworkConfig> = z.object({
  port: z.number().int().min(1).max(65535).default(2283),
  host: z.string().ip().default("127.0.0.1"),
}) as z.ZodType<ImmichNetworkConfig>;

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
  network?: ImmichNetworkConfig | undefined;
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
  network: immichNetworkSchema.optional(),
  publicUrl: z.string().url().optional(),
  logLevel: z.enum(["verbose", "debug", "log", "warn", "error"]).default("log"),
}) as z.ZodType<ImmichConfig>;
