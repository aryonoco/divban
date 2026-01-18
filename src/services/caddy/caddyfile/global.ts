/**
 * Global options block generation for Caddyfile.
 */

import type { GlobalOptions } from "../schema";
import { type CaddyfileBuilder, createBuilder } from "./format";

/**
 * Generate the global options block.
 */
export const generateGlobalOptions = (options: GlobalOptions): string => {
  const builder = createBuilder();

  builder.open("");

  // Debug mode
  if (options.debug) {
    builder.directive("debug");
  }

  // Email for ACME
  if (options.email) {
    builder.directive("email", [options.email]);
  }

  // ACME CA
  if (options.acmeCA) {
    builder.directive("acme_ca", [options.acmeCA]);
  }

  // ACME CA root
  if (options.acmeCaRoot) {
    builder.directive("acme_ca_root", [options.acmeCaRoot]);
  }

  // Local certs (self-signed)
  if (options.localCerts) {
    builder.directive("local_certs");
  }

  // Skip install trust
  if (options.skipInstallTrust) {
    builder.directive("skip_install_trust");
  }

  // Admin endpoint
  if (options.adminOff) {
    builder.directive("admin", ["off"]);
  } else if (options.adminEnforceOrigin) {
    builder.open("admin");
    builder.directive("enforce_origin");
    builder.close();
  }

  // HTTP/HTTPS ports
  if (options.httpPort) {
    builder.directive("http_port", [String(options.httpPort)]);
  }
  if (options.httpsPort) {
    builder.directive("https_port", [String(options.httpsPort)]);
  }

  // Auto HTTPS
  if (options.autoHttps) {
    builder.directive("auto_https", [options.autoHttps]);
  }

  // Server configuration
  if (options.servers) {
    builder.open("servers");
    for (const [name, config] of Object.entries(options.servers)) {
      if (name === "*" || name === "default") {
        // Global server options
        if (config.protocols) {
          builder.directive("protocols", config.protocols);
        }
        if (config.strictSniHost) {
          builder.directive("strict_sni_host");
        }
      } else {
        // Named server
        builder.open(name);
        if (config.listen) {
          builder.directive("listen", config.listen);
        }
        if (config.protocols) {
          builder.directive("protocols", config.protocols);
        }
        if (config.strictSniHost) {
          builder.directive("strict_sni_host");
        }
        builder.close();
      }
    }
    builder.close();
  }

  // Logging
  if (options.logFormat || options.logLevel) {
    builder.open("log");
    if (options.logFormat) {
      builder.directive("format", [options.logFormat]);
    }
    if (options.logLevel) {
      builder.directive("level", [options.logLevel]);
    }
    builder.close();
  }

  builder.close();

  return builder.build();
};

/**
 * Check if global options block is needed.
 */
export const hasGlobalOptions = (options: GlobalOptions | undefined): boolean => {
  if (!options) return false;

  return (
    options.debug !== undefined ||
    options.email !== undefined ||
    options.acmeCA !== undefined ||
    options.acmeCaRoot !== undefined ||
    options.localCerts !== undefined ||
    options.skipInstallTrust !== undefined ||
    options.adminOff !== undefined ||
    options.adminEnforceOrigin !== undefined ||
    options.httpPort !== undefined ||
    options.httpsPort !== undefined ||
    options.autoHttps !== undefined ||
    options.servers !== undefined ||
    options.logFormat !== undefined ||
    options.logLevel !== undefined
  );
};
