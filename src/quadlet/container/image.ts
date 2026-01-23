// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Container image reference parsing and construction. Image references
 * have complex grammar: [registry/][namespace/]name[:tag][@digest].
 * The state-machine parser handles edge cases like port numbers in
 * registries (localhost:5000) that look like tags without context.
 */

import { Option, pipe } from "effect";
import type { ContainerImage } from "../../lib/types";
import type { Entries } from "../entry";
import { concat, fromMaybe, fromValue } from "../entry-combinators";

export interface ImageConfig {
  readonly image: ContainerImage;
  readonly imageDigest?: string | undefined;
  readonly autoUpdate?: "registry" | "local" | false | undefined;
}

interface ParseState {
  readonly remaining: string;
  readonly digest: Option.Option<string>;
  readonly tag: Option.Option<string>;
  readonly registry: Option.Option<string>;
}

const initialState = (ref: string): ParseState => ({
  remaining: ref,
  digest: Option.none(),
  tag: Option.none(),
  registry: Option.none(),
});

const extractDigest = (state: ParseState): ParseState => {
  const idx = state.remaining.indexOf("@");
  if (idx === -1) {
    return state;
  }
  return {
    ...state,
    digest: Option.some(state.remaining.slice(idx + 1)),
    remaining: state.remaining.slice(0, idx),
  };
};

const extractTag = (state: ParseState): ParseState => {
  const tagIdx = state.remaining.lastIndexOf(":");
  const lastSlash = state.remaining.lastIndexOf("/");
  if (tagIdx === -1 || tagIdx <= lastSlash) {
    return state;
  }
  return {
    ...state,
    tag: Option.some(state.remaining.slice(tagIdx + 1)),
    remaining: state.remaining.slice(0, tagIdx),
  };
};

const extractRegistry = (state: ParseState): ParseState => {
  const firstSlash = state.remaining.indexOf("/");
  if (firstSlash === -1) {
    return state;
  }
  const potential = state.remaining.slice(0, firstSlash);
  if (!(potential.includes(".") || potential.includes(":"))) {
    return state;
  }
  return {
    ...state,
    registry: Option.some(potential),
    remaining: state.remaining.slice(firstSlash + 1),
  };
};

interface ImageComponents {
  readonly name: string;
  readonly registry?: string;
  readonly tag?: string;
  readonly digest?: string;
}

const toComponents = (state: ParseState): ImageComponents => ({
  name: state.remaining,
  ...pipe(
    state.registry,
    Option.map((registry) => ({ registry })),
    Option.getOrElse(() => ({}))
  ),
  ...pipe(
    state.tag,
    Option.map((tag) => ({ tag })),
    Option.getOrElse(() => ({}))
  ),
  ...pipe(
    state.digest,
    Option.map((digest) => ({ digest })),
    Option.getOrElse(() => ({}))
  ),
});

export const getImageEntries = (config: ImageConfig): Entries =>
  concat(
    fromValue("Image", config.image),
    fromMaybe("Image", config.imageDigest, (d) => `${config.image}@${d}`),
    fromMaybe("AutoUpdate", config.autoUpdate, (v) => (v === false ? "" : v))
  ).filter((e) => e.value !== "");

export const parseImageReference = (ref: string): ImageComponents =>
  pipe(initialState(ref), extractDigest, extractTag, extractRegistry, toComponents);

export const buildImageReference = (components: ImageComponents): string =>
  pipe(
    components.name,
    (ref) =>
      pipe(
        Option.fromNullable(components.registry),
        Option.map((r) => `${r}/${ref}`),
        Option.getOrElse(() => ref)
      ),
    (ref) =>
      pipe(
        Option.fromNullable(components.tag),
        Option.map((t) => `${ref}:${t}`),
        Option.getOrElse(() => ref)
      ),
    (ref) =>
      pipe(
        Option.fromNullable(components.digest),
        Option.map((d) => `${ref}@${d}`),
        Option.getOrElse(() => ref)
      )
  );

export const Registries: Record<string, string> = {
  DOCKER_HUB: "docker.io",
  GHCR: "ghcr.io",
  QUAY: "quay.io",
  GCR: "gcr.io",
} as const satisfies Record<string, string>;
