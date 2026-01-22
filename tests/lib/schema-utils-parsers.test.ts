// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, test } from "bun:test";
import { Option } from "effect";
import {
  isValidContainerImage,
  isValidEmail,
  isValidIPv4,
  isValidIPv6,
  isValidPosixUsername,
  isValidServiceName,
  parseContainerImage,
  parseEmail,
  parseIPv4,
  parseNat,
  parseOctet,
  parsePosixUsername,
} from "../../src/lib/schema-utils";

describe("parser-first validators", () => {
  describe("parseNat", () => {
    test("parses valid naturals", () => {
      expect(parseNat("0")).toEqual(Option.some(0));
      expect(parseNat("123")).toEqual(Option.some(123));
      expect(parseNat("42")).toEqual(Option.some(42));
    });

    test("rejects leading zeros", () => {
      expect(parseNat("01")).toEqual(Option.none());
      expect(parseNat("007")).toEqual(Option.none());
    });

    test("rejects non-digits", () => {
      expect(parseNat("12a")).toEqual(Option.none());
      expect(parseNat("abc")).toEqual(Option.none());
      expect(parseNat("-1")).toEqual(Option.none());
    });

    test("rejects empty string", () => {
      expect(parseNat("")).toEqual(Option.none());
    });
  });

  describe("parseOctet", () => {
    test("parses valid octets", () => {
      expect(parseOctet("0")).toEqual(Option.some(0));
      expect(parseOctet("255")).toEqual(Option.some(255));
      expect(parseOctet("128")).toEqual(Option.some(128));
    });

    test("rejects values over 255", () => {
      expect(parseOctet("256")).toEqual(Option.none());
      expect(parseOctet("300")).toEqual(Option.none());
    });

    test("rejects leading zeros", () => {
      expect(parseOctet("01")).toEqual(Option.none());
    });
  });

  describe("parseIPv4", () => {
    test("parses valid IPv4 addresses", () => {
      expect(parseIPv4("192.168.1.1")).toEqual(Option.some([192, 168, 1, 1]));
      expect(parseIPv4("0.0.0.0")).toEqual(Option.some([0, 0, 0, 0]));
      expect(parseIPv4("255.255.255.255")).toEqual(Option.some([255, 255, 255, 255]));
    });

    test("rejects invalid octets", () => {
      expect(parseIPv4("256.0.0.1")).toEqual(Option.none());
      expect(parseIPv4("192.168.01.1")).toEqual(Option.none()); // leading zero
    });

    test("rejects wrong number of parts", () => {
      expect(parseIPv4("192.168.1")).toEqual(Option.none());
      expect(parseIPv4("192.168.1.1.1")).toEqual(Option.none());
    });
  });

  describe("isValidIPv4", () => {
    test("returns true for valid IPv4", () => {
      expect(isValidIPv4("10.0.0.1")).toBe(true);
    });

    test("returns false for invalid IPv4", () => {
      expect(isValidIPv4("256.0.0.1")).toBe(false);
    });
  });

  describe("isValidIPv6", () => {
    test("returns true for valid IPv6", () => {
      expect(isValidIPv6("::1")).toBe(true);
      expect(isValidIPv6("fe80::1")).toBe(true);
      expect(isValidIPv6("2001:db8::1")).toBe(true);
      expect(isValidIPv6("fd00:1234:5678::1")).toBe(true);
    });

    test("rejects multiple :: ", () => {
      expect(isValidIPv6("fd00::1::2")).toBe(false);
    });

    test("rejects invalid hex groups", () => {
      expect(isValidIPv6("fd00:xyz::1")).toBe(false);
    });
  });

  describe("parseEmail", () => {
    test("parses valid emails", () => {
      const result = parseEmail("user@example.com");
      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) {
        expect(result.value.local).toBe("user");
        expect(result.value.domain).toBe("example.com");
      }
    });

    test("rejects missing @", () => {
      expect(parseEmail("userexample.com")).toEqual(Option.none());
    });

    test("rejects @ at start", () => {
      expect(parseEmail("@example.com")).toEqual(Option.none());
    });

    test("rejects missing domain dot", () => {
      expect(parseEmail("user@localhost")).toEqual(Option.none());
    });

    test("rejects empty string", () => {
      expect(parseEmail("")).toEqual(Option.none());
    });
  });

  describe("isValidEmail", () => {
    test("returns true for valid email", () => {
      expect(isValidEmail("test@example.com")).toBe(true);
    });

    test("returns false for invalid email", () => {
      expect(isValidEmail("invalid")).toBe(false);
    });
  });

  describe("parsePosixUsername", () => {
    test("parses valid usernames", () => {
      expect(Option.isSome(parsePosixUsername("alice"))).toBe(true);
      expect(Option.isSome(parsePosixUsername("_root"))).toBe(true);
      expect(Option.isSome(parsePosixUsername("user-01"))).toBe(true);
      expect(Option.isSome(parsePosixUsername("a"))).toBe(true);
    });

    test("rejects uppercase first character", () => {
      expect(parsePosixUsername("Alice")).toEqual(Option.none());
    });

    test("rejects starting with digit", () => {
      expect(parsePosixUsername("0user")).toEqual(Option.none());
    });

    test("rejects empty string", () => {
      expect(parsePosixUsername("")).toEqual(Option.none());
    });
  });

  describe("isValidPosixUsername", () => {
    test("returns true for valid username", () => {
      expect(isValidPosixUsername("testuser")).toBe(true);
    });

    test("returns false for invalid username", () => {
      expect(isValidPosixUsername("0invalid")).toBe(false);
    });
  });

  describe("isValidServiceName", () => {
    test("returns true for valid service names", () => {
      expect(isValidServiceName("caddy")).toBe(true);
      expect(isValidServiceName("immich-server")).toBe(true);
      expect(isValidServiceName("a1")).toBe(true);
    });

    test("rejects starting with digit", () => {
      expect(isValidServiceName("0service")).toBe(false);
    });

    test("rejects uppercase", () => {
      expect(isValidServiceName("Caddy")).toBe(false);
    });
  });

  describe("parseContainerImage", () => {
    test("parses simple image name", () => {
      const result = parseContainerImage("nginx");
      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) {
        expect(result.value.name).toBe("nginx");
        expect(result.value.tag).toEqual(Option.none());
        expect(result.value.digest).toEqual(Option.none());
      }
    });

    test("parses image with tag", () => {
      const result = parseContainerImage("nginx:latest");
      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) {
        expect(result.value.name).toBe("nginx");
        expect(result.value.tag).toEqual(Option.some("latest"));
      }
    });

    test("parses image with digest", () => {
      const result = parseContainerImage("nginx@sha256:abc123");
      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) {
        expect(result.value.name).toBe("nginx");
        expect(result.value.digest).toEqual(Option.some("abc123"));
      }
    });

    test("parses image with tag and digest", () => {
      const result = parseContainerImage("nginx:latest@sha256:abc123");
      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) {
        expect(result.value.name).toBe("nginx");
        expect(result.value.tag).toEqual(Option.some("latest"));
        expect(result.value.digest).toEqual(Option.some("abc123"));
      }
    });

    test("parses image with registry and path", () => {
      const result = parseContainerImage("docker.io/library/nginx:latest");
      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) {
        expect(result.value.name).toBe("docker.io/library/nginx");
        expect(result.value.tag).toEqual(Option.some("latest"));
      }
    });

    test("rejects empty image name", () => {
      expect(parseContainerImage("")).toEqual(Option.none());
    });

    test("rejects empty tag after colon", () => {
      expect(parseContainerImage("nginx:")).toEqual(Option.none());
    });
  });

  describe("isValidContainerImage", () => {
    test("returns true for valid images", () => {
      expect(isValidContainerImage("nginx")).toBe(true);
      expect(isValidContainerImage("nginx:latest")).toBe(true);
      expect(isValidContainerImage("ghcr.io/owner/repo:v1.0")).toBe(true);
    });

    test("returns false for invalid images", () => {
      expect(isValidContainerImage("")).toBe(false);
      expect(isValidContainerImage("nginx:")).toBe(false);
    });
  });
});
