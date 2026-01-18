/**
 * Directive rendering for Caddyfile.
 * Handles recursive directive blocks.
 */

import type { Directive } from "../schema";
import { escapeValue, indent } from "./format";

/**
 * Render a single directive.
 */
export const renderDirective = (directive: Directive, level = 0): string => {
  const prefix = indent(level);
  const args = directive.args?.map(escapeValue).join(" ") ?? "";
  const argsStr = args ? ` ${args}` : "";

  // Simple directive (no block)
  if (!directive.block || directive.block.length === 0) {
    return `${prefix}${directive.name}${argsStr}`;
  }

  // Directive with block
  const lines: string[] = [];
  lines.push(`${prefix}${directive.name}${argsStr} {`);

  for (const child of directive.block) {
    lines.push(renderDirective(child, level + 1));
  }

  lines.push(`${prefix}}`);

  return lines.join("\n");
};

/**
 * Render multiple directives.
 */
export const renderDirectives = (directives: Directive[], level = 0): string => {
  return directives.map((d) => renderDirective(d, level)).join("\n");
};

/**
 * Common directive builders.
 */
export const Directives = {
  /**
   * reverse_proxy directive
   */
  reverseProxy: (
    upstreams: string[],
    options?: { healthCheck?: boolean; lb?: string }
  ): Directive => {
    const block: Directive[] = [];

    if (options?.healthCheck) {
      block.push({ name: "health_uri", args: ["/health"] });
      block.push({ name: "health_interval", args: ["30s"] });
    }

    if (options?.lb) {
      block.push({ name: "lb_policy", args: [options.lb] });
    }

    const result: Directive = {
      name: "reverse_proxy",
      args: upstreams,
    };
    if (block.length > 0) {
      result.block = block;
    }
    return result;
  },

  /**
   * file_server directive
   */
  fileServer: (options?: { root?: string; browse?: boolean }): Directive => {
    const block: Directive[] = [];

    if (options?.root) {
      block.push({ name: "root", args: [options.root] });
    }

    if (options?.browse) {
      block.push({ name: "browse" });
    }

    const result: Directive = { name: "file_server" };
    if (block.length > 0) {
      result.block = block;
    }
    return result;
  },

  /**
   * encode directive
   */
  encode: (algorithms: string[] = ["gzip", "zstd"]): Directive => ({
    name: "encode",
    args: algorithms,
  }),

  /**
   * header directive
   */
  header: (headers: Record<string, string>): Directive => ({
    name: "header",
    block: Object.entries(headers).map(([name, value]) => ({
      name,
      args: [value],
    })),
  }),

  /**
   * respond directive
   */
  respond: (body: string, status?: number): Directive => ({
    name: "respond",
    args: status ? [body, String(status)] : [body],
  }),

  /**
   * redir directive
   */
  redir: (target: string, code?: number): Directive => ({
    name: "redir",
    args: code ? [target, String(code)] : [target],
  }),

  /**
   * rewrite directive
   */
  rewrite: (pattern: string, replacement: string): Directive => ({
    name: "rewrite",
    args: [pattern, replacement],
  }),

  /**
   * log directive
   */
  log: (options?: { output?: string; format?: string; level?: string }): Directive => {
    const block: Directive[] = [];

    if (options?.output) {
      block.push({ name: "output", args: [options.output] });
    }
    if (options?.format) {
      block.push({ name: "format", args: [options.format] });
    }
    if (options?.level) {
      block.push({ name: "level", args: [options.level] });
    }

    const result: Directive = { name: "log" };
    if (block.length > 0) {
      result.block = block;
    }
    return result;
  },

  /**
   * tls directive
   */
  tls: (options?: {
    email?: string;
    cert?: string;
    key?: string;
    internal?: boolean;
  }): Directive => {
    if (options?.internal) {
      return { name: "tls", args: ["internal"] };
    }

    if (options?.cert && options?.key) {
      return { name: "tls", args: [options.cert, options.key] };
    }

    if (options?.email) {
      return { name: "tls", args: [options.email] };
    }

    return { name: "tls" };
  },

  /**
   * basicauth directive
   */
  basicauth: (users: Array<{ username: string; passwordHash: string }>): Directive => ({
    name: "basicauth",
    block: users.map((u) => ({
      name: u.username,
      args: [u.passwordHash],
    })),
  }),

  /**
   * import directive (for snippets)
   */
  import: (name: string, args?: string[]): Directive => ({
    name: "import",
    args: args ? [name, ...args] : [name],
  }),

  /**
   * handle directive
   */
  handle: (matcher: string | undefined, directives: Directive[]): Directive => {
    const result: Directive = { name: "handle", block: directives };
    if (matcher) {
      result.args = [matcher];
    }
    return result;
  },

  /**
   * handle_path directive (strips matched path prefix)
   */
  handlePath: (path: string, directives: Directive[]): Directive => ({
    name: "handle_path",
    args: [path],
    block: directives,
  }),

  /**
   * route directive (maintains order)
   */
  route: (matcher: string | undefined, directives: Directive[]): Directive => {
    const result: Directive = { name: "route", block: directives };
    if (matcher) {
      result.args = [matcher];
    }
    return result;
  },
};
