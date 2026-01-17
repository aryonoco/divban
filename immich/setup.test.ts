// SPDX-License-Identifier: MIT
//===============================================================================
// setup.test.ts - Unit tests for Immich setup script
//===============================================================================

import { describe, test, expect } from "bun:test";
import {
  ConfigSchema,
  ServiceSchema,
  PathsSchema,
  NetworkSchema,
  HealthCheckSchema,
  HardwareSchema,
  ExternalLibrarySchema,
  generateNetworkQuadlet,
  generateVolumeQuadlet,
  generateContainerQuadlet,
  generateEnvFile,
  generateAllFiles,
  getDevicesForContainer,
  getMLImageWithSuffix,
  getBackendConfig,
  getExternalLibraryVolumes,
  substituteVariables,
  formatUserNs,
  TRANSCODING_DEVICES,
  ML_DEVICES,
  ML_IMAGE_SUFFIX,
  type Config,
} from "./setup";

//===============================================================================
// TEST FIXTURES
//===============================================================================

const mockConfig: Config = {
  service: {
    user: "immich" as any,
    uid: 1102 as any,
    subuid_start: 200000 as any,
    subuid_range: 65536,
  },
  paths: {
    data_dir: "/srv/immich" as any,
    upload_location: "/srv/immich/library" as any,
    db_data_location: "/srv/immich/postgres" as any,
  },
  network: {
    name: "immich-net",
    driver: "bridge",
    internal: true,
  },
  environment: {
    general: {
      TZ: "Australia/Melbourne",
      IMMICH_LOG_LEVEL: "log",
    },
    database: {
      DB_HOSTNAME: "immich-postgres",
      DB_PORT: 5432,
      DB_USERNAME: "immich",
      DB_PASSWORD: "test_password",
      DB_DATABASE_NAME: "immich",
    },
    postgres: {
      POSTGRES_USER: "immich",
      POSTGRES_PASSWORD: "test_password",
      POSTGRES_DB: "immich",
      POSTGRES_INITDB_ARGS: "--data-checksums",
    },
    redis: {
      REDIS_HOSTNAME: "immich-redis",
      REDIS_PORT: 6379,
    },
    machine_learning: {
      IMMICH_MACHINE_LEARNING_URL: "http://immich-machine-learning:3003",
    },
  },
  volumes: [
    { name: "immich-model-cache", description: "ML Model Cache" },
    { name: "immich-upload", description: "Photo Upload Volume" },
    { name: "immich-postgres-data", description: "PostgreSQL Data Volume" },
  ],
  external_libraries: [],
  containers: [
    {
      name: "immich-server",
      description: "Immich Server - Photo & Video Management",
      image: "ghcr.io/immich-app/immich-server:v1.124.2",
      requires: ["immich-redis", "immich-postgres"],
      wants: ["immich-machine-learning"],
      env_groups: ["general", "database", "redis", "machine_learning"],
      ports: [{ host_ip: "127.0.0.1", host: 2283, container: 2283, protocol: "tcp" }],
      volumes: [
        { source: "${UPLOAD_LOCATION}", target: "/usr/src/app/upload" },
        { source: "/etc/localtime", target: "/etc/localtime", options: "ro" },
      ],
      health: {
        cmd: "wget -q --spider http://localhost:2283/api/server/ping || exit 1",
        interval: "60s",
        timeout: "10s",
        retries: 3,
        start_period: "60s",
        on_failure: "kill",
      },
      no_new_privileges: true,
      auto_update: "registry",
      start_limit_burst: 5,
      start_limit_interval_sec: 300,
      service: {
        restart: "on-failure",
        restart_sec: 10,
        timeout_start_sec: 300,
        timeout_stop_sec: 30,
      },
    },
    {
      name: "immich-postgres",
      description: "PostgreSQL with Vector Extensions",
      image: "ghcr.io/immich-app/postgres:14-vectorchord0.4.3-pgvectors0.2.0",
      image_digest: "sha256:bcf63357191b76a916ae5eb93464d65c07511da41e3bf7a8416db519b40b1c23",
      requires: [],
      wants: [],
      env_groups: ["postgres"],
      ports: [],
      volumes: [
        { source: "${DB_DATA_LOCATION}", target: "/var/lib/postgresql/data" },
      ],
      user_ns: { mode: "keep-id", uid: 999, gid: 999 },
      shm_size: "256m",
      health: {
        cmd: "pg_isready -U ${DB_USERNAME} -d ${DB_DATABASE_NAME}",
        interval: "30s",
        timeout: "10s",
        retries: 5,
        start_period: "60s",
        on_failure: "kill",
      },
      no_new_privileges: true,
      auto_update: "registry",
      start_limit_burst: 5,
      start_limit_interval_sec: 300,
      service: {
        restart: "on-failure",
        restart_sec: 10,
        timeout_start_sec: 300,
        timeout_stop_sec: 60,
      },
    },
    {
      name: "immich-redis",
      description: "Valkey Cache (Redis-compatible)",
      image: "docker.io/valkey/valkey:8",
      image_digest: "sha256:81db6d39e1bba3b3ff32bd3a1b19a6d69690f94a3954ec131277b9a26b95b3aa",
      requires: [],
      wants: [],
      env_groups: [],
      ports: [],
      volumes: [],
      health: {
        cmd: "valkey-cli ping | grep -q PONG",
        interval: "30s",
        timeout: "5s",
        retries: 3,
        start_period: "10s",
        on_failure: "kill",
      },
      no_new_privileges: true,
      read_only_rootfs: true,
      auto_update: "registry",
      start_limit_burst: 5,
      start_limit_interval_sec: 300,
      service: {
        restart: "on-failure",
        restart_sec: 5,
        timeout_start_sec: 60,
        timeout_stop_sec: 30,
      },
    },
    {
      name: "immich-machine-learning",
      description: "Machine Learning Service",
      image: "ghcr.io/immich-app/immich-machine-learning:v1.124.2",
      requires: [],
      wants: [],
      env_groups: ["machine_learning"],
      ports: [],
      volumes: [{ source: "immich-model-cache.volume", target: "/cache" }],
      health: {
        cmd: "wget -q --spider http://localhost:3003/ping || exit 1",
        interval: "60s",
        timeout: "30s",
        retries: 3,
        start_period: "300s",
        on_failure: "kill",
      },
      no_new_privileges: true,
      auto_update: "registry",
      start_limit_burst: 5,
      start_limit_interval_sec: 300,
      service: {
        restart: "on-failure",
        restart_sec: 10,
        timeout_start_sec: 600,
        timeout_stop_sec: 30,
      },
    },
  ],
};

//===============================================================================
// SCHEMA VALIDATION TESTS
//===============================================================================

describe("Schema Validation", () => {
  describe("ServiceSchema", () => {
    test("validates valid service config", () => {
      const result = ServiceSchema.safeParse({
        user: "immich",
        uid: 1102,
        subuid_start: 200000,
        subuid_range: 65536,
      });
      expect(result.success).toBe(true);
    });

    test("rejects invalid UID", () => {
      const result = ServiceSchema.safeParse({
        user: "immich",
        uid: -1,
        subuid_start: 200000,
      });
      expect(result.success).toBe(false);
    });

    test("rejects invalid username", () => {
      const result = ServiceSchema.safeParse({
        user: "Invalid User",
        uid: 1102,
        subuid_start: 200000,
      });
      expect(result.success).toBe(false);
    });

    test("rejects low subuid_start", () => {
      const result = ServiceSchema.safeParse({
        user: "immich",
        uid: 1102,
        subuid_start: 50000,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("PathsSchema", () => {
    test("validates absolute paths", () => {
      const result = PathsSchema.safeParse({
        data_dir: "/srv/immich",
        upload_location: "/srv/immich/library",
        db_data_location: "/srv/immich/postgres",
      });
      expect(result.success).toBe(true);
    });

    test("rejects relative paths", () => {
      const result = PathsSchema.safeParse({
        data_dir: "srv/immich",
        upload_location: "/srv/immich/library",
        db_data_location: "/srv/immich/postgres",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("NetworkSchema", () => {
    test("validates network config with defaults", () => {
      const result = NetworkSchema.safeParse({
        name: "immich-net",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.driver).toBe("bridge");
        expect(result.data.internal).toBe(true);
      }
    });
  });

  describe("HealthCheckSchema", () => {
    test("validates health check with all options", () => {
      const result = HealthCheckSchema.safeParse({
        cmd: "wget -q --spider http://localhost:2283/api/server/ping || exit 1",
        interval: "60s",
        timeout: "10s",
        retries: 3,
        start_period: "60s",
        on_failure: "kill",
      });
      expect(result.success).toBe(true);
    });

    test("provides defaults for optional fields", () => {
      const result = HealthCheckSchema.safeParse({
        cmd: "echo ok",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.interval).toBe("30s");
        expect(result.data.timeout).toBe("10s");
        expect(result.data.retries).toBe(3);
      }
    });
  });

  describe("HardwareSchema", () => {
    test("validates CUDA configuration", () => {
      const result = HardwareSchema.safeParse({
        machine_learning: {
          backend: "cuda",
          device_ids: ["0"],
        },
      });
      expect(result.success).toBe(true);
    });

    test("validates transcoding configuration", () => {
      const result = HardwareSchema.safeParse({
        transcoding: {
          backend: "nvenc",
        },
      });
      expect(result.success).toBe(true);
    });

    test("rejects invalid backend", () => {
      const result = HardwareSchema.safeParse({
        machine_learning: {
          backend: "invalid",
        },
      });
      expect(result.success).toBe(false);
    });
  });

  describe("ExternalLibrarySchema", () => {
    test("validates external library config", () => {
      const result = ExternalLibrarySchema.safeParse({
        host_path: "/mnt/photos",
        container_path: "/external/photos",
        read_only: true,
      });
      expect(result.success).toBe(true);
    });

    test("defaults read_only to true", () => {
      const result = ExternalLibrarySchema.safeParse({
        host_path: "/mnt/photos",
        container_path: "/external/photos",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.read_only).toBe(true);
      }
    });
  });
});

//===============================================================================
// QUADLET GENERATION TESTS
//===============================================================================

describe("Quadlet Generation", () => {
  describe("generateNetworkQuadlet", () => {
    test("generates valid network quadlet", () => {
      const result = generateNetworkQuadlet(mockConfig);
      expect(result.path).toBe("immich.network");
      expect(result.content).toContain("[Network]");
      expect(result.content).toContain("NetworkName=immich-net");
      expect(result.content).toContain("Driver=bridge");
      expect(result.content).toContain("Internal=true");
    });
  });

  describe("generateVolumeQuadlet", () => {
    test("generates valid volume quadlet", () => {
      const vol = { name: "immich-model-cache", description: "ML Model Cache" };
      const result = generateVolumeQuadlet(vol);
      expect(result.path).toBe("immich-model-cache.volume");
      expect(result.content).toContain("[Volume]");
      expect(result.content).toContain("VolumeName=immich-model-cache");
      expect(result.content).toContain("Description=ML Model Cache");
    });
  });

  describe("generateContainerQuadlet", () => {
    test("generates valid container quadlet for immich-server", () => {
      const container = mockConfig.containers[0]!;
      const result = generateContainerQuadlet(container, mockConfig);
      expect(result.path).toBe("immich-server.container");
      expect(result.content).toContain("[Container]");
      expect(result.content).toContain("ContainerName=immich-server");
      expect(result.content).toContain("Image=ghcr.io/immich-app/immich-server:v1.124.2");
      expect(result.content).toContain("Network=immich.network");
      expect(result.content).toContain("PublishPort=127.0.0.1:2283:2283");
      expect(result.content).toContain("NoNewPrivileges=true");
      expect(result.content).toContain("LogDriver=journald");
    });

    test("generates quadlet with UserNS for postgres", () => {
      const container = mockConfig.containers[1]!;
      const result = generateContainerQuadlet(container, mockConfig);
      expect(result.content).toContain("UserNS=keep-id:uid=999,gid=999");
      expect(result.content).toContain("ShmSize=256m");
    });

    test("generates quadlet with ReadOnlyRootfs for redis", () => {
      const container = mockConfig.containers[2]!;
      const result = generateContainerQuadlet(container, mockConfig);
      expect(result.content).toContain("ReadOnlyRootfs=true");
    });

    test("generates quadlet with image digest", () => {
      const container = mockConfig.containers[1]!; // postgres has digest
      const result = generateContainerQuadlet(container, mockConfig);
      expect(result.content).toContain(
        "Image=ghcr.io/immich-app/postgres:14-vectorchord0.4.3-pgvectors0.2.0@sha256:bcf63357191b76a916ae5eb93464d65c07511da41e3bf7a8416db519b40b1c23"
      );
    });

    test("generates dependencies correctly", () => {
      const container = mockConfig.containers[0]!; // immich-server
      const result = generateContainerQuadlet(container, mockConfig);
      expect(result.content).toContain("Requires=immich-network.service immich-redis.service immich-postgres.service");
      expect(result.content).toContain("Wants=immich-machine-learning.service");
    });
  });

  describe("generateEnvFile", () => {
    test("generates valid env file with grouped variables", () => {
      const result = generateEnvFile(mockConfig);
      expect(result.path).toBe("immich.env");
      expect(result.content).toContain("# general");
      expect(result.content).toContain("TZ=Australia/Melbourne");
      expect(result.content).toContain("# database");
      expect(result.content).toContain("DB_HOSTNAME=immich-postgres");
      expect(result.content).toContain("# postgres");
      expect(result.content).toContain("POSTGRES_USER=immich");
    });
  });

  describe("generateAllFiles", () => {
    test("generates all required files", () => {
      const files = generateAllFiles(mockConfig);
      const paths = files.map((f) => f.path);

      expect(paths).toContain("immich.network");
      expect(paths).toContain("immich-model-cache.volume");
      expect(paths).toContain("immich-upload.volume");
      expect(paths).toContain("immich-postgres-data.volume");
      expect(paths).toContain("immich-server.container");
      expect(paths).toContain("immich-postgres.container");
      expect(paths).toContain("immich-redis.container");
      expect(paths).toContain("immich-machine-learning.container");
      expect(paths).toContain("immich.env");
    });
  });
});

//===============================================================================
// HARDWARE ACCELERATION TESTS
//===============================================================================

describe("Hardware Acceleration", () => {
  describe("getDevicesForContainer", () => {
    test("returns empty array when no hardware config", () => {
      const devices = getDevicesForContainer("immich-server", undefined);
      expect(devices).toEqual([]);
    });

    test("returns transcoding devices for immich-server", () => {
      const hardware = { transcoding: { backend: "vaapi" as const } };
      const devices = getDevicesForContainer("immich-server", hardware);
      expect(devices).toContain("/dev/dri:/dev/dri");
    });

    test("returns ML devices for immich-machine-learning", () => {
      const hardware = { machine_learning: { backend: "openvino" as const, device_ids: ["0"] } };
      const devices = getDevicesForContainer("immich-machine-learning", hardware);
      expect(devices).toContain("/dev/dri:/dev/dri");
    });

    test("returns empty for nvenc (uses GPU reservation)", () => {
      const hardware = { transcoding: { backend: "nvenc" as const } };
      const devices = getDevicesForContainer("immich-server", hardware);
      expect(devices).toEqual([]);
    });

    test("returns rkmpp devices", () => {
      const hardware = { transcoding: { backend: "rkmpp" as const } };
      const devices = getDevicesForContainer("immich-server", hardware);
      expect(devices).toContain("/dev/dri:/dev/dri");
      expect(devices).toContain("/dev/rga:/dev/rga");
      expect(devices).toContain("/dev/mpp_service:/dev/mpp_service");
    });
  });

  describe("getMLImageWithSuffix", () => {
    test("returns original image when no hardware config", () => {
      const result = getMLImageWithSuffix("ghcr.io/immich-app/immich-machine-learning:v1.124.2", undefined);
      expect(result).toBe("ghcr.io/immich-app/immich-machine-learning:v1.124.2");
    });

    test("appends -cuda suffix for CUDA backend", () => {
      const hardware = { machine_learning: { backend: "cuda" as const, device_ids: ["0"] } };
      const result = getMLImageWithSuffix("ghcr.io/immich-app/immich-machine-learning:v1.124.2", hardware);
      expect(result).toBe("ghcr.io/immich-app/immich-machine-learning-cuda:v1.124.2");
    });

    test("appends -openvino suffix for OpenVINO backend", () => {
      const hardware = { machine_learning: { backend: "openvino" as const, device_ids: ["0"] } };
      const result = getMLImageWithSuffix("ghcr.io/immich-app/immich-machine-learning:v1.124.2", hardware);
      expect(result).toBe("ghcr.io/immich-app/immich-machine-learning-openvino:v1.124.2");
    });
  });

  describe("getBackendConfig", () => {
    test("returns empty config when no hardware", () => {
      const result = getBackendConfig("immich-server", undefined);
      expect(result.volumes).toEqual([]);
      expect(result.env).toEqual({});
      expect(result.security).toEqual([]);
      expect(result.groups).toEqual([]);
    });

    test("returns security options for rkmpp", () => {
      const hardware = { transcoding: { backend: "rkmpp" as const } };
      const result = getBackendConfig("immich-server", hardware);
      expect(result.security).toContain("systempaths=unconfined");
      expect(result.security).toContain("apparmor=unconfined");
    });

    test("returns video group for rocm", () => {
      const hardware = { machine_learning: { backend: "rocm" as const, device_ids: ["0"] } };
      const result = getBackendConfig("immich-machine-learning", hardware);
      expect(result.groups).toContain("video");
    });

    test("returns WSL volumes for vaapi-wsl", () => {
      const hardware = { transcoding: { backend: "vaapi-wsl" as const } };
      const result = getBackendConfig("immich-server", hardware);
      expect(result.volumes).toContain("/usr/lib/wsl:/usr/lib/wsl:ro");
      expect(result.env).toHaveProperty("LIBVA_DRIVER_NAME", "d3d12");
    });
  });
});

//===============================================================================
// EXTERNAL LIBRARY TESTS
//===============================================================================

describe("External Libraries", () => {
  describe("getExternalLibraryVolumes", () => {
    test("returns empty for non-server containers", () => {
      const libs = [{ host_path: "/mnt/photos" as any, container_path: "/external/photos", read_only: true }];
      const result = getExternalLibraryVolumes("immich-machine-learning", libs);
      expect(result).toEqual([]);
    });

    test("returns volumes for immich-server", () => {
      const libs = [
        { host_path: "/mnt/photos" as any, container_path: "/external/photos", read_only: true },
        { host_path: "/mnt/videos" as any, container_path: "/external/videos", read_only: false },
      ];
      const result = getExternalLibraryVolumes("immich-server", libs);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        source: "/mnt/photos",
        target: "/external/photos",
        options: "ro",
      });
      expect(result[1]).toEqual({
        source: "/mnt/videos",
        target: "/external/videos",
        options: undefined,
      });
    });
  });
});

//===============================================================================
// UTILITY FUNCTION TESTS
//===============================================================================

describe("Utility Functions", () => {
  describe("substituteVariables", () => {
    test("substitutes UPLOAD_LOCATION", () => {
      const result = substituteVariables("${UPLOAD_LOCATION}", mockConfig);
      expect(result).toBe("/srv/immich/library");
    });

    test("substitutes DB_DATA_LOCATION", () => {
      const result = substituteVariables("${DB_DATA_LOCATION}", mockConfig);
      expect(result).toBe("/srv/immich/postgres");
    });

    test("substitutes DATA_DIR", () => {
      const result = substituteVariables("${DATA_DIR}", mockConfig);
      expect(result).toBe("/srv/immich");
    });

    test("substitutes DB_USERNAME", () => {
      const result = substituteVariables("pg_isready -U ${DB_USERNAME}", mockConfig);
      expect(result).toBe("pg_isready -U immich");
    });

    test("handles multiple substitutions", () => {
      const result = substituteVariables(
        "pg_isready -U ${DB_USERNAME} -d ${DB_DATABASE_NAME}",
        mockConfig
      );
      expect(result).toBe("pg_isready -U immich -d immich");
    });
  });

  describe("formatUserNs", () => {
    test("formats keep-id with uid and gid", () => {
      const result = formatUserNs({ mode: "keep-id", uid: 999, gid: 999 });
      expect(result).toBe("keep-id:uid=999,gid=999");
    });

    test("formats keep-id with uid only", () => {
      const result = formatUserNs({ mode: "keep-id", uid: 999 });
      expect(result).toBe("keep-id:uid=999");
    });

    test("formats auto mode", () => {
      const result = formatUserNs({ mode: "auto" });
      expect(result).toBe("auto");
    });

    test("formats host mode", () => {
      const result = formatUserNs({ mode: "host" });
      expect(result).toBe("host");
    });
  });
});

//===============================================================================
// CONSTANT TESTS
//===============================================================================

describe("Constants", () => {
  test("TRANSCODING_DEVICES has expected backends", () => {
    expect(TRANSCODING_DEVICES).toHaveProperty("nvenc");
    expect(TRANSCODING_DEVICES).toHaveProperty("qsv");
    expect(TRANSCODING_DEVICES).toHaveProperty("vaapi");
    expect(TRANSCODING_DEVICES).toHaveProperty("vaapi-wsl");
    expect(TRANSCODING_DEVICES).toHaveProperty("rkmpp");
  });

  test("ML_DEVICES has expected backends", () => {
    expect(ML_DEVICES).toHaveProperty("cuda");
    expect(ML_DEVICES).toHaveProperty("openvino");
    expect(ML_DEVICES).toHaveProperty("openvino-wsl");
    expect(ML_DEVICES).toHaveProperty("armnn");
    expect(ML_DEVICES).toHaveProperty("rknn");
    expect(ML_DEVICES).toHaveProperty("rocm");
  });

  test("ML_IMAGE_SUFFIX has expected values", () => {
    expect(ML_IMAGE_SUFFIX["cuda"]).toBe("-cuda");
    expect(ML_IMAGE_SUFFIX["openvino"]).toBe("-openvino");
    expect(ML_IMAGE_SUFFIX["armnn"]).toBe("-armnn");
    expect(ML_IMAGE_SUFFIX["rknn"]).toBe("-rknn");
    expect(ML_IMAGE_SUFFIX["rocm"]).toBe("-cuda"); // ROCm uses CUDA image
  });
});

//===============================================================================
// FULL CONFIG VALIDATION TEST
//===============================================================================

describe("Full Config Validation", () => {
  test("validates complete mock config", () => {
    const result = ConfigSchema.safeParse(mockConfig);
    expect(result.success).toBe(true);
  });

  test("validates config with hardware acceleration", () => {
    const configWithHardware = {
      ...mockConfig,
      hardware: {
        transcoding: { backend: "nvenc" },
        machine_learning: { backend: "cuda", device_ids: ["0"] },
      },
    };
    const result = ConfigSchema.safeParse(configWithHardware);
    expect(result.success).toBe(true);
  });

  test("validates config with external libraries", () => {
    const configWithLibs = {
      ...mockConfig,
      external_libraries: [
        { host_path: "/mnt/photos", container_path: "/external/photos", read_only: true },
      ],
    };
    const result = ConfigSchema.safeParse(configWithLibs);
    expect(result.success).toBe(true);
  });
});
