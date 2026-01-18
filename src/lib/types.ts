// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Branded/Nominal types for type-safe identifiers.
 * These prevent accidentally mixing incompatible values like UIDs and GIDs.
 */

/** User ID (1000-65534 range for regular users) */
export type UserId = number & { readonly __brand: "UserId" };

/** Group ID (1000-65534 range for regular groups) */
export type GroupId = number & { readonly __brand: "GroupId" };

/** Subordinate ID for user namespaces (100000+ range) */
export type SubordinateId = number & { readonly __brand: "SubordinateId" };

/** Absolute filesystem path (must start with /) */
export type AbsolutePath = string & { readonly __brand: "AbsolutePath" };

/** POSIX username (lowercase, starts with letter or underscore) */
export type Username = string & { readonly __brand: "Username" };

/** Service name identifier */
export type ServiceName = string & { readonly __brand: "ServiceName" };

/** Container name identifier */
export type ContainerName = string & { readonly __brand: "ContainerName" };

/** Network name identifier */
export type NetworkName = string & { readonly __brand: "NetworkName" };

/** Volume name identifier */
export type VolumeName = string & { readonly __brand: "VolumeName" };

/**
 * Regex patterns for validation (top-level for performance)
 */
const USERNAME_REGEX = /^[a-z_][a-z0-9_-]*$/;
const SERVICE_NAME_REGEX = /^[a-z][a-z0-9-]*$/;
const CONTAINER_NETWORK_VOLUME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

/**
 * Type constructors with runtime validation.
 * These provide both type safety and runtime checks.
 */

export const UserId = (n: number): UserId => {
  if (!Number.isInteger(n) || n < 0 || n > 65534) {
    throw new Error(`Invalid UserId: ${n}. Must be integer 0-65534.`);
  }
  return n as UserId;
};

export const GroupId = (n: number): GroupId => {
  if (!Number.isInteger(n) || n < 0 || n > 65534) {
    throw new Error(`Invalid GroupId: ${n}. Must be integer 0-65534.`);
  }
  return n as GroupId;
};

export const SubordinateId = (n: number): SubordinateId => {
  if (!Number.isInteger(n) || n < 100000 || n > 4294967294) {
    throw new Error(`Invalid SubordinateId: ${n}. Must be integer 100000-4294967294.`);
  }
  return n as SubordinateId;
};

export const AbsolutePath = (s: string): AbsolutePath => {
  if (!s.startsWith("/")) {
    throw new Error(`Not an absolute path: ${s}. Must start with /.`);
  }
  return s as AbsolutePath;
};

export const Username = (s: string): Username => {
  if (!USERNAME_REGEX.test(s)) {
    throw new Error(`Invalid username: ${s}. Must match [a-z_][a-z0-9_-]*.`);
  }
  if (s.length > 32) {
    throw new Error(`Username too long: ${s}. Max 32 characters.`);
  }
  return s as Username;
};

export const ServiceName = (s: string): ServiceName => {
  if (!SERVICE_NAME_REGEX.test(s)) {
    throw new Error(`Invalid service name: ${s}. Must match [a-z][a-z0-9-]*.`);
  }
  return s as ServiceName;
};

export const ContainerName = (s: string): ContainerName => {
  if (!CONTAINER_NETWORK_VOLUME_REGEX.test(s)) {
    throw new Error(`Invalid container name: ${s}.`);
  }
  return s as ContainerName;
};

export const NetworkName = (s: string): NetworkName => {
  if (!CONTAINER_NETWORK_VOLUME_REGEX.test(s)) {
    throw new Error(`Invalid network name: ${s}.`);
  }
  return s as NetworkName;
};

export const VolumeName = (s: string): VolumeName => {
  if (!CONTAINER_NETWORK_VOLUME_REGEX.test(s)) {
    throw new Error(`Invalid volume name: ${s}.`);
  }
  return s as VolumeName;
};

/**
 * Type guards for branded types
 */
export const isAbsolutePath = (s: string): s is AbsolutePath => s.startsWith("/");
export const isUsername = (s: string): s is Username => USERNAME_REGEX.test(s) && s.length <= 32;
export const isServiceName = (s: string): s is ServiceName => SERVICE_NAME_REGEX.test(s);

// ============================================================================
// Environment Variable Helpers (using Bun.env)
// ============================================================================

/**
 * Get an environment variable value.
 */
export const getEnv = (key: string): string | undefined => Bun.env[key];

/**
 * Get a required environment variable, throwing if not set.
 */
export const requireEnv = (key: string): string => {
  const value = Bun.env[key];
  if (value === undefined) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
};

/**
 * Get environment variable with a default fallback.
 */
export const getEnvOrDefault = (key: string, defaultValue: string): string => {
  return Bun.env[key] ?? defaultValue;
};
