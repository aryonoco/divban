// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Container health check configuration for quadlet files.
 */

import { Option, pipe } from "effect";
import { duration } from "../../lib/types";
import type { Entries } from "../entry";
import { empty } from "../entry";
import { concat, fromValue } from "../entry-combinators";
import type { HealthCheck } from "../types";

export const getHealthCheckEntries = (config: HealthCheck | undefined): Entries =>
  pipe(
    Option.fromNullable(config),
    Option.map((c) =>
      concat(
        fromValue("HealthCmd", c.cmd),
        fromValue("HealthInterval", c.interval),
        fromValue("HealthTimeout", c.timeout),
        fromValue("HealthRetries", c.retries),
        fromValue("HealthStartPeriod", c.startPeriod),
        fromValue("HealthOnFailure", c.onFailure)
      )
    ),
    Option.getOrElse((): Entries => empty)
  );

/**
 * Create a basic health check configuration.
 */
export const createHealthCheck = (
  cmd: string,
  options?: Partial<Omit<HealthCheck, "cmd">>
): HealthCheck => ({
  cmd,
  interval: options?.interval ?? duration("30s"),
  timeout: options?.timeout ?? duration("30s"),
  retries: options?.retries ?? 3,
  startPeriod: options?.startPeriod ?? duration("0s"),
  onFailure: options?.onFailure ?? "none",
});

/**
 * Create a health check that uses curl to check an HTTP endpoint.
 */
export const createHttpHealthCheck = (
  url: string,
  options?: Partial<Omit<HealthCheck, "cmd">>
): HealthCheck =>
  createHealthCheck(`curl -sf ${url} || exit 1`, {
    ...options,
    startPeriod: options?.startPeriod ?? duration("10s"),
  });

/**
 * Create a health check that uses wget to check an HTTP endpoint.
 */
export const createWgetHealthCheck = (
  url: string,
  options?: Partial<Omit<HealthCheck, "cmd">>
): HealthCheck =>
  createHealthCheck(`wget -qO- ${url} || exit 1`, {
    ...options,
    startPeriod: options?.startPeriod ?? duration("10s"),
  });

/**
 * Create a health check for PostgreSQL.
 */
export const createPostgresHealthCheck = (
  user = "postgres",
  db = "postgres",
  options?: Partial<Omit<HealthCheck, "cmd">>
): HealthCheck =>
  createHealthCheck(`pg_isready -U ${user} -d ${db}`, {
    interval: duration("10s"),
    timeout: duration("5s"),
    startPeriod: duration("30s"),
    ...options,
  });

/**
 * Create a health check for Redis.
 */
export const createRedisHealthCheck = (options?: Partial<Omit<HealthCheck, "cmd">>): HealthCheck =>
  createHealthCheck("redis-cli ping | grep -q PONG", {
    interval: duration("10s"),
    timeout: duration("5s"),
    startPeriod: duration("5s"),
    ...options,
  });

/**
 * Create a health check that always passes (for debugging).
 */
export const createNoopHealthCheck = (): HealthCheck =>
  createHealthCheck("true", {
    interval: duration("60s"),
    timeout: duration("5s"),
  });

/**
 * Health check on failure actions.
 */
export const HealthOnFailure: Record<string, string> = {
  /** Do nothing */
  NONE: "none",
  /** Kill the container */
  KILL: "kill",
  /** Restart the container */
  RESTART: "restart",
  /** Stop the container */
  STOP: "stop",
} as const satisfies Record<string, string>;
