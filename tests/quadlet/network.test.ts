// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, test } from "bun:test";
import { addNetworkEntries, formatNetworkMode } from "../../src/quadlet/container/network";

describe("formatNetworkMode", () => {
  test("returns mode unchanged when no mapHostLoopback", () => {
    expect(formatNetworkMode("pasta")).toBe("pasta");
    expect(formatNetworkMode("slirp4netns")).toBe("slirp4netns");
    expect(formatNetworkMode("host")).toBe("host");
    expect(formatNetworkMode("none")).toBe("none");
  });

  test("returns mode unchanged for non-pasta with mapHostLoopback", () => {
    expect(formatNetworkMode("host", "10.0.2.2")).toBe("host");
    expect(formatNetworkMode("slirp4netns", "10.0.2.2")).toBe("slirp4netns");
  });

  test("formats pasta with mapHostLoopback", () => {
    expect(formatNetworkMode("pasta", "10.0.2.2")).toBe("pasta:--map-host-loopback=10.0.2.2");
  });

  test("formats pasta with IPv6 mapHostLoopback", () => {
    expect(formatNetworkMode("pasta", "fd00::1")).toBe("pasta:--map-host-loopback=fd00::1");
  });
});

describe("addNetworkEntries", () => {
  test("adds networkMode entry", () => {
    const entries: Array<{ key: string; value: string }> = [];
    addNetworkEntries(entries, { networkMode: "pasta" });
    expect(entries).toContainEqual({ key: "Network", value: "pasta" });
  });

  test("adds networkMode with mapHostLoopback", () => {
    const entries: Array<{ key: string; value: string }> = [];
    addNetworkEntries(entries, { networkMode: "pasta", mapHostLoopback: "10.0.2.2" });
    expect(entries).toContainEqual({ key: "Network", value: "pasta:--map-host-loopback=10.0.2.2" });
  });

  test("ignores mapHostLoopback for non-pasta modes", () => {
    const entries: Array<{ key: string; value: string }> = [];
    addNetworkEntries(entries, { networkMode: "host", mapHostLoopback: "10.0.2.2" });
    expect(entries).toContainEqual({ key: "Network", value: "host" });
  });

  test("adds named network entry", () => {
    const entries: Array<{ key: string; value: string }> = [];
    addNetworkEntries(entries, { network: "mynetwork" });
    expect(entries).toContainEqual({ key: "Network", value: "mynetwork" });
  });

  test("adds both named network and networkMode", () => {
    const entries: Array<{ key: string; value: string }> = [];
    addNetworkEntries(entries, { network: "mynetwork", networkMode: "pasta" });
    expect(entries).toContainEqual({ key: "Network", value: "mynetwork" });
    expect(entries).toContainEqual({ key: "Network", value: "pasta" });
  });
});
