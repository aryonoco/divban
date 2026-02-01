// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type * as Brand from "effect/Brand";

// Branded types
export type VMName = string & Brand.Brand<"VMName">;
export type DistroName = string & Brand.Brand<"DistroName">;
export type ServiceName = string & Brand.Brand<"ServiceName">;
export type CommandName = string & Brand.Brand<"CommandName">;
export type TestID = string & Brand.Brand<"TestID">;
export type ImageURL = string & Brand.Brand<"ImageURL">;
export type IPAddress = string & Brand.Brand<"IPAddress">;

// Constructor functions
export const vmName = <const S extends string>(literal: S): VMName => literal as string as VMName;
export const distroName = <const S extends string>(literal: S): DistroName =>
  literal as string as DistroName;
export const serviceName = <const S extends string>(literal: S): ServiceName =>
  literal as string as ServiceName;
export const commandName = <const S extends string>(literal: S): CommandName =>
  literal as string as CommandName;
export const testID = <const S extends string>(literal: S): TestID => literal as string as TestID;
export const imageURL = <const S extends string>(literal: S): ImageURL =>
  literal as string as ImageURL;
export const ipAddress = <const S extends string>(literal: S): IPAddress =>
  literal as string as IPAddress;

// Service capabilities
export interface ServiceCapabilities {
  readonly hasReload: boolean;
  readonly hasBackup: boolean;
  readonly hasRestore: boolean;
  readonly multiContainer: boolean;
}

// Package manager types
export type PackageManager = "dnf" | "apt" | "zypper" | "pacman";

// Distribution configuration
export interface DistroConfig {
  readonly name: DistroName;
  readonly imageURL: ImageURL;
  readonly packageManager: PackageManager;
  readonly packages: readonly string[];
  readonly initCommands: readonly string[];
}

// VM configuration
export interface VMConfig {
  readonly name: VMName;
  readonly distro: DistroConfig;
  readonly memory: number; // MB
  readonly cpus: number;
  readonly disk: number; // GB
}

// VM runtime info
export interface VMInfo {
  readonly config: VMConfig;
  readonly ipAddress: IPAddress;
  readonly sshKeyPath: string;
}

// Test case
export interface TestCase {
  readonly id: TestID;
  readonly service: ServiceName;
  readonly distro: DistroName;
  readonly command: CommandName;
  readonly args: readonly string[];
}

// Test result
export interface TestResult {
  readonly testCase: TestCase;
  readonly success: boolean;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly duration: number; // milliseconds
  readonly error?: string;
}

// E2E test report
export interface E2ETestReport {
  readonly startTime: string;
  readonly endTime: string;
  readonly totalTests: number;
  readonly passed: number;
  readonly failed: number;
  readonly results: readonly TestResult[];
}

// E2E errors
export class E2EError extends Error {
  readonly _tag = "E2EError";
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
  }
}
