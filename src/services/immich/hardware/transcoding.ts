// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Video transcoding acceleration via hardware encoders. Software
 * encoding saturates CPU for hours; hardware offload (NVENC, QSV,
 * VAAPI) completes in minutes. Maps acceleration type to required
 * /dev/ device nodes and NVIDIA/Intel driver environment.
 */

import { Match, Option, pipe } from "effect";
import { mapOr } from "../../../lib/option-helpers";
import type { TranscodingConfig } from "../schema";

export interface TranscodingDevices {
  devices: string[];
  environment: Record<string, string>;
  volumes?: Array<{ source: string; target: string; options?: string }>;
}

const getNvencDevices = (gpuIndex?: number): TranscodingDevices => ({
  devices: mapOr(
    Option.fromNullable(gpuIndex),
    ["/dev/nvidia0", "/dev/nvidiactl", "/dev/nvidia-uvm", "/dev/nvidia-uvm-tools"],
    (idx) => [`/dev/nvidia${idx}`, "/dev/nvidiactl", "/dev/nvidia-uvm", "/dev/nvidia-uvm-tools"]
  ),
  environment: {
    NVIDIA_VISIBLE_DEVICES: mapOr(Option.fromNullable(gpuIndex), "all", String),
    NVIDIA_DRIVER_CAPABILITIES: "compute,video,utility",
  },
});

const getQsvDevices = (renderDevice?: string): TranscodingDevices => ({
  devices: [renderDevice ?? "/dev/dri/renderD128"],
  environment: {},
});

const getVaapiDevices = (renderDevice?: string): TranscodingDevices => ({
  devices: [renderDevice ?? "/dev/dri/renderD128"],
  environment: {},
});

const getVaapiWslDevices = (): TranscodingDevices => ({
  devices: ["/dev/dri/card0", "/dev/dri/renderD128"],
  environment: {},
  volumes: [{ source: "/usr/lib/wsl", target: "/usr/lib/wsl", options: "ro" }],
});

const getRkmppDevices = (): TranscodingDevices => ({
  devices: ["/dev/dri", "/dev/dma_heap", "/dev/mali0", "/dev/rga", "/dev/mpp_service"],
  environment: {},
});

export const getTranscodingDevices = (
  config: TranscodingConfig
): Option.Option<TranscodingDevices> =>
  pipe(
    Match.value(config),
    Match.when({ type: "nvenc" }, (c) => Option.some(getNvencDevices(c.gpuIndex))),
    Match.when({ type: "qsv" }, (c) => Option.some(getQsvDevices(c.renderDevice))),
    Match.when({ type: "vaapi" }, (c) => Option.some(getVaapiDevices(c.renderDevice))),
    Match.when({ type: "vaapi-wsl" }, () => Option.some(getVaapiWslDevices())),
    Match.when({ type: "rkmpp" }, () => Option.some(getRkmppDevices())),
    Match.when({ type: "disabled" }, () => Option.none()),
    Match.exhaustive
  );

export const requiresDevices = (config: TranscodingConfig): boolean => config.type !== "disabled";
