// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Structured logging with ANSI colors for CLI output.
 * Uses Bun.color() for automatic terminal capability detection.
 */

import { Effect, FiberRef, Match, Option, pipe } from "effect";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

type ColorName = "red" | "green" | "yellow" | "blue" | "magenta" | "cyan" | "white" | "gray";

/**
 * Colorize text using Bun.color() with automatic terminal capability detection.
 * Bun.color() handles NO_COLOR, FORCE_COLOR environment variables automatically.
 */
const colorize = (color: ColorName, text: string): string => {
  const ansi = Bun.color(color, "ansi");
  return ansi ? `${ansi}${text}\x1b[0m` : text;
};

const bold = (text: string): string => {
  const supportsColor = Bun.color("white", "ansi") !== null;
  return supportsColor ? `\x1b[1m${text}\x1b[0m` : text;
};

export const stripColors = (text: string): string => Bun.stripANSI(text);

export interface LoggerOptions {
  level: LogLevel;
  format: "pretty" | "json";
  service?: string;
  color?: boolean;
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  step(current: number, total: number, message: string): void;
  success(message: string): void;
  fail(message: string): void;
  raw(text: string): void;
  child(service: string): Logger;
}

export const createLogger = (options: LoggerOptions): Logger => {
  const minLevel = LOG_LEVELS[options.level];
  const service = options.service;
  const useColor = options.color ?? Bun.color("white", "ansi") !== null;

  const applyColor = (color: ColorName, text: string): string =>
    useColor ? colorize(color, text) : text;

  const formatContext = (ctx?: Record<string, unknown>): string =>
    pipe(
      Option.fromNullable(ctx),
      Option.filter((c) => Object.keys(c).length > 0),
      Option.match({
        onNone: (): string => "",
        onSome: (c): string =>
          options.format === "json"
            ? ` ${JSON.stringify(c)}`
            : ` ${Bun.inspect(c, { colors: useColor, depth: 3 })}`,
      })
    );

  const formatPrefix = (level: LogLevel): string => {
    const levelColors: Record<LogLevel, ColorName> = {
      debug: "gray",
      info: "blue",
      warn: "yellow",
      error: "red",
    };

    const levelStr = applyColor(levelColors[level], level.toUpperCase().padEnd(5));
    const serviceStr = service ? `${applyColor("cyan", `[${service}]`)} ` : "";
    return `${levelStr} ${serviceStr}`;
  };

  const formatJson = (
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>
  ): string =>
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      service,
      message,
      ...context,
    });

  const writeLog = (level: LogLevel, message: string, context?: Record<string, unknown>): void => {
    const output =
      options.format === "json"
        ? formatJson(level, message, context)
        : `${formatPrefix(level)}${message}${formatContext(context)}`;

    const stream = level === "error" ? process.stderr : process.stdout;
    stream.write(`${output}\n`);
  };

  const log = (level: LogLevel, message: string, context?: Record<string, unknown>): void =>
    pipe(
      LOG_LEVELS[level] >= minLevel,
      Match.value,
      Match.when(true, () => writeLog(level, message, context)),
      Match.orElse(() => undefined)
    );

  return {
    debug: (message: string, context?: Record<string, unknown>): void => {
      log("debug", message, context);
    },
    info: (message: string, context?: Record<string, unknown>): void => {
      log("info", message, context);
    },
    warn: (message: string, context?: Record<string, unknown>): void => {
      log("warn", message, context);
    },
    error: (message: string, context?: Record<string, unknown>): void => {
      log("error", message, context);
    },

    step: (current: number, total: number, message: string): void => {
      const prefix = useColor ? bold(`[${current}/${total}]`) : `[${current}/${total}]`;
      const arrow = applyColor("cyan", "→");
      process.stdout.write(`${prefix} ${arrow} ${message}\n`);
    },

    success: (message: string): void => {
      const check = applyColor("green", "✓");
      process.stdout.write(`${check} ${message}\n`);
    },

    fail: (message: string): void => {
      const cross = applyColor("red", "✗");
      process.stderr.write(`${cross} ${message}\n`);
    },

    raw: (text: string): void => {
      process.stdout.write(`${text}\n`);
    },

    child: (childService: string): Logger =>
      createLogger({
        ...options,
        service: service ? `${service}:${childService}` : childService,
      }),
  };
};

/** Prefer LoggerFiberRef for Effect pipelines. */
export const getLogger = (): Logger => createLogger({ level: "info", format: "pretty" });

/**
 * @deprecated Use LoggerFiberRef.locally or withLogger instead for Effect pipelines.
 * This function is a no-op kept for backward compatibility.
 */
export const setDefaultLogger = (_logger: Logger): void => {
  // No-op: prefer using LoggerFiberRef for Effect-based logger management
};

export const LoggerFiberRef: FiberRef.FiberRef<Logger> = FiberRef.unsafeMake(
  createLogger({ level: "info", format: "pretty" })
);

export const getLoggerEffect: Effect.Effect<Logger> = FiberRef.get(LoggerFiberRef);

export const withLogger = <A, E, R>(
  logger: Logger
): ((effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>) =>
  Effect.locally(LoggerFiberRef, logger);
