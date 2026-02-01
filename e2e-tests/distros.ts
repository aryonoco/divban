// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { type DistroConfig, type PackageManager, distroName, imageURL } from "./types.ts";

const DNF: PackageManager = "dnf";
const APT: PackageManager = "apt";
const ZYPPER: PackageManager = "zypper";
const PACMAN: PackageManager = "pacman";

export const FEDORA_43: DistroConfig = {
  name: distroName("fedora-43"),
  imageURL: imageURL(
    "https://download.fedoraproject.org/pub/fedora/linux/releases/43/Cloud/x86_64/images/Fedora-Cloud-Base-Generic-43-1.1.x86_64.qcow2"
  ),
  packageManager: DNF,
  packages: ["podman", "systemd", "sudo", "openssh-server"] as const,
  initCommands: [] as const,
} as const;

export const ALMA_10_1: DistroConfig = {
  name: distroName("alma-10.1"),
  imageURL: imageURL(
    "https://repo.almalinux.org/almalinux/10.1/cloud/x86_64/images/AlmaLinux-10-GenericCloud-latest.x86_64.qcow2"
  ),
  packageManager: DNF,
  packages: ["podman", "systemd", "sudo", "openssh-server"] as const,
  initCommands: [] as const,
} as const;

export const DEBIAN_13: DistroConfig = {
  name: distroName("debian-13"),
  imageURL: imageURL(
    "https://cloud.debian.org/images/cloud/trixie/daily/latest/debian-13-generic-amd64-daily.qcow2"
  ),
  packageManager: APT,
  packages: ["podman", "systemd", "sudo", "openssh-server"] as const,
  initCommands: ["apt-get update"] as const,
} as const;

export const OPENSUSE_TUMBLEWEED: DistroConfig = {
  name: distroName("opensuse-tumbleweed"),
  imageURL: imageURL(
    "https://download.opensuse.org/tumbleweed/appliances/openSUSE-Tumbleweed-JeOS.x86_64-OpenStack-Cloud.qcow2"
  ),
  packageManager: ZYPPER,
  packages: ["podman", "systemd", "sudo", "openssh"] as const,
  initCommands: [] as const,
} as const;

export const ARCH_LINUX: DistroConfig = {
  name: distroName("arch-linux"),
  imageURL: imageURL(
    "https://geo.mirror.pkgbuild.com/images/latest/Arch-Linux-x86_64-cloudimg.qcow2"
  ),
  packageManager: PACMAN,
  packages: ["podman", "systemd", "sudo", "openssh"] as const,
  initCommands: ["pacman -Sy"] as const,
} as const;

export const ALL_DISTROS: readonly DistroConfig[] = [
  FEDORA_43,
  ALMA_10_1,
  DEBIAN_13,
  OPENSUSE_TUMBLEWEED,
  ARCH_LINUX,
] as const;
