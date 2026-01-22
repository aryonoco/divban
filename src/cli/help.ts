// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * CLI help text generation.
 */

import { Option } from "effect";
import { listServices } from "../services";
import { COMMANDS, type Command } from "./parser";

/**
 * Main help text.
 */
export const getMainHelp = (version: string): string => {
  const services = listServices();
  const serviceList =
    services.length > 0
      ? services.map((s) => `  ${s.name.padEnd(12)} ${s.description}`).join("\n")
      : "  (no services registered)";

  return `
divban v${version} - Unified Rootless Podman Service Manager

USAGE:
  divban <service> <command> [options]
  divban all <command> [options]

SERVICES:
${serviceList}

COMMANDS:
  validate <config>    Validate a configuration file
  generate <config>    Generate quadlet files without installing
  diff <config>        Show differences between generated and installed files
  setup <config>       Full service setup (generate, install, enable)
  start                Start the service
  stop                 Stop the service
  restart              Restart the service
  reload               Reload configuration (if supported)
  status               Show service status
  logs                 View service logs
  update               Update container images
  backup               Create a backup
  backup-config [path] Create backup of configuration files and secrets
  restore <backup>     Restore from a backup
  remove               Completely remove service (requires --force)

GLOBAL OPTIONS:
  -h, --help           Show help
  -V, --version        Show version
  -v, --verbose        Verbose output (debug logging)
  --dry-run            Show what would be done without doing it
  -f, --force          Force operation (skip confirmations)
  --log-level LEVEL    Set log level (debug, info, warn, error)
  --format FORMAT      Output format (pretty, json)
  --json               Shorthand for --format json

LOG OPTIONS:
  --follow             Follow log output (tail -f style)
  -n, --lines NUM      Number of log lines to show (default: 100)
  -c, --container NAME Container to show logs for (multi-container services)

GENERATE OPTIONS:
  -o, --output DIR     Output directory for generated files

EXAMPLES:
  divban caddy validate divban-caddy.toml
  divban caddy setup divban-caddy.toml
  divban caddy start
  divban caddy logs --follow
  divban immich status
  divban immich backup
  divban immich restore /path/to/backup.sql.gz
  divban all status
  divban all stop

For service-specific help:
  divban <service> help
`.trim();
};

/**
 * Get help for a specific service.
 */
export const getServiceHelp = (serviceName: string): string => {
  const services = listServices();
  const serviceOpt = Option.fromNullable(services.find((s) => s.name === serviceName));

  if (Option.isNone(serviceOpt)) {
    return `Unknown service: ${serviceName}\n\nAvailable services: ${services.map((s) => s.name).join(", ")}`;
  }
  const service = serviceOpt.value;

  // Capabilities as data-driven derivation
  const CAPABILITY_MAP = [
    ["multiContainer", "multi-container"],
    ["hasReload", "reload"],
    ["hasBackup", "backup"],
    ["hasRestore", "restore"],
    ["hardwareAcceleration", "hardware-acceleration"],
  ] as const satisfies readonly (readonly [keyof typeof service.capabilities, string])[];

  const capabilities = CAPABILITY_MAP.filter(([key]) => service.capabilities[key]).map(
    ([, label]) => label
  );

  // Command availability as data-driven predicate
  const COMMAND_CAPABILITY_REQUIREMENTS: Partial<
    Record<Command, keyof typeof service.capabilities>
  > = {
    reload: "hasReload",
    backup: "hasBackup",
    restore: "hasRestore",
  };

  const availableCommands = COMMANDS.filter((cmd) => {
    const required = COMMAND_CAPABILITY_REQUIREMENTS[cmd];
    return required === undefined || service.capabilities[required] === true;
  });

  return `
${service.name} - ${service.description}

VERSION: ${service.version}

CAPABILITIES:
  ${capabilities.join(", ") || "none"}

AVAILABLE COMMANDS:
  ${availableCommands.join(", ")}

USAGE:
  divban ${service.name} <command> [options]

EXAMPLES:
  divban ${service.name} validate divban-${service.name}.toml
  divban ${service.name} setup divban-${service.name}.toml
  divban ${service.name} start
  divban ${service.name} status
  divban ${service.name} logs --follow
`.trim();
};

/**
 * Get help for a specific command.
 */
export const getCommandHelp = (command: string): string => {
  switch (command) {
    case "validate":
      return `
validate - Validate a configuration file

USAGE:
  divban <service> validate <config-path>

DESCRIPTION:
  Parses and validates the TOML configuration file against the service's
  schema. Reports any validation errors without making changes.

EXAMPLES:
  divban caddy validate divban-caddy.toml
  divban immich validate /etc/divban/immich.toml
`.trim();

    case "generate":
      return `
generate - Generate quadlet files

USAGE:
  divban <service> generate <config-path> [-o <output-dir>]

DESCRIPTION:
  Generates all quadlet files (.container, .network, .volume) and
  configuration files (Caddyfile, environment files) without installing them.

OPTIONS:
  -o, --output DIR    Output directory (default: current directory)

EXAMPLES:
  divban caddy generate divban-caddy.toml
  divban caddy generate divban-caddy.toml -o ./output
`.trim();

    case "setup":
      return `
setup - Full service setup

USAGE:
  divban <service> setup <config-path>

DESCRIPTION:
  Complete service setup including:
  1. Validate configuration
  2. Create service user (if needed)
  3. Create data directories
  4. Generate and install quadlet files
  5. Reload systemd daemon
  6. Enable services

OPTIONS:
  --dry-run    Show what would be done without making changes

EXAMPLES:
  divban caddy setup divban-caddy.toml
  divban immich setup divban-immich.toml --dry-run
`.trim();

    case "backup":
      return `
backup - Create a backup

USAGE:
  divban <service> backup

DESCRIPTION:
  Creates a backup of the service's data. The backup format depends on
  the service:
  - Database services: SQL dump (compressed)
  - File-based services: tar archive

The backup is stored in the service's data directory under 'backups/'.

EXAMPLES:
  divban immich backup
  divban actual backup
`.trim();

    case "restore":
      return `
restore - Restore from a backup

USAGE:
  divban <service> restore <backup-path>

DESCRIPTION:
  Restores service data from a backup file. The service should typically
  be stopped before restoring.

OPTIONS:
  -f, --force    Skip confirmation prompt

EXAMPLES:
  divban immich restore /srv/divban-immich/backups/immich-db-backup-2024-01-15.sql.gz
  divban actual restore /srv/divban-actual/backups/actual-backup-2024-01-15.tar.gz
`.trim();

    case "backup-config":
      return `
backup-config - Create backup of configuration files and secrets

USAGE:
  divban <service> backup-config [output-path]

DESCRIPTION:
  Creates a compressed archive of configuration files including:
  - Service TOML configuration
  - Age encryption keys (for secret decryption)
  - Encrypted secrets backup

  This backup contains everything needed to restore a service's
  configuration on a new system.

  WARNING: The generated backup contains encryption keys and secrets.
  Treat this file like a password - store it securely and do not share it.

OPTIONS:
  --dry-run    Show what would be backed up without creating archive
  --format     Output format: pretty (default) or json

DEFAULT OUTPUT:
  ~/.config/divban/backups/config-backup-<service>-<timestamp>.tar.gz

EXAMPLES:
  divban immich backup-config
  divban immich backup-config /backup/immich-config.tar.gz
  divban all backup-config
  divban all backup-config --dry-run
`.trim();

    case "remove":
      return `
remove - Completely remove a service

USAGE:
  divban <service> remove [--force] [--preserve-data] [--dry-run]

DESCRIPTION:
  Completely removes a service including:
  1. Stop all containers
  2. Remove all podman containers, volumes, networks
  3. Disable systemd linger
  4. Delete service user and home directory
  5. Remove data directory (unless --preserve-data)

OPTIONS:
  -f, --force          Required to confirm removal
  --preserve-data      Keep the data directory
  --dry-run            Show what would be done

EXAMPLES:
  divban actual remove --force
  divban immich remove --force --preserve-data
  divban caddy remove --dry-run
`.trim();

    default:
      return `No help available for command: ${command}`;
  }
};

/**
 * Print version information.
 */
export const getVersion = (version: string): string => `divban v${version}`;
