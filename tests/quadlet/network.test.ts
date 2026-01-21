// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, test } from "bun:test";
import { formatNetworkMode, formatPortMapping } from "../../src/quadlet/container/network";

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

describe("formatPortMapping", () => {
  test("formats basic port mapping", () => {
    expect(formatPortMapping({ host: 80, container: 8080 })).toBe("80:8080/tcp");
  });

  test("formats port mapping with IPv4 hostIp", () => {
    expect(formatPortMapping({ hostIp: "127.0.0.1", host: 80, container: 8080 })).toBe(
      "127.0.0.1:80:8080/tcp"
    );
  });

  test("formats port mapping with IPv6 hostIp", () => {
    expect(formatPortMapping({ hostIp: "fd00::1", host: 80, container: 8080 })).toBe(
      "[fd00::1]:80:8080/tcp"
    );
  });

  test("formats port mapping with IPv6 loopback", () => {
    expect(formatPortMapping({ hostIp: "::1", host: 3000, container: 3000 })).toBe(
      "[::1]:3000:3000/tcp"
    );
  });

  test("formats port mapping with UDP protocol", () => {
    expect(formatPortMapping({ host: 443, container: 443, protocol: "udp" })).toBe("443:443/udp");
  });

  test("formats port mapping with IPv6 and UDP", () => {
    expect(
      formatPortMapping({ hostIp: "2001:db8::1", host: 443, container: 443, protocol: "udp" })
    ).toBe("[2001:db8::1]:443:443/udp");
  });
});
