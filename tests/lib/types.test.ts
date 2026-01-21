// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, test } from "bun:test";
import { Schema } from "effect";
import { PrivateIPSchema, isPrivateIP } from "../../src/lib/types";

describe("PrivateIP", () => {
  describe("valid RFC 1918 IPv4", () => {
    test("accepts 10.x.x.x range", () => {
      expect(Schema.is(PrivateIPSchema)("10.0.0.1")).toBe(true);
      expect(Schema.is(PrivateIPSchema)("10.255.255.255")).toBe(true);
      expect(Schema.is(PrivateIPSchema)("10.0.2.2")).toBe(true);
    });

    test("accepts 172.16-31.x.x range", () => {
      expect(Schema.is(PrivateIPSchema)("172.16.0.1")).toBe(true);
      expect(Schema.is(PrivateIPSchema)("172.31.255.255")).toBe(true);
      expect(Schema.is(PrivateIPSchema)("172.20.10.5")).toBe(true);
    });

    test("accepts 192.168.x.x range", () => {
      expect(Schema.is(PrivateIPSchema)("192.168.0.1")).toBe(true);
      expect(Schema.is(PrivateIPSchema)("192.168.255.255")).toBe(true);
      expect(Schema.is(PrivateIPSchema)("192.168.1.100")).toBe(true);
    });
  });

  describe("invalid IPv4", () => {
    test("rejects public IPv4", () => {
      expect(Schema.is(PrivateIPSchema)("8.8.8.8")).toBe(false);
      expect(Schema.is(PrivateIPSchema)("1.1.1.1")).toBe(false);
      expect(Schema.is(PrivateIPSchema)("172.15.0.1")).toBe(false);
      expect(Schema.is(PrivateIPSchema)("172.32.0.1")).toBe(false);
    });

    test("rejects invalid octets", () => {
      expect(Schema.is(PrivateIPSchema)("10.256.0.1")).toBe(false);
      expect(Schema.is(PrivateIPSchema)("10.0.0.256")).toBe(false);
    });

    test("rejects localhost", () => {
      expect(Schema.is(PrivateIPSchema)("127.0.0.1")).toBe(false);
    });
  });

  describe("valid RFC 4193 IPv6", () => {
    test("accepts fc00::/7 range", () => {
      expect(Schema.is(PrivateIPSchema)("fc00::1")).toBe(true);
      expect(Schema.is(PrivateIPSchema)("fd00::1")).toBe(true);
      expect(Schema.is(PrivateIPSchema)("fd12:3456:789a::1")).toBe(true);
    });
  });

  describe("invalid IPv6", () => {
    test("rejects public IPv6", () => {
      expect(Schema.is(PrivateIPSchema)("2001:db8::1")).toBe(false);
    });

    test("rejects loopback", () => {
      expect(Schema.is(PrivateIPSchema)("::1")).toBe(false);
    });

    test("rejects link-local", () => {
      expect(Schema.is(PrivateIPSchema)("fe80::1")).toBe(false);
    });

    test("rejects malformed IPv6", () => {
      expect(Schema.is(PrivateIPSchema)("fd00:xyz::1")).toBe(false); // invalid hex
      expect(Schema.is(PrivateIPSchema)("fd00:1:2:3:4:5:6:7:8:9")).toBe(false); // too many groups
      expect(Schema.is(PrivateIPSchema)("fd00::1::2")).toBe(false); // multiple ::
    });
  });

  describe("invalid input", () => {
    test("rejects empty string", () => {
      expect(Schema.is(PrivateIPSchema)("")).toBe(false);
    });

    test("rejects non-IP strings", () => {
      expect(Schema.is(PrivateIPSchema)("localhost")).toBe(false);
      expect(Schema.is(PrivateIPSchema)("example.com")).toBe(false);
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
