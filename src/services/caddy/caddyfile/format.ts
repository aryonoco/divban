// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Caddyfile formatting utilities.
 */

/**
 * Escape a value for Caddyfile format.
 */
export const escapeValue = (value: string): string => {
  // If value contains spaces, quotes, or special chars, quote it
  if (
    value.includes(" ") ||
    value.includes('"') ||
    value.includes("{") ||
    value.includes("}") ||
    value.includes("#")
  ) {
    // Escape existing quotes
    const escaped = value.replace(/"/g, '\\"');
    return `"${escaped}"`;
  }
  return value;
};

/**
 * Create indentation string.
 */
export const indent = (level: number): string => {
  return "\t".repeat(level);
};

/**
 * Join arguments with proper escaping.
 */
export const joinArgs = (args: string[]): string => {
  return args.map(escapeValue).join(" ");
};

/**
 * Format a block opening.
 */
export const openBlock = (name: string, args?: string[]): string => {
  const argsStr = args && args.length > 0 ? ` ${joinArgs(args)}` : "";
  return `${name}${argsStr} {`;
};

/**
 * Format a simple line (name + args).
 */
export const formatLine = (name: string, args?: string[]): string => {
  if (!args || args.length === 0) {
    return name;
  }
  return `${name} ${joinArgs(args)}`;
};

/**
 * Builder for Caddyfile content.
 */
export class CaddyfileBuilder {
  private lines: string[] = [];
  private indentLevel = 0;

  /**
   * Add a line at current indentation.
   */
  line(content: string): this {
    this.lines.push(`${indent(this.indentLevel)}${content}`);
    return this;
  }

  /**
   * Add an empty line.
   */
  blank(): this {
    this.lines.push("");
    return this;
  }

  /**
   * Add a comment.
   */
  comment(text: string): this {
    this.lines.push(`${indent(this.indentLevel)}# ${text}`);
    return this;
  }

  /**
   * Open a block (increases indent).
   */
  open(name: string, args?: string[]): this {
    this.line(openBlock(name, args));
    this.indentLevel++;
    return this;
  }

  /**
   * Close a block (decreases indent).
   */
  close(): this {
    this.indentLevel = Math.max(0, this.indentLevel - 1);
    this.line("}");
    return this;
  }

  /**
   * Add a simple directive (name + args).
   */
  directive(name: string, args?: string[]): this {
    this.line(formatLine(name, args));
    return this;
  }

  /**
   * Add raw content (preserves formatting).
   */
  raw(content: string): this {
    for (const line of content.split("\n")) {
      this.lines.push(`${indent(this.indentLevel)}${line}`);
    }
    return this;
  }

  /**
   * Build the final content.
   */
  build(): string {
    return `${this.lines.join("\n")}\n`;
  }
}

/**
 * Create a new Caddyfile builder.
 */
export const createBuilder = (): CaddyfileBuilder => {
  return new CaddyfileBuilder();
};
