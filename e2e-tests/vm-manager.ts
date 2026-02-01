// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Array as Arr, Effect, Match, Schedule, pipe } from "effect";
import { exec } from "../src/system/exec.ts";
import type { DistroConfig, IPAddress, VMConfig, VMInfo } from "./types.ts";
import { E2EError, ipAddress } from "./types.ts";

const SSH_KEY_PATH = "/var/tmp/divban-e2e-ssh-key" as const;
const IMAGE_CACHE_DIR = "/var/tmp/divban-e2e-images" as const;

// IP address parsing pattern
const WHITESPACE_PATTERN = /\s+/;

// Download cloud image (with caching)
export const downloadCloudImage = (distro: DistroConfig): Effect.Effect<string, E2EError> =>
  Effect.gen(function* () {
    const imagePath = `${IMAGE_CACHE_DIR}/${distro.name}.qcow2`;

    // Check if cached
    const checkResult = yield* exec(["test", "-f", imagePath]).pipe(
      Effect.catchAll(() => Effect.succeed({ exitCode: 1, stdout: "", stderr: "" }))
    );

    const shouldDownload = Match.value(checkResult.exitCode === 0).pipe(
      Match.when(true, () => false),
      Match.when(false, () => true),
      Match.exhaustive
    );

    return yield* pipe(
      shouldDownload,
      Match.value,
      Match.when(false, () =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`Using cached image: ${imagePath}`);
          return imagePath;
        })
      ),
      Match.when(true, () =>
        Effect.gen(function* () {
          // Download
          yield* Effect.logInfo(`Downloading ${distro.name} cloud image...`);
          yield* exec(["mkdir", "-p", IMAGE_CACHE_DIR]);
          yield* exec(["curl", "-L", "-o", imagePath, distro.imageURL]);
          return imagePath;
        })
      ),
      Match.exhaustive
    );
  });

// Create SSH key pair
export const ensureSSHKey = (): Effect.Effect<string, E2EError> =>
  Effect.gen(function* () {
    const checkResult = yield* exec(["test", "-f", SSH_KEY_PATH]).pipe(
      Effect.catchAll(() => Effect.succeed({ exitCode: 1, stdout: "", stderr: "" }))
    );

    const keyExists = Match.value(checkResult.exitCode === 0).pipe(
      Match.when(true, () => true),
      Match.when(false, () => false),
      Match.exhaustive
    );

    return yield* pipe(
      keyExists,
      Match.value,
      Match.when(true, () => Effect.succeed(SSH_KEY_PATH)),
      Match.when(false, () =>
        Effect.gen(function* () {
          yield* exec(["ssh-keygen", "-t", "ed25519", "-f", SSH_KEY_PATH, "-N", ""]);
          return SSH_KEY_PATH;
        })
      ),
      Match.exhaustive
    );
  });

// Create cloud-init user-data
const createCloudInitUserData = (distro: DistroConfig, sshPubKey: string): string => {
  const packagesYaml = pipe(
    distro.packages,
    Arr.map((pkg) => `  - ${pkg}`),
    Arr.join("\n")
  );

  const runcmdYaml = pipe(
    [...distro.initCommands, "systemctl enable --now sshd"],
    Arr.map((cmd) => `  - ${cmd}`),
    Arr.join("\n")
  );

  return `#cloud-config
users:
  - name: root
    ssh_authorized_keys:
      - ${sshPubKey}

packages:
${packagesYaml}

runcmd:
${runcmdYaml}
`;
};

// Create VM using virt-install
export const createVM = (config: VMConfig): Effect.Effect<VMInfo, E2EError> =>
  Effect.gen(function* () {
    const sshKeyPath = yield* ensureSSHKey();
    const imagePath = yield* downloadCloudImage(config.distro);

    // Read SSH public key
    const pubKeyResult = yield* exec(["cat", `${sshKeyPath}.pub`]);
    const sshPubKey = pubKeyResult.stdout.trim();

    // Create cloud-init user-data
    const userData = createCloudInitUserData(config.distro, sshPubKey);
    const userDataPath = `/var/tmp/${config.name}-user-data.yaml`;
    yield* exec(["sh", "-c", `cat > ${userDataPath} <<'EOF'\n${userData}\nEOF`]);

    // Create VM disk (copy from base image)
    const vmDiskPath = `/var/tmp/${config.name}.qcow2`;
    yield* exec(["qemu-img", "create", "-f", "qcow2", "-F", "qcow2", "-b", imagePath, vmDiskPath]);

    // Launch VM with virt-install
    yield* exec([
      "virt-install",
      "--name",
      config.name,
      "--memory",
      config.memory.toString(),
      "--vcpus",
      config.cpus.toString(),
      "--disk",
      `path=${vmDiskPath},format=qcow2`,
      "--cloud-init",
      `user-data=${userDataPath}`,
      "--network",
      "default",
      "--graphics",
      "none",
      "--noautoconsole",
      "--import",
    ]);

    // Wait for IP address
    const ipAddr = yield* waitForIPAddress(config.name);

    // Wait for SSH
    yield* waitForSSH(ipAddr, sshKeyPath);

    return {
      config,
      ipAddress: ipAddr,
      sshKeyPath,
    };
  });

// Get VM IP address
const waitForIPAddress = (vmName: string): Effect.Effect<IPAddress, E2EError> =>
  pipe(
    Effect.gen(function* () {
      const result = yield* exec(["virsh", "domifaddr", vmName, "--source", "agent"]);

      // Parse IP from output (format: "vnet0     52:54:00:xx:xx:xx    ipv4         192.168.122.100/24")
      const lines = result.stdout.split("\n");
      const ipLine = pipe(
        lines,
        Arr.findFirst((line) => line.includes("ipv4"))
      );

      return yield* pipe(
        ipLine,
        Match.value,
        Match.tag("None", () => Effect.fail(new E2EError("No IP address found"))),
        Match.tag("Some", ({ value }) =>
          Effect.gen(function* () {
            const parts = value.trim().split(WHITESPACE_PATTERN);
            const ipWithMask = parts.at(-1);
            const ipPart = ipWithMask?.split("/")[0];

            return yield* pipe(
              ipPart,
              Match.value,
              Match.when(undefined, () => Effect.fail(new E2EError("Failed to parse IP address"))),
              Match.when(null, () => Effect.fail(new E2EError("Failed to parse IP address"))),
              Match.orElse((ip) => Effect.succeed(ipAddress(ip)))
            );
          })
        ),
        Match.exhaustive
      );
    }),
    Effect.retry(Schedule.exponential("2 seconds").pipe(Schedule.compose(Schedule.recurs(30))))
  );

// Wait for SSH to be ready
const waitForSSH = (ip: IPAddress, keyPath: string): Effect.Effect<void, E2EError> =>
  pipe(
    exec([
      "ssh",
      "-i",
      keyPath,
      "-o",
      "StrictHostKeyChecking=no",
      "-o",
      "ConnectTimeout=5",
      `root@${ip}`,
      "echo",
      "ready",
    ]),
    Effect.retry(Schedule.exponential("2 seconds").pipe(Schedule.compose(Schedule.recurs(30)))),
    Effect.asVoid
  );

// Execute command via SSH
export const sshExec = (
  vm: VMInfo,
  command: readonly string[]
): Effect.Effect<{ exitCode: number; stdout: string; stderr: string }, E2EError> =>
  Effect.gen(function* () {
    const result = yield* exec([
      "ssh",
      "-i",
      vm.sshKeyPath,
      "-o",
      "StrictHostKeyChecking=no",
      `root@${vm.ipAddress}`,
      ...command,
    ]).pipe(
      Effect.catchAll((err) => Effect.succeed({ exitCode: 1, stdout: "", stderr: String(err) }))
    );

    return result;
  });

// Copy file to VM via SCP
export const scpCopy = (
  vm: VMInfo,
  localPath: string,
  remotePath: string
): Effect.Effect<void, E2EError> =>
  pipe(
    exec([
      "scp",
      "-i",
      vm.sshKeyPath,
      "-o",
      "StrictHostKeyChecking=no",
      localPath,
      `root@${vm.ipAddress}:${remotePath}`,
    ]),
    Effect.asVoid
  );

// Destroy VM
export const destroyVM = (vmName: string): Effect.Effect<void, E2EError> =>
  Effect.gen(function* () {
    // Destroy VM
    yield* exec(["virsh", "destroy", vmName]).pipe(Effect.catchAll(() => Effect.void));

    // Undefine VM
    yield* exec(["virsh", "undefine", vmName]).pipe(Effect.catchAll(() => Effect.void));

    // Remove disk
    const diskPath = `/var/tmp/${vmName}.qcow2`;
    yield* exec(["rm", "-f", diskPath]).pipe(Effect.catchAll(() => Effect.void));

    // Remove cloud-init user-data
    const userDataPath = `/var/tmp/${vmName}-user-data.yaml`;
    yield* exec(["rm", "-f", userDataPath]).pipe(Effect.catchAll(() => Effect.void));
  });
