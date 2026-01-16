// SPDX-License-Identifier: MIT
//═══════════════════════════════════════════════════════════════════════════════
// setup.test.ts - Unit Tests for Caddy Setup Script
//═══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterAll, spyOn } from "bun:test";
import { z } from "zod";

import {
  // Schemas
  ConfigSchema,
  UserIdSchema,
  SubordinateIdSchema,
  AbsolutePathSchema,
  UsernameSchema,
  // Constants
  SCRIPT_VERSION,
  DEFAULT_UID,
  DEFAULT_SUBUID_START,
  SUBUID_RANGE,
  SERVICE_USER,
  DATA_DIR,
  QUADLET_FILES,
  REQUIRED_COMMANDS,
  ExitCode,
  // Errors
  SetupError,
  RootRequiredError,
  DependencyMissingError,
  CommandFailedError,
  FileNotFoundError,
  ValidationError,
  // Functions
  createLogger,
  buildConfig,
} from "./setup.ts";

//═══════════════════════════════════════════════════════════════════════════════
// SCHEMA VALIDATION TESTS
//═══════════════════════════════════════════════════════════════════════════════

describe("UserIdSchema", () => {
  it("accepts valid UIDs", () => {
    // Use Number() to strip the brand for comparison
    expect(Number(UserIdSchema.parse(0))).toBe(0);
    expect(Number(UserIdSchema.parse(1000))).toBe(1000);
    expect(Number(UserIdSchema.parse(65534))).toBe(65534);
  });

  it("rejects negative UIDs", () => {
    expect(() => UserIdSchema.parse(-1)).toThrow();
  });

  it("rejects UIDs above 65534", () => {
    expect(() => UserIdSchema.parse(65535)).toThrow();
  });

  it("rejects non-integers", () => {
    expect(() => UserIdSchema.parse(1000.5)).toThrow();
  });

  it("rejects non-numbers", () => {
    expect(() => UserIdSchema.parse("1000")).toThrow();
  });
});

describe("SubordinateIdSchema", () => {
  it("accepts valid subordinate IDs", () => {
    expect(Number(SubordinateIdSchema.parse(100000))).toBe(100000);
    expect(Number(SubordinateIdSchema.parse(200000))).toBe(200000);
  });

  it("rejects subordinate IDs below 100000", () => {
    expect(() => SubordinateIdSchema.parse(99999)).toThrow();
  });

  it("rejects non-integers", () => {
    expect(() => SubordinateIdSchema.parse(100000.5)).toThrow();
  });
});

describe("AbsolutePathSchema", () => {
  it("accepts absolute paths", () => {
    expect(String(AbsolutePathSchema.parse("/"))).toBe("/");
    expect(String(AbsolutePathSchema.parse("/home/user"))).toBe("/home/user");
    expect(String(AbsolutePathSchema.parse("/srv/caddy/data"))).toBe("/srv/caddy/data");
  });

  it("rejects relative paths", () => {
    expect(() => AbsolutePathSchema.parse("relative/path")).toThrow();
    expect(() => AbsolutePathSchema.parse("./local")).toThrow();
    expect(() => AbsolutePathSchema.parse("../parent")).toThrow();
  });

  it("rejects empty strings", () => {
    expect(() => AbsolutePathSchema.parse("")).toThrow();
  });
});

describe("UsernameSchema", () => {
  it("accepts valid usernames", () => {
    expect(String(UsernameSchema.parse("caddy"))).toBe("caddy");
    expect(String(UsernameSchema.parse("_admin"))).toBe("_admin");
    expect(String(UsernameSchema.parse("user-name"))).toBe("user-name");
    expect(String(UsernameSchema.parse("user_123"))).toBe("user_123");
  });

  it("rejects usernames starting with numbers", () => {
    expect(() => UsernameSchema.parse("123user")).toThrow();
  });

  it("rejects usernames starting with hyphen", () => {
    expect(() => UsernameSchema.parse("-user")).toThrow();
  });

  it("rejects usernames with uppercase", () => {
    expect(() => UsernameSchema.parse("User")).toThrow();
    expect(() => UsernameSchema.parse("ADMIN")).toThrow();
  });

  it("rejects usernames with special characters", () => {
    expect(() => UsernameSchema.parse("user@domain")).toThrow();
    expect(() => UsernameSchema.parse("user.name")).toThrow();
  });

  it("rejects usernames over 32 characters", () => {
    expect(() => UsernameSchema.parse("a".repeat(33))).toThrow();
  });
});

describe("ConfigSchema", () => {
  const validConfig = {
    serviceUser: "caddy",
    uid: 1100,
    subUidStart: 100000,
    dataDir: "/srv/caddy",
    scriptDir: "/opt/scripts",
    dryRun: false,
    verbose: false,
  };

  it("accepts valid configuration", () => {
    const result = ConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const incomplete = { serviceUser: "caddy" };
    const result = ConfigSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  it("validates nested schema constraints", () => {
    const invalidUid = { ...validConfig, uid: -1 };
    expect(ConfigSchema.safeParse(invalidUid).success).toBe(false);

    const invalidPath = { ...validConfig, dataDir: "relative" };
    expect(ConfigSchema.safeParse(invalidPath).success).toBe(false);
  });

  it("enforces exact optional property types", () => {
    const missingBooleans = {
      serviceUser: "caddy",
      uid: 1100,
      subUidStart: 100000,
      dataDir: "/srv/caddy",
      scriptDir: "/opt/scripts",
    };
    const result = ConfigSchema.safeParse(missingBooleans);
    expect(result.success).toBe(false);
  });
});

//═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS TESTS
//═══════════════════════════════════════════════════════════════════════════════

describe("Constants", () => {
  it("has correct version", () => {
    expect(SCRIPT_VERSION).toBe("1.0.0");
  });

  it("has correct default UID", () => {
    expect(DEFAULT_UID).toBe(1100);
  });

  it("has correct default subordinate UID start", () => {
    expect(DEFAULT_SUBUID_START).toBe(100000);
  });

  it("has correct subordinate range", () => {
    expect(SUBUID_RANGE).toBe(65536);
  });

  it("has correct service user", () => {
    expect(String(SERVICE_USER)).toBe("caddy");
  });

  it("has correct data directory", () => {
    expect(String(DATA_DIR)).toBe("/srv/caddy");
  });

  it("has all required quadlet files", () => {
    expect(QUADLET_FILES).toEqual([
      "caddy.container",
      "caddy-data.volume",
      "caddy-config.volume",
    ]);
  });

  it("has all required commands", () => {
    expect(REQUIRED_COMMANDS).toContain("podman");
    expect(REQUIRED_COMMANDS).toContain("systemctl");
    expect(REQUIRED_COMMANDS).toContain("loginctl");
    expect(REQUIRED_COMMANDS).toContain("useradd");
    expect(REQUIRED_COMMANDS.length).toBe(14);
  });

  it("has correct exit codes", () => {
    expect(ExitCode.Success).toBe(0);
    expect(ExitCode.GeneralError).toBe(1);
    expect(ExitCode.InvalidArgs).toBe(2);
    expect(ExitCode.RootRequired).toBe(3);
    expect(ExitCode.DependencyMissing).toBe(4);
  });
});

//═══════════════════════════════════════════════════════════════════════════════
// ERROR CLASSES TESTS
//═══════════════════════════════════════════════════════════════════════════════

describe("SetupError", () => {
  it("creates error with message and code", () => {
    const error = new SetupError("Test error", "GeneralError");
    expect(error.message).toBe("Test error");
    expect(error.code).toBe("GeneralError");
    expect(error.exitCode).toBe(1);
  });

  it("includes context when provided", () => {
    const error = new SetupError("Test error", "GeneralError", { key: "value" });
    expect(error.context).toEqual({ key: "value" });
  });

  it("has correct name", () => {
    const error = new SetupError("Test", "Success");
    expect(error.name).toBe("SetupError");
  });
});

describe("RootRequiredError", () => {
  it("creates error with correct message", () => {
    const error = new RootRequiredError();
    expect(error.message).toBe("This script must be run as root");
    expect(error.code).toBe("RootRequired");
    expect(error.exitCode).toBe(3);
  });
});

describe("DependencyMissingError", () => {
  it("creates error with list of missing commands", () => {
    const error = new DependencyMissingError(["cmd1", "cmd2"]);
    expect(error.message).toBe("Missing required commands: cmd1, cmd2");
    expect(error.code).toBe("DependencyMissing");
    expect(error.exitCode).toBe(4);
    expect(error.context?.["commands"]).toEqual(["cmd1", "cmd2"]);
  });
});

describe("CommandFailedError", () => {
  it("creates error with command details", () => {
    const error = new CommandFailedError("test cmd", 127, "not found");
    expect(error.message).toBe("Command failed: test cmd");
    expect(error.code).toBe("GeneralError");
    expect(error.context).toEqual({
      command: "test cmd",
      exitCode: 127,
      stderr: "not found",
    });
  });
});

describe("FileNotFoundError", () => {
  it("creates error with path", () => {
    const error = new FileNotFoundError("/path/to/file");
    expect(error.message).toBe("File not found: /path/to/file");
    expect(error.code).toBe("GeneralError");
    expect(error.context?.["path"]).toBe("/path/to/file");
  });
});

describe("ValidationError", () => {
  it("creates error with message", () => {
    const error = new ValidationError("Invalid input");
    expect(error.message).toBe("Invalid input");
    expect(error.code).toBe("InvalidArgs");
    expect(error.exitCode).toBe(2);
  });

  it("includes Zod error details when provided", () => {
    const zodError = new z.ZodError([
      {
        code: "custom",
        message: "Test issue",
        path: ["field"],
      },
    ]);
    const error = new ValidationError("Validation failed", zodError);
    const issues = error.context?.["issues"] as z.ZodIssue[] | undefined;
    expect(issues).toHaveLength(1);
  });
});

//═══════════════════════════════════════════════════════════════════════════════
// LOGGER TESTS
//═══════════════════════════════════════════════════════════════════════════════

describe("createLogger", () => {
  it("creates logger with all methods", () => {
    const log = createLogger(false);
    expect(typeof log.info).toBe("function");
    expect(typeof log.success).toBe("function");
    expect(typeof log.warn).toBe("function");
    expect(typeof log.error).toBe("function");
    expect(typeof log.debug).toBe("function");
    expect(typeof log.step).toBe("function");
  });

  it("debug only logs when verbose is true", () => {
    const consoleSpy = spyOn(console, "log").mockImplementation(() => {});

    const quietLog = createLogger(false);
    quietLog.debug("should not appear");
    expect(consoleSpy).not.toHaveBeenCalled();

    const verboseLog = createLogger(true);
    verboseLog.debug("should appear");
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("info logs to console.log", () => {
    const consoleSpy = spyOn(console, "log").mockImplementation(() => {});

    const log = createLogger(false);
    log.info("test message");

    expect(consoleSpy).toHaveBeenCalled();
    const call = consoleSpy.mock.calls[0]?.[0] as string | undefined;
    expect(call).toContain("INFO");
    expect(call).toContain("test message");

    consoleSpy.mockRestore();
  });

  it("error logs to console.error", () => {
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});

    const log = createLogger(false);
    log.error("error message");

    expect(consoleSpy).toHaveBeenCalled();
    const call = consoleSpy.mock.calls[0]?.[0] as string | undefined;
    expect(call).toContain("ERROR");
    expect(call).toContain("error message");

    consoleSpy.mockRestore();
  });

  it("step formats correctly", () => {
    const consoleSpy = spyOn(console, "log").mockImplementation(() => {});

    const log = createLogger(false);
    log.step(1, 7, "Test step");

    expect(consoleSpy).toHaveBeenCalled();
    const call = consoleSpy.mock.calls[0]?.[0] as string | undefined;
    expect(call).toContain("Step 1/7");
    expect(call).toContain("Test step");

    consoleSpy.mockRestore();
  });
});

//═══════════════════════════════════════════════════════════════════════════════
// TYPE BRANDING TESTS
//═══════════════════════════════════════════════════════════════════════════════

describe("Branded Types", () => {
  it("UserId is branded correctly", () => {
    const uid = UserIdSchema.parse(1000);
    // TypeScript ensures we can't accidentally use a SubordinateId where UserId is expected
    // At runtime, verify the underlying value
    expect(Number(uid)).toBe(1000);
  });

  it("SubordinateId is branded correctly", () => {
    const subId = SubordinateIdSchema.parse(100000);
    expect(Number(subId)).toBe(100000);
  });

  it("AbsolutePath is branded correctly", () => {
    const path = AbsolutePathSchema.parse("/home/user");
    expect(String(path)).toBe("/home/user");
  });

  it("Username is branded correctly", () => {
    const user = UsernameSchema.parse("caddy");
    expect(String(user)).toBe("caddy");
  });
});

//═══════════════════════════════════════════════════════════════════════════════
// EDGE CASES AND BOUNDARY TESTS
//═══════════════════════════════════════════════════════════════════════════════

describe("Edge Cases", () => {
  describe("UID boundaries", () => {
    it("accepts minimum UID (0)", () => {
      expect(Number(UserIdSchema.parse(0))).toBe(0);
    });

    it("accepts maximum UID (65534)", () => {
      expect(Number(UserIdSchema.parse(65534))).toBe(65534);
    });

    it("accepts UID 1 above minimum", () => {
      expect(Number(UserIdSchema.parse(1))).toBe(1);
    });

    it("rejects UID 1 above maximum", () => {
      expect(() => UserIdSchema.parse(65535)).toThrow();
    });
  });

  describe("SubordinateId boundaries", () => {
    it("accepts minimum subordinate ID (100000)", () => {
      expect(Number(SubordinateIdSchema.parse(100000))).toBe(100000);
    });

    it("rejects 1 below minimum", () => {
      expect(() => SubordinateIdSchema.parse(99999)).toThrow();
    });
  });

  describe("Username edge cases", () => {
    it("accepts single character username", () => {
      expect(String(UsernameSchema.parse("a"))).toBe("a");
    });

    it("accepts underscore-prefixed username", () => {
      expect(String(UsernameSchema.parse("_"))).toBe("_");
    });

    it("accepts maximum length username", () => {
      const maxName = "a".repeat(32);
      expect(String(UsernameSchema.parse(maxName))).toBe(maxName);
    });

    it("accepts username with all valid characters", () => {
      expect(String(UsernameSchema.parse("a_b-c0"))).toBe("a_b-c0");
    });
  });

  describe("Path edge cases", () => {
    it("accepts root path", () => {
      expect(String(AbsolutePathSchema.parse("/"))).toBe("/");
    });

    it("accepts path with spaces", () => {
      expect(String(AbsolutePathSchema.parse("/path with spaces"))).toBe("/path with spaces");
    });

    it("accepts path with special characters", () => {
      expect(String(AbsolutePathSchema.parse("/path-with_special.chars"))).toBe(
        "/path-with_special.chars"
      );
    });
  });
});

//═══════════════════════════════════════════════════════════════════════════════
// INTEGRATION TESTS (for testing buildConfig)
//═══════════════════════════════════════════════════════════════════════════════

describe("buildConfig", () => {
  const originalEnv = { ...Bun.env };

  beforeEach(() => {
    // Reset environment variables
    delete Bun.env["CADDY_UID"];
    delete Bun.env["CADDY_SUBUID_START"];
  });

  it("uses default values when no args or env provided", () => {
    const result = buildConfig({
      "dry-run": false,
      verbose: false,
      help: false,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Number(result.value.uid)).toBe(DEFAULT_UID);
      expect(Number(result.value.subUidStart)).toBe(DEFAULT_SUBUID_START);
      expect(String(result.value.serviceUser)).toBe(SERVICE_USER);
      expect(String(result.value.dataDir)).toBe(DATA_DIR);
    }
  });

  it("uses CLI args over defaults", () => {
    const result = buildConfig({
      uid: "2000",
      "subuid-start": "200000",
      "dry-run": true,
      verbose: true,
      help: false,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Number(result.value.uid)).toBe(2000);
      expect(Number(result.value.subUidStart)).toBe(200000);
      expect(result.value.dryRun).toBe(true);
      expect(result.value.verbose).toBe(true);
    }
  });

  it("uses environment variables over defaults", () => {
    Bun.env["CADDY_UID"] = "3000";
    Bun.env["CADDY_SUBUID_START"] = "300000";

    const result = buildConfig({
      "dry-run": false,
      verbose: false,
      help: false,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Number(result.value.uid)).toBe(3000);
      expect(Number(result.value.subUidStart)).toBe(300000);
    }
  });

  it("prefers CLI args over environment variables", () => {
    Bun.env["CADDY_UID"] = "3000";

    const result = buildConfig({
      uid: "4000",
      "dry-run": false,
      verbose: false,
      help: false,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Number(result.value.uid)).toBe(4000);
    }
  });

  it("returns error for invalid UID", () => {
    const result = buildConfig({
      uid: "invalid",
      "dry-run": false,
      verbose: false,
      help: false,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ValidationError);
    }
  });

  it("returns error for UID out of range", () => {
    const result = buildConfig({
      uid: "99999",
      "dry-run": false,
      verbose: false,
      help: false,
    });

    expect(result.ok).toBe(false);
  });

  it("returns error for subordinate ID out of range", () => {
    const result = buildConfig({
      "subuid-start": "1000",
      "dry-run": false,
      verbose: false,
      help: false,
    });

    expect(result.ok).toBe(false);
  });

  // Cleanup
  afterAll(() => {
    Object.assign(Bun.env, originalEnv);
  });
});

//═══════════════════════════════════════════════════════════════════════════════
// EXIT CODE MAPPING TESTS
//═══════════════════════════════════════════════════════════════════════════════

describe("Exit Code Mapping", () => {
  it("SetupError maps codes correctly", () => {
    expect(new SetupError("", "Success").exitCode).toBe(0);
    expect(new SetupError("", "GeneralError").exitCode).toBe(1);
    expect(new SetupError("", "InvalidArgs").exitCode).toBe(2);
    expect(new SetupError("", "RootRequired").exitCode).toBe(3);
    expect(new SetupError("", "DependencyMissing").exitCode).toBe(4);
  });

  it("all exit codes match bash script", () => {
    // These values must match setup.sh for compatibility
    expect(ExitCode.Success).toBe(0);
    expect(ExitCode.GeneralError).toBe(1);
    expect(ExitCode.InvalidArgs).toBe(2);
    expect(ExitCode.RootRequired).toBe(3);
    expect(ExitCode.DependencyMissing).toBe(4);
  });
});

//═══════════════════════════════════════════════════════════════════════════════
// QUADLET FILES TESTS
//═══════════════════════════════════════════════════════════════════════════════

describe("Quadlet Files", () => {
  it("contains exactly 3 files", () => {
    expect(QUADLET_FILES).toHaveLength(3);
  });

  it("includes container file", () => {
    expect(QUADLET_FILES).toContain("caddy.container");
  });

  it("includes data volume file", () => {
    expect(QUADLET_FILES).toContain("caddy-data.volume");
  });

  it("includes config volume file", () => {
    expect(QUADLET_FILES).toContain("caddy-config.volume");
  });

  it("all files have correct extensions", () => {
    for (const file of QUADLET_FILES) {
      expect(file.endsWith(".container") || file.endsWith(".volume")).toBe(true);
    }
  });
});

//═══════════════════════════════════════════════════════════════════════════════
// REQUIRED COMMANDS TESTS
//═══════════════════════════════════════════════════════════════════════════════

describe("Required Commands", () => {
  it("includes container runtime", () => {
    expect(REQUIRED_COMMANDS).toContain("podman");
  });

  it("includes systemd commands", () => {
    expect(REQUIRED_COMMANDS).toContain("systemctl");
    expect(REQUIRED_COMMANDS).toContain("loginctl");
  });

  it("includes user management commands", () => {
    expect(REQUIRED_COMMANDS).toContain("useradd");
    expect(REQUIRED_COMMANDS).toContain("getent");
  });

  it("includes file operation commands", () => {
    expect(REQUIRED_COMMANDS).toContain("mkdir");
    expect(REQUIRED_COMMANDS).toContain("cp");
    expect(REQUIRED_COMMANDS).toContain("chmod");
    expect(REQUIRED_COMMANDS).toContain("chown");
    expect(REQUIRED_COMMANDS).toContain("install");
  });

  it("includes system configuration commands", () => {
    expect(REQUIRED_COMMANDS).toContain("sysctl");
    expect(REQUIRED_COMMANDS).toContain("grep");
    expect(REQUIRED_COMMANDS).toContain("tee");
  });

  it("includes openssl for certificate handling", () => {
    expect(REQUIRED_COMMANDS).toContain("openssl");
  });
});
