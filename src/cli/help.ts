/**
 * CLI help text generation.
 */

import { listServices } from "../services";
import { COMMANDS } from "./parser";

const VERSION = "0.1.0";

/**
 * Main help text.
 */
export const getMainHelp = (): string => {
  const services = listServices();
  const serviceList =
    services.length > 0
      ? services.map((s) => `  ${s.name.padEnd(12)} ${s.description}`).join("\n")
      : "  (no services registered)";

  return `
divban v${VERSION} - Unified Rootless Podman Service Manager

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
  restore <backup>     Restore from a backup

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
  const service = services.find((s) => s.name === serviceName);

  if (!service) {
    return `Unknown service: ${serviceName}\n\nAvailable services: ${services.map((s) => s.name).join(", ")}`;
  }

  const capabilities: string[] = [];
  if (service.capabilities.multiContainer) {
    capabilities.push("multi-container");
  }
  if (service.capabilities.hasReload) {
    capabilities.push("reload");
  }
  if (service.capabilities.hasBackup) {
    capabilities.push("backup");
  }
  if (service.capabilities.hasRestore) {
    capabilities.push("restore");
  }
  if (service.capabilities.hardwareAcceleration) {
    capabilities.push("hardware-acceleration");
  }

  const availableCommands = COMMANDS.filter((cmd) => {
    if (cmd === "reload" && !service.capabilities.hasReload) {
      return false;
    }
    if (cmd === "backup" && !service.capabilities.hasBackup) {
      return false;
    }
    if (cmd === "restore" && !service.capabilities.hasRestore) {
      return false;
    }
    return true;
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

    default:
      return `No help available for command: ${command}`;
  }
};

/**
 * Print version information.
 */
export const getVersion = (): string => {
  return `divban v${VERSION}`;
};
