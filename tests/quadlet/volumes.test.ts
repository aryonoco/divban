// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, test } from "bun:test";
import {
  isBindMount,
  isNamedVolume,
  processVolumes,
  relabelVolumes,
  withOwnershipFlag,
  withSELinuxRelabel,
} from "../../src/quadlet/container/volumes";
import type { VolumeMount } from "../../src/quadlet/types";

describe("volume helpers", () => {
  describe("isBindMount", () => {
    test("returns true for absolute paths", () => {
      expect(isBindMount("/data")).toBe(true);
      expect(isBindMount("/var/lib/app")).toBe(true);
    });

    test("returns false for named volumes", () => {
      expect(isBindMount("myvolume.volume")).toBe(false);
      expect(isBindMount("data")).toBe(false);
    });
  });

  describe("isNamedVolume", () => {
    test("returns true for .volume suffix", () => {
      expect(isNamedVolume("myvolume.volume")).toBe(true);
    });

    test("returns false for bind mounts", () => {
      expect(isNamedVolume("/data")).toBe(false);
    });
  });
});

describe("withOwnershipFlag", () => {
  test("adds :U to bind mount without options", () => {
    const mount: VolumeMount = { source: "/var/data", target: "/data" };
    const result = withOwnershipFlag(mount);
    expect(result.options).toBe("U");
  });

  test("appends U to existing options", () => {
    const mount: VolumeMount = { source: "/var/data", target: "/data", options: "ro" };
    const result = withOwnershipFlag(mount);
    expect(result.options).toBe("ro,U");
  });

  test("does not modify named volumes", () => {
    const mount: VolumeMount = { source: "myvolume.volume", target: "/data" };
    const result = withOwnershipFlag(mount);
    expect(result.options).toBeUndefined();
  });

  test("does not duplicate U flag", () => {
    const mount: VolumeMount = { source: "/var/data", target: "/data", options: "U" };
    const result = withOwnershipFlag(mount);
    expect(result.options).toBe("U");
  });

  test("does not duplicate U flag with other options", () => {
    const mount: VolumeMount = { source: "/var/data", target: "/data", options: "ro,U" };
    const result = withOwnershipFlag(mount);
    expect(result.options).toBe("ro,U");
  });
});

describe("withSELinuxRelabel", () => {
  test("adds :Z to bind mount when SELinux enforcing", () => {
    const mount: VolumeMount = { source: "/var/data", target: "/data" };
    const result = withSELinuxRelabel(mount, true);
    expect(result.options).toBe("Z");
  });

  test("does not modify when SELinux not enforcing", () => {
    const mount: VolumeMount = { source: "/var/data", target: "/data" };
    const result = withSELinuxRelabel(mount, false);
    expect(result.options).toBeUndefined();
  });

  test("does not modify named volumes", () => {
    const mount: VolumeMount = { source: "myvolume.volume", target: "/data" };
    const result = withSELinuxRelabel(mount, true);
    expect(result.options).toBeUndefined();
  });
});

describe("processVolumes", () => {
  test("applies both SELinux and ownership flags to bind mounts", () => {
    const volumes: VolumeMount[] = [
      { source: "/var/data", target: "/data" },
      { source: "myvolume.volume", target: "/volume" },
    ];

    const result = processVolumes(volumes, {
      selinuxEnforcing: true,
      applyOwnership: true,
    });

    expect(result).toHaveLength(2);
    // Bind mount gets both Z and U
    expect(result?.[0].options).toBe("Z,U");
    // Named volume unchanged
    expect(result?.[1].options).toBeUndefined();
  });

  test("applies only SELinux when ownership disabled", () => {
    const volumes: VolumeMount[] = [{ source: "/var/data", target: "/data" }];

    const result = processVolumes(volumes, {
      selinuxEnforcing: true,
      applyOwnership: false,
    });

    expect(result?.[0].options).toBe("Z");
  });

  test("applies only ownership when SELinux disabled", () => {
    const volumes: VolumeMount[] = [{ source: "/var/data", target: "/data" }];

    const result = processVolumes(volumes, {
      selinuxEnforcing: false,
      applyOwnership: true,
    });

    expect(result?.[0].options).toBe("U");
  });

  test("returns undefined for undefined input", () => {
    const result = processVolumes(undefined, {
      selinuxEnforcing: true,
      applyOwnership: true,
    });
    expect(result).toBeUndefined();
  });

  test("preserves existing options", () => {
    const volumes: VolumeMount[] = [{ source: "/var/data", target: "/data", options: "ro" }];

    const result = processVolumes(volumes, {
      selinuxEnforcing: true,
      applyOwnership: true,
    });

    expect(result?.[0].options).toBe("ro,Z,U");
  });
});

describe("relabelVolumes", () => {
  test("returns undefined for undefined input", () => {
    expect(relabelVolumes(undefined, true)).toBeUndefined();
  });

  test("returns empty array for empty input", () => {
    expect(relabelVolumes([], true)).toEqual([]);
  });

  test("applies :Z to bind mounts when SELinux enabled", () => {
    const volumes: VolumeMount[] = [
      { source: "/data1", target: "/app1" },
      { source: "/data2", target: "/app2" },
    ];
    const result = relabelVolumes(volumes, true);
    expect(result).toHaveLength(2);
    expect(result?.[0].options).toBe("Z");
    expect(result?.[1].options).toBe("Z");
  });

  test("skips named volumes", () => {
    const volumes: VolumeMount[] = [
      { source: "/data", target: "/app" },
      { source: "myvolume.volume", target: "/vol" },
    ];
    const result = relabelVolumes(volumes, true);
    expect(result).toHaveLength(2);
    expect(result?.[0].options).toBe("Z");
    expect(result?.[1].options).toBeUndefined();
  });
});
