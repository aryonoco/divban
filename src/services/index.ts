// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** Uses existential types to store heterogeneous services in a single Map. */

import type { Context } from "effect";
import { Effect, Option, pipe } from "effect";
import { ErrorCode, ServiceError } from "../lib/errors";
import {
  type ExistentialService,
  type ServiceDefinition,
  type ServiceEffect,
  mkExistentialService,
} from "./types";

const services = new Map<string, ExistentialService>();

export const registerService = <C, I, Tag extends Context.Tag<I, C>>(
  service: ServiceEffect<C, I, Tag>
): void => {
  services.set(service.definition.name, mkExistentialService(service));
};

export const getService = (name: string): Effect.Effect<ExistentialService, ServiceError> =>
  pipe(
    Option.fromNullable(services.get(name)),
    Option.match({
      onNone: (): Effect.Effect<ExistentialService, ServiceError> => {
        const available = [...services.keys()].join(", ");
        return Effect.fail(
          new ServiceError({
            code: ErrorCode.SERVICE_NOT_FOUND as 30,
            message: `Unknown service: '${name}'. Available services: ${available || "none"}`,
          })
        );
      },
      onSome: (service): Effect.Effect<ExistentialService, never> => Effect.succeed(service),
    })
  );

export const listServices = (): ServiceDefinition[] => {
  return [...services.values()].map((s) => s.definition);
};

export const hasService = (name: string): boolean => {
  return services.has(name);
};

export const getServiceNames = (): string[] => {
  return [...services.keys()];
};

export type {
  ExistentialService,
  BackupResult,
  GeneratedFiles,
  LogOptions,
  ServiceEffect,
  ServiceDefinition,
  ServiceStatus,
} from "./types";

export { mkExistentialService } from "./types";

export {
  AppLogger,
  ServiceOptions,
  ServicePaths,
  ServiceUser,
  SystemCapabilities,
} from "./context";

export { createGeneratedFiles, getFileCount, mergeGeneratedFiles } from "./types";

export const initializeServices = async (): Promise<void> => {
  const { caddyService } = await import("./caddy");
  const { immichService } = await import("./immich");
  const { actualService } = await import("./actual");
  const { freshRssService } = await import("./freshrss");

  registerService(caddyService);
  registerService(immichService);
  registerService(actualService);
  registerService(freshRssService);
};
