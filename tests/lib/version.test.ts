import { describe, expect, test } from "bun:test";
import {
  compareVersions,
  isAtLeast,
  isNewerThan,
  satisfiesVersion,
  sortVersions,
  sortVersionsDesc,
} from "../../src/lib/version";

describe("version", () => {
  describe("satisfiesVersion", () => {
    test("checks exact version", () => {
      expect(satisfiesVersion("1.0.0", "1.0.0")).toBe(true);
      expect(satisfiesVersion("1.0.1", "1.0.0")).toBe(false);
    });

    test("checks version ranges", () => {
      expect(satisfiesVersion("1.2.3", ">=1.0.0")).toBe(true);
      expect(satisfiesVersion("0.9.0", ">=1.0.0")).toBe(false);
      expect(satisfiesVersion("1.5.0", "^1.0.0")).toBe(true);
      expect(satisfiesVersion("2.0.0", "^1.0.0")).toBe(false);
    });

    test("checks tilde ranges", () => {
      expect(satisfiesVersion("1.2.5", "~1.2.0")).toBe(true);
      expect(satisfiesVersion("1.3.0", "~1.2.0")).toBe(false);
    });
  });

  describe("compareVersions", () => {
    test("returns -1 when a < b", () => {
      expect(compareVersions("1.0.0", "2.0.0")).toBe(-1);
      expect(compareVersions("1.0.0", "1.0.1")).toBe(-1);
      expect(compareVersions("1.0.0", "1.1.0")).toBe(-1);
    });

    test("returns 0 when a == b", () => {
      expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
      expect(compareVersions("2.5.3", "2.5.3")).toBe(0);
    });

    test("returns 1 when a > b", () => {
      expect(compareVersions("2.0.0", "1.0.0")).toBe(1);
      expect(compareVersions("1.0.1", "1.0.0")).toBe(1);
      expect(compareVersions("1.1.0", "1.0.0")).toBe(1);
    });
  });

  describe("sortVersions", () => {
    test("sorts versions in ascending order", () => {
      const versions = ["2.0.0", "1.0.0", "1.5.0", "1.0.1"];
      const sorted = sortVersions(versions);
      expect(sorted).toEqual(["1.0.0", "1.0.1", "1.5.0", "2.0.0"]);
    });

    test("does not mutate original array", () => {
      const versions = ["2.0.0", "1.0.0"];
      sortVersions(versions);
      expect(versions).toEqual(["2.0.0", "1.0.0"]);
    });
  });

  describe("sortVersionsDesc", () => {
    test("sorts versions in descending order", () => {
      const versions = ["1.0.0", "2.0.0", "1.5.0", "1.0.1"];
      const sorted = sortVersionsDesc(versions);
      expect(sorted).toEqual(["2.0.0", "1.5.0", "1.0.1", "1.0.0"]);
    });
  });

  describe("isNewerThan", () => {
    test("returns true when version is newer", () => {
      expect(isNewerThan("2.0.0", "1.0.0")).toBe(true);
      expect(isNewerThan("1.1.0", "1.0.0")).toBe(true);
    });

    test("returns false when version is older or equal", () => {
      expect(isNewerThan("1.0.0", "2.0.0")).toBe(false);
      expect(isNewerThan("1.0.0", "1.0.0")).toBe(false);
    });
  });

  describe("isAtLeast", () => {
    test("returns true when version meets minimum", () => {
      expect(isAtLeast("1.0.0", "1.0.0")).toBe(true);
      expect(isAtLeast("2.0.0", "1.0.0")).toBe(true);
    });

    test("returns false when version is below minimum", () => {
      expect(isAtLeast("0.9.0", "1.0.0")).toBe(false);
    });
  });
});
