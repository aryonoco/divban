// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Branded types prevent accidental mixing of same-underlying-type values.
 * `UserId` and `GroupId` are both numbers, but the compiler rejects using
 * one where the other is expected — catching silent data corruption at
 * compile time rather than runtime.
 */

import { type Brand, Effect, Option, ParseResult, Schema, type SchemaAST, pipe } from "effect";

import { ErrorCode, GeneralError } from "./errors";
import {
  isValidContainerImage,
  isValidContainerName,
  isValidDurationString,
  isValidPosixUsername,
  isValidServiceName,
  parseIPv4,
  parseIPv6Groups,
} from "./schema-utils";
import { collapseChar } from "./str";

export type UserId = number & Brand.Brand<"UserId">;
export type GroupId = number & Brand.Brand<"GroupId">;
export type SubordinateId = number & Brand.Brand<"SubordinateId">;
export type AbsolutePath = string & Brand.Brand<"AbsolutePath">;
export type Username = string & Brand.Brand<"Username">;
export type ServiceName = string & Brand.Brand<"ServiceName">;
export type ContainerName = string & Brand.Brand<"ContainerName">;
export type NetworkName = string & Brand.Brand<"NetworkName">;
export type VolumeName = string & Brand.Brand<"VolumeName">;
export type PrivateIP = string & Brand.Brand<"PrivateIP">;
export type ContainerImage = string & Brand.Brand<"ContainerImage">;

const userIdIntMsg = (): string => "UserId must be an integer";
const userIdRangeMsg = (): string => "UserId must be 0-65534";
const groupIdIntMsg = (): string => "GroupId must be an integer";
const groupIdRangeMsg = (): string => "GroupId must be 0-65534";
const subIdIntMsg = (): string => "SubordinateId must be an integer";
const subIdRangeMsg = (): string => "SubordinateId must be 100000-4294967294";
const absolutePathMsg = (): string => "Path must be absolute (start with /)";
const usernamePatternMsg = (): string => "Username must match [a-z_][a-z0-9_-]*";
const usernameMaxLenMsg = (): string => "Username max 32 characters";
const serviceNamePatternMsg = (): string => "Service name must match [a-z][a-z0-9-]*";
const containerNameMsg = (): string => "Invalid container name";
const networkNameMsg = (): string => "Invalid network name";
const volumeNameMsg = (): string => "Invalid volume name";
const privateIPEmptyMsg = (): string => "IP address cannot be empty";
const privateIPInvalidMsg = (): string => "Must be RFC 1918 IPv4 or RFC 4193 IPv6";
const containerImageMsg = (): string => "Invalid container image format";

export const UserIdSchema: Schema.BrandSchema<UserId, number, never> = Schema.Number.pipe(
  Schema.int({ message: userIdIntMsg }),
  Schema.between(0, 65534, { message: userIdRangeMsg }),
  Schema.brand("UserId")
);

export const GroupIdSchema: Schema.BrandSchema<GroupId, number, never> = Schema.Number.pipe(
  Schema.int({ message: groupIdIntMsg }),
  Schema.between(0, 65534, { message: groupIdRangeMsg }),
  Schema.brand("GroupId")
);

export const SubordinateIdSchema: Schema.BrandSchema<SubordinateId, number, never> =
  Schema.Number.pipe(
    Schema.int({ message: subIdIntMsg }),
    Schema.between(100000, 4294967294, { message: subIdRangeMsg }),
    Schema.brand("SubordinateId")
  );

export const AbsolutePathSchema: Schema.BrandSchema<AbsolutePath, string, never> =
  Schema.String.pipe(
    Schema.filter((s): boolean => s.startsWith("/"), { message: absolutePathMsg }),
    Schema.brand("AbsolutePath")
  );

export const UsernameSchema: Schema.BrandSchema<Username, string, never> = Schema.String.pipe(
  Schema.filter(isValidPosixUsername, { message: usernamePatternMsg }),
  Schema.maxLength(32, { message: usernameMaxLenMsg }),
  Schema.brand("Username")
);

export const ServiceNameSchema: Schema.BrandSchema<ServiceName, string, never> = Schema.String.pipe(
  Schema.filter(isValidServiceName, { message: serviceNamePatternMsg }),
  Schema.brand("ServiceName")
);

export const ContainerNameSchema: Schema.BrandSchema<ContainerName, string, never> =
  Schema.String.pipe(
    Schema.filter(isValidContainerName, { message: containerNameMsg }),
    Schema.brand("ContainerName")
  );

export const NetworkNameSchema: Schema.BrandSchema<NetworkName, string, never> = Schema.String.pipe(
  Schema.filter(isValidContainerName, { message: networkNameMsg }),
  Schema.brand("NetworkName")
);

export const VolumeNameSchema: Schema.BrandSchema<VolumeName, string, never> = Schema.String.pipe(
  Schema.filter(isValidContainerName, { message: volumeNameMsg }),
  Schema.brand("VolumeName")
);

export const ContainerImageSchema: Schema.BrandSchema<ContainerImage, string, never> =
  Schema.String.pipe(
    Schema.filter(isValidContainerImage, { message: containerImageMsg }),
    Schema.brand("ContainerImage")
  );

export type DurationString = string & Brand.Brand<"DurationString">;

const durationMsg = (): string => "Duration must be number followed by unit (ms, s, m, h, d)";

export const DurationStringSchema: Schema.BrandSchema<DurationString, string, never> =
  Schema.String.pipe(
    Schema.filter(isValidDurationString, { message: durationMsg }),
    Schema.brand("DurationString")
  );

export const isDurationString: (u: unknown) => u is DurationString =
  Schema.is(DurationStringSchema);

export const decodeDurationString: (
  i: string,
  options?: SchemaAST.ParseOptions
) => Effect.Effect<DurationString, ParseResult.ParseError, never> =
  Schema.decode(DurationStringSchema);

/** Template literal type restricts to valid duration patterns at compile time. */
export const duration = <const S extends `${number}${"ms" | "s" | "m" | "h" | "d"}`>(
  literal: S
): DurationString => literal as string as DurationString;

const isRfc1918IPv4 = (s: string): boolean =>
  Option.match(parseIPv4(s), {
    onNone: (): boolean => false,
    onSome: ([a, b]): boolean =>
      a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168),
  });

const isRfc4193IPv6 = (s: string): boolean =>
  Option.match(parseIPv6Groups(s), {
    onNone: (): boolean => false,
    onSome: (): boolean =>
      Option.match(Option.fromNullable(s.split(":")[0]), {
        onNone: (): boolean => false,
        onSome: (firstGroup): boolean => {
          const firstWord = Number.parseInt(firstGroup.toLowerCase(), 16);
          return !Number.isNaN(firstWord) && firstWord >= 0xfc00 && firstWord <= 0xfdff;
        },
      }),
  });

const isPrivateIPString = (s: string): boolean => isRfc1918IPv4(s) || isRfc4193IPv6(s);
const trimString = (s: string): string => s.trim();
const identityString = (s: string): string => s;

export const PrivateIPSchema: Schema.Schema<PrivateIP, string> = Schema.String.pipe(
  Schema.nonEmptyString({ message: privateIPEmptyMsg }),
  Schema.transform(Schema.String, {
    strict: true,
    decode: trimString,
    encode: identityString,
  }),
  Schema.filter(isPrivateIPString, { message: privateIPInvalidMsg }),
  Schema.brand("PrivateIP")
);

export const isUserId: (u: unknown) => u is UserId = Schema.is(UserIdSchema);
export const isGroupId: (u: unknown) => u is GroupId = Schema.is(GroupIdSchema);
export const isSubordinateId: (u: unknown) => u is SubordinateId = Schema.is(SubordinateIdSchema);
export const isAbsolutePath: (u: unknown) => u is AbsolutePath = Schema.is(AbsolutePathSchema);
export const isUsername: (u: unknown) => u is Username = Schema.is(UsernameSchema);
export const isServiceName: (u: unknown) => u is ServiceName = Schema.is(ServiceNameSchema);
export const isContainerName: (u: unknown) => u is ContainerName = Schema.is(ContainerNameSchema);
export const isNetworkName: (u: unknown) => u is NetworkName = Schema.is(NetworkNameSchema);
export const isVolumeName: (u: unknown) => u is VolumeName = Schema.is(VolumeNameSchema);
export const isPrivateIP: (u: unknown) => u is PrivateIP = Schema.is(PrivateIPSchema);
export const isContainerImage: (u: unknown) => u is ContainerImage =
  Schema.is(ContainerImageSchema);

// Usage: yield* decodeUserId(untrustedInput).pipe(Effect.mapError(parseErrorToGeneralError))
export const decodeUserId: (
  i: number,
  options?: SchemaAST.ParseOptions
) => Effect.Effect<UserId, ParseResult.ParseError, never> = Schema.decode(UserIdSchema);

export const decodeGroupId: (
  i: number,
  options?: SchemaAST.ParseOptions
) => Effect.Effect<GroupId, ParseResult.ParseError, never> = Schema.decode(GroupIdSchema);

export const decodeSubordinateId: (
  i: number,
  options?: SchemaAST.ParseOptions
) => Effect.Effect<SubordinateId, ParseResult.ParseError, never> =
  Schema.decode(SubordinateIdSchema);

export const decodeAbsolutePath: (
  i: string,
  options?: SchemaAST.ParseOptions
) => Effect.Effect<AbsolutePath, ParseResult.ParseError, never> = Schema.decode(AbsolutePathSchema);

export const decodeUsername: (
  i: string,
  options?: SchemaAST.ParseOptions
) => Effect.Effect<Username, ParseResult.ParseError, never> = Schema.decode(UsernameSchema);

export const decodeServiceName: (
  i: string,
  options?: SchemaAST.ParseOptions
) => Effect.Effect<ServiceName, ParseResult.ParseError, never> = Schema.decode(ServiceNameSchema);

export const decodeContainerName: (
  i: string,
  options?: SchemaAST.ParseOptions
) => Effect.Effect<ContainerName, ParseResult.ParseError, never> =
  Schema.decode(ContainerNameSchema);

export const decodeNetworkName: (
  i: string,
  options?: SchemaAST.ParseOptions
) => Effect.Effect<NetworkName, ParseResult.ParseError, never> = Schema.decode(NetworkNameSchema);

export const decodeVolumeName: (
  i: string,
  options?: SchemaAST.ParseOptions
) => Effect.Effect<VolumeName, ParseResult.ParseError, never> = Schema.decode(VolumeNameSchema);

export const decodePrivateIP: (
  i: string,
  options?: SchemaAST.ParseOptions
) => Effect.Effect<PrivateIP, ParseResult.ParseError, never> = Schema.decode(PrivateIPSchema);

export const decodeContainerImage: (
  i: string,
  options?: SchemaAST.ParseOptions
) => Effect.Effect<ContainerImage, ParseResult.ParseError, never> =
  Schema.decode(ContainerImageSchema);

/** Bridge Schema `ParseError` into the application error hierarchy. */
export const parseErrorToGeneralError = (error: ParseResult.ParseError): GeneralError => {
  const formatted = ParseResult.TreeFormatter.formatErrorSync(error);
  return new GeneralError({
    code: ErrorCode.INVALID_ARGS as 2,
    message: formatted,
  });
};

/** POSIX convention: primary GID matches UID for service users. */
export const userIdToGroupId = (uid: UserId): GroupId => uid as number as GroupId;

type AbsolutePathLiteral = `/${string}`;

/**
 * Compile-time validated `AbsolutePath` from a string literal.
 * Only accepts literals starting with `/`; variables are rejected because
 * their values aren't known at compile time. For dynamic paths, use
 * `decodeAbsolutePath` (runtime validation) or `pathJoin` (concatenation).
 */
export const path = <const S extends AbsolutePathLiteral>(literal: S): AbsolutePath =>
  literal as string as AbsolutePath;

/** Branded literal constructor. For dynamic input, use `decodeContainerImage`. */
export const containerImage = <const S extends string>(literal: S): ContainerImage =>
  literal as string as ContainerImage;

/** Branded literal constructor. For dynamic input, use `decodeContainerName`. */
export const containerName = <const S extends string>(literal: S): ContainerName =>
  literal as string as ContainerName;

/** Branded literal constructor. For dynamic input, use `decodeServiceName`. */
export const serviceName = <const S extends string>(literal: S): ServiceName =>
  literal as string as ServiceName;

/** Safe because `[a-z][a-z0-9-]*` is a subset of `ContainerName`'s pattern. */
export const serviceNameToContainerName = (name: ServiceName): ContainerName =>
  name as string as ContainerName;

/** Branded literal constructor. For dynamic input, use `decodeUsername`. */
export const username = <const S extends string>(literal: S): Username =>
  literal as string as Username;

/** Branded literal constructor. For dynamic input, use `decodeNetworkName`. */
export const networkName = <const S extends string>(literal: S): NetworkName =>
  literal as string as NetworkName;

/** Branded literal constructor. For dynamic input, use `decodeVolumeName`. */
export const volumeName = <const S extends string>(literal: S): VolumeName =>
  literal as string as VolumeName;

/** Join path segments, preserving `AbsolutePath` brand when the base is branded. */
export function pathJoin(base: AbsolutePath, ...segments: string[]): AbsolutePath;
export function pathJoin(base: string, ...segments: string[]): string;
export function pathJoin(base: string, ...segments: string[]): string {
  return segments.length === 0 ? base : pipe([base, ...segments].join("/"), collapseChar("/"));
}

/** Append a suffix (e.g. `".bak"`), preserving `AbsolutePath` brand. */
export function pathWithSuffix(base: AbsolutePath, suffix: string): AbsolutePath;
export function pathWithSuffix(base: string, suffix: string): string;
export function pathWithSuffix(base: string, suffix: string): string {
  return `${base}${suffix}`;
}

export const joinPath = (...segments: string[]): Effect.Effect<AbsolutePath, GeneralError> =>
  segments.length === 0
    ? Effect.fail(
        new GeneralError({
          code: ErrorCode.INVALID_ARGS as 2,
          message: "No path segments provided",
        })
      )
    : decodeAbsolutePath(pipe(segments.join("/"), collapseChar("/"))).pipe(
        Effect.mapError(parseErrorToGeneralError)
      );
