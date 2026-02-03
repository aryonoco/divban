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
const NETWORK_ACTIVE_PATTERN = /Active:\s+yes/;

// Helper to run virsh commands with sudo (needed for network/bridge operations)
const virsh = (args: readonly string[]): ReturnType<typeof exec> =>
  exec(["sudo", "virsh", ...args]);

// Helper to run virt-install with sudo
const virtInstall = (args: readonly string[]): ReturnType<typeof exec> =>
  exec(["sudo", "virt-install", ...args]);

// Default network XML for libvirt
const DEFAULT_NETWORK_XML = `<network>
  <name>default</name>
  <forward mode='nat'/>
  <bridge name='virbr0' stp='on' delay='0'/>
  <ip address='192.168.122.1' netmask='255.255.255.0'>
    <dhcp>
      <range start='192.168.122.2' end='192.168.122.254'/>
    </dhcp>
  </ip>
</network>`;

// Ensure libvirt directories exist (needed for cloud-init)
const ensureLibvirtDirs = (): Effect.Effect<void, E2EError> =>
  Effect.gen(function* () {
    yield* exec(["sudo", "mkdir", "-p", "/var/lib/libvirt/boot"]).pipe(
      Effect.catchAll(() => Effect.void)
    );
  });

// Ensure libvirt default network exists and is running
export const ensureDefaultNetwork = (): Effect.Effect<void, E2EError> =>
  Effect.gen(function* () {
    // Ensure directories exist
    yield* ensureLibvirtDirs();

    // Check if default network exists
    const listResult = yield* virsh(["net-list", "--all"]).pipe(
      Effect.catchAll(() => Effect.succeed({ exitCode: 1, stdout: "", stderr: "" }))
    );

    const networkExists = listResult.stdout.includes("default");

    // Create network if it doesn't exist
    const needsCreate = !networkExists;
    yield* pipe(
      needsCreate,
      Match.value,
      Match.when(true, () =>
        Effect.gen(function* () {
          yield* Effect.logInfo("Creating libvirt default network...");
          const xmlPath = "/var/tmp/libvirt-default-network.xml";
          yield* exec(["sh", "-c", `cat > ${xmlPath} <<'EOF'\n${DEFAULT_NETWORK_XML}\nEOF`]);
          yield* virsh(["net-define", xmlPath]);
          yield* exec(["rm", "-f", xmlPath]);
        })
      ),
      Match.when(false, () => Effect.void),
      Match.exhaustive
    );

    // Check if network is active (handle variable spacing in output)
    const activeResult = yield* virsh(["net-info", "default"]).pipe(
      Effect.catchAll(() => Effect.succeed({ exitCode: 1, stdout: "", stderr: "" }))
    );

    // Match "Active:" followed by spaces and "yes"
    const isActive = NETWORK_ACTIVE_PATTERN.test(activeResult.stdout);

    // Start network if not active
    yield* pipe(
      isActive,
      Match.value,
      Match.when(false, () =>
        Effect.gen(function* () {
          yield* Effect.logInfo("Starting libvirt default network...");
          yield* virsh(["net-start", "default"]);
          // Wait a moment for network to be ready
          yield* Effect.sleep("1 second");
        })
      ),
      Match.when(true, () => Effect.void),
      Match.exhaustive
    );

    // Set autostart
    yield* virsh(["net-autostart", "default"]).pipe(Effect.catchAll(() => Effect.void));
  });

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
    // Ensure libvirt default network is available
    yield* ensureDefaultNetwork();

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
    yield* exec([
      "sudo",
      "qemu-img",
      "create",
      "-f",
      "qcow2",
      "-F",
      "qcow2",
      "-b",
      imagePath,
      vmDiskPath,
    ]);

    // Launch VM with virt-install
    yield* virtInstall([
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
      "network=default",
      "--osinfo",
      config.distro.osInfo,
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

// Try to get IP from guest agent
const getIPFromAgent = (vmName: string): Effect.Effect<IPAddress, E2EError> =>
  Effect.gen(function* () {
    const result = yield* virsh(["domifaddr", vmName, "--source", "agent"]);

    // Parse IP from output (format: "vnet0     52:54:00:xx:xx:xx    ipv4         192.168.122.100/24")
    const lines = result.stdout.split("\n");
    const ipLine = pipe(
      lines,
      Arr.findFirst((line) => line.includes("ipv4") && !line.includes("127.0.0.1"))
    );

    return yield* pipe(
      ipLine,
      Match.value,
      Match.tag("None", () => Effect.fail(new E2EError("No IP address found from agent"))),
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
  });

// Try to get IP from DHCP leases
const getIPFromDHCP = (vmName: string): Effect.Effect<IPAddress, E2EError> =>
  Effect.gen(function* () {
    // Get MAC address from VM
    const macResult = yield* virsh(["domiflist", vmName]);
    const macLine = pipe(
      macResult.stdout.split("\n"),
      Arr.findFirst((line) => line.includes("network") || line.includes("default"))
    );

    const mac = yield* pipe(
      macLine,
      Match.value,
      Match.tag("None", () => Effect.fail(new E2EError("No MAC address found"))),
      Match.tag("Some", ({ value }) => {
        const parts = value.trim().split(WHITESPACE_PATTERN);
        const macAddr = parts.at(-1);
        return macAddr
          ? Effect.succeed(macAddr)
          : Effect.fail(new E2EError("Failed to parse MAC address"));
      }),
      Match.exhaustive
    );

    // Get IP from DHCP leases
    const leaseResult = yield* virsh(["net-dhcp-leases", "default"]);
    const leaseLine = pipe(
      leaseResult.stdout.split("\n"),
      Arr.findFirst((line) => line.toLowerCase().includes(mac.toLowerCase()))
    );

    return yield* pipe(
      leaseLine,
      Match.value,
      Match.tag("None", () => Effect.fail(new E2EError("No DHCP lease found"))),
      Match.tag("Some", ({ value }) =>
        Effect.gen(function* () {
          const parts = value.trim().split(WHITESPACE_PATTERN);
          // Format: "Expiry Time          MAC address        Protocol  IP address                Hostname        Client ID or DUID"
          const ipWithMask = parts.find((p) => p.includes("192.168.") || p.includes("/"));
          const ipPart = ipWithMask?.split("/")[0];

          return yield* pipe(
            ipPart,
            Match.value,
            Match.when(undefined, () => Effect.fail(new E2EError("Failed to parse IP from DHCP"))),
            Match.when(null, () => Effect.fail(new E2EError("Failed to parse IP from DHCP"))),
            Match.orElse((ip) => Effect.succeed(ipAddress(ip)))
          );
        })
      ),
      Match.exhaustive
    );
  });

// Get VM IP address - try agent first, fallback to DHCP
const waitForIPAddress = (vmName: string): Effect.Effect<IPAddress, E2EError> =>
  pipe(
    // Try agent first, fallback to DHCP
    getIPFromAgent(vmName).pipe(Effect.catchAll(() => getIPFromDHCP(vmName))),
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
    yield* virsh(["destroy", vmName]).pipe(Effect.catchAll(() => Effect.void));

    // Undefine VM
    yield* virsh(["undefine", vmName]).pipe(Effect.catchAll(() => Effect.void));

    // Remove disk
    const diskPath = `/var/tmp/${vmName}.qcow2`;
    yield* exec(["rm", "-f", diskPath]).pipe(Effect.catchAll(() => Effect.void));

    // Remove cloud-init user-data
    const userDataPath = `/var/tmp/${vmName}-user-data.yaml`;
    yield* exec(["rm", "-f", userDataPath]).pipe(Effect.catchAll(() => Effect.void));
  });
