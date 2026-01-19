// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, test } from "bun:test";
import { PrivateIP, isPrivateIP } from "../../src/lib/types";

describe("PrivateIP", () => {
  describe("valid RFC 1918 IPv4", () => {
    test("accepts 10.x.x.x range", () => {
      expect(PrivateIP("10.0.0.1").ok).toBe(true);
      expect(PrivateIP("10.255.255.255").ok).toBe(true);
      expect(PrivateIP("10.0.2.2").ok).toBe(true);
    });

    test("accepts 172.16-31.x.x range", () => {
      expect(PrivateIP("172.16.0.1").ok).toBe(true);
      expect(PrivateIP("172.31.255.255").ok).toBe(true);
      expect(PrivateIP("172.20.10.5").ok).toBe(true);
    });

    test("accepts 192.168.x.x range", () => {
      expect(PrivateIP("192.168.0.1").ok).toBe(true);
      expect(PrivateIP("192.168.255.255").ok).toBe(true);
      expect(PrivateIP("192.168.1.100").ok).toBe(true);
    });
  });

  describe("invalid IPv4", () => {
    test("rejects public IPv4", () => {
      expect(PrivateIP("8.8.8.8").ok).toBe(false);
      expect(PrivateIP("1.1.1.1").ok).toBe(false);
      expect(PrivateIP("172.15.0.1").ok).toBe(false);
      expect(PrivateIP("172.32.0.1").ok).toBe(false);
    });

    test("rejects invalid octets", () => {
      expect(PrivateIP("10.256.0.1").ok).toBe(false);
      expect(PrivateIP("10.0.0.256").ok).toBe(false);
    });

    test("rejects localhost", () => {
      expect(PrivateIP("127.0.0.1").ok).toBe(false);
    });
  });

  describe("valid RFC 4193 IPv6", () => {
    test("accepts fc00::/7 range", () => {
      expect(PrivateIP("fc00::1").ok).toBe(true);
      expect(PrivateIP("fd00::1").ok).toBe(true);
      expect(PrivateIP("fd12:3456:789a::1").ok).toBe(true);
    });
  });

  describe("invalid IPv6", () => {
    test("rejects public IPv6", () => {
      expect(PrivateIP("2001:db8::1").ok).toBe(false);
    });

    test("rejects loopback", () => {
      expect(PrivateIP("::1").ok).toBe(false);
    });

    test("rejects link-local", () => {
      expect(PrivateIP("fe80::1").ok).toBe(false);
    });

    test("rejects malformed IPv6", () => {
      expect(PrivateIP("fd00:xyz::1").ok).toBe(false); // invalid hex
      expect(PrivateIP("fd00:1:2:3:4:5:6:7:8:9").ok).toBe(false); // too many groups
      expect(PrivateIP("fd00::1::2").ok).toBe(false); // multiple ::
    });
  });

  describe("invalid input", () => {
    test("rejects empty string", () => {
      expect(PrivateIP("").ok).toBe(false);
    });

    test("rejects non-IP strings", () => {
      expect(PrivateIP("localhost").ok).toBe(false);
      expect(PrivateIP("example.com").ok).toBe(false);
    });
  });

  describe("isPrivateIP type guard", () => {
    test("returns true for valid private IPs", () => {
      expect(isPrivateIP("10.0.2.2")).toBe(true);
      expect(isPrivateIP("fd00::1")).toBe(true);
    });

    test("returns false for invalid IPs", () => {
      expect(isPrivateIP("8.8.8.8")).toBe(false);
      expect(isPrivateIP("invalid")).toBe(false);
    });
  });
});
