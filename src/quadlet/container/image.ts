// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Container image configuration for quadlet files.
 */

import { None, type Option, Some } from "../../lib/option";
import { addEntry } from "../format";

export interface ImageConfig {
  /** Container image reference */
  image: string;
  /** Optional image digest for pinning */
  imageDigest?: string | undefined;
  /** Auto-update configuration */
  autoUpdate?: "registry" | "local" | false | undefined;
}

/**
 * Add image-related entries to a section.
 */
export const addImageEntries = (
  entries: Array<{ key: string; value: string }>,
  config: ImageConfig
): void => {
  addEntry(entries, "Image", config.image);

  if (config.imageDigest) {
    // Note: Podman uses the digest in the image reference
    // Format: image@sha256:digest
    addEntry(entries, "Image", `${config.image}@${config.imageDigest}`);
  }

  // Auto-update label
  if (config.autoUpdate === "registry") {
    entries.push({ key: "AutoUpdate", value: "registry" });
  } else if (config.autoUpdate === "local") {
    entries.push({ key: "AutoUpdate", value: "local" });
  }
  // false means no auto-update (don't add the entry)
};

/**
 * Parse an image reference into its components.
 */
export const parseImageReference = (
  ref: string
): {
  registry?: string;
  name: string;
  tag?: string;
  digest?: string;
} => {
  let remaining = ref;
  let digest: Option<string> = None;
  let tag: Option<string> = None;
  let registry: Option<string> = None;

  // Extract digest
  const digestIndex = remaining.indexOf("@");
  if (digestIndex !== -1) {
    digest = Some(remaining.slice(digestIndex + 1));
    remaining = remaining.slice(0, digestIndex);
  }

  // Extract tag
  const tagIndex = remaining.lastIndexOf(":");
  // Only treat as tag if it's after the last slash (not a port)
  const lastSlash = remaining.lastIndexOf("/");
  if (tagIndex !== -1 && tagIndex > lastSlash) {
    tag = Some(remaining.slice(tagIndex + 1));
    remaining = remaining.slice(0, tagIndex);
  }

  // Extract registry (if contains a dot or colon before first slash)
  const firstSlash = remaining.indexOf("/");
  if (firstSlash !== -1) {
    const potentialRegistry = remaining.slice(0, firstSlash);
    if (potentialRegistry.includes(".") || potentialRegistry.includes(":")) {
      registry = Some(potentialRegistry);
      remaining = remaining.slice(firstSlash + 1);
    }
  }

  const result: {
    registry?: string;
    name: string;
    tag?: string;
    digest?: string;
  } = { name: remaining };

  if (registry.isSome) {
    result.registry = registry.value;
  }
  if (tag.isSome) {
    result.tag = tag.value;
  }
  if (digest.isSome) {
    result.digest = digest.value;
  }

  return result;
};

/**
 * Build a full image reference from components.
 */
export const buildImageReference = (components: {
  registry?: string;
  name: string;
  tag?: string;
  digest?: string;
}): string => {
  let ref = components.name;

  if (components.registry) {
    ref = `${components.registry}/${ref}`;
  }

  if (components.tag) {
    ref = `${ref}:${components.tag}`;
  }

  if (components.digest) {
    ref = `${ref}@${components.digest}`;
  }

  return ref;
};

/**
 * Common container registries.
 */
export const Registries: Record<string, string> = {
  DOCKER_HUB: "docker.io",
  GHCR: "ghcr.io",
  QUAY: "quay.io",
  GCR: "gcr.io",
} as const satisfies Record<string, string>;
