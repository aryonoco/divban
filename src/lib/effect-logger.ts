// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Custom logger because Effect's default lacks step progress indicators and
 * styled messages (success checkmarks, failure X marks) that CLI UX requires.
 */

import { Cause, HashMap, Layer, LogLevel, Logger, Match, Option, pipe } from "effect";
import type { LogLevel as DivbanLogLevel, LogFormat } from "../config/field-values";
type LogStyleTag = "step" | "success" | "fail";
type ColorName = "red" | "green" | "yellow" | "blue" | "cyan" | "gray" | "white";

/** Formatting-only annotations filtered from JSON to keep logs clean for aggregation. */
const INTERNAL_KEYS: ReadonlySet<string> = new Set([
  "logStyle",
  "stepNumber",
  "stepTotal",
  "service",
]);

const toEffectLogLevel = (level: DivbanLogLevel): LogLevel.LogLevel =>
  pipe(
    Match.value(level),
    Match.when("debug", () => LogLevel.Debug),
    Match.when("info", () => LogLevel.Info),
    Match.when("warn", () => LogLevel.Warning),
    Match.when("error", () => LogLevel.Error),
    Match.exhaustive
  );

/** Extracts typed string annotation, returning None if absent or wrong type. */
const getStringAnnotation = (
  annotations: HashMap.HashMap<string, unknown>,
  key: string
): Option.Option<string> =>
  pipe(
    HashMap.get(annotations, key),
    Option.filter((v): v is string => typeof v === "string")
  );

/** Reconstructs LogStyle ADT from annotation strings for dispatch. */
const getStyle = (annotations: HashMap.HashMap<string, unknown>): Option.Option<LogStyleTag> =>
  pipe(
    getStringAnnotation(annotations, "logStyle"),
    Option.filter((v): v is LogStyleTag => v === "step" || v === "success" || v === "fail")
  );

/** Applies ANSI color via Bun.color(), falling back to plain text if unsupported. */
const colorize = (color: ColorName, text: string, useColor: boolean): string =>
  pipe(
    Match.value(useColor),
    Match.when(false, () => text),
    Match.when(true, () =>
      pipe(
        Option.fromNullable(Bun.color(color, "ansi")),
        Option.match({
          onNone: (): string => text,
          onSome: (ansi): string => `${ansi}${text}\x1b[0m`,
        })
      )
    ),
    Match.exhaustive
  );

const bold = (text: string, useColor: boolean): string =>
  pipe(
    Match.value(useColor),
    Match.when(true, () => `\x1b[1m${text}\x1b[0m`),
    Match.when(false, () => text),
    Match.exhaustive
  );

const LEVEL_COLORS: Readonly<Record<string, ColorName>> = {
  DEBUG: "gray",
  INFO: "blue",
  WARN: "yellow",
  ERROR: "red",
};

const formatStepMessage = (
  message: string,
  annotations: HashMap.HashMap<string, unknown>,
  useColor: boolean
): string => {
  const step = pipe(
    getStringAnnotation(annotations, "stepNumber"),
    Option.getOrElse(() => "?")
  );
  const total = pipe(
    getStringAnnotation(annotations, "stepTotal"),
    Option.getOrElse(() => "?")
  );
  const prefix = bold(`[${step}/${total}]`, useColor);
  const arrow = colorize("cyan", "→", useColor);
  return `${prefix} ${arrow} ${message}`;
};

const formatStyledMessage = (
  style: LogStyleTag,
  message: string,
  annotations: HashMap.HashMap<string, unknown>,
  useColor: boolean
): string =>
  pipe(
    Match.value(style),
    Match.when("step", () => formatStepMessage(message, annotations, useColor)),
    Match.when("success", () => `${colorize("green", "✓", useColor)} ${message}`),
    Match.when("fail", () => `${colorize("red", "✗", useColor)} ${message}`),
    Match.exhaustive
  );

/** Formats error cause chain, returning empty string for non-errors to avoid noise. */
const formatCause = (cause: Cause.Cause<unknown>): string =>
  pipe(
    Match.value(Cause.isEmpty(cause)),
    Match.when(true, () => ""),
    Match.when(false, () => `\n${Cause.pretty(cause)}`),
    Match.exhaustive
  );

const formatPretty = (
  logLevel: LogLevel.LogLevel,
  message: string,
  annotations: HashMap.HashMap<string, unknown>,
  cause: Cause.Cause<unknown>,
  useColor: boolean
): string =>
  pipe(
    getStyle(annotations),
    Option.match({
      onNone: (): string => {
        const levelColor = pipe(
          Option.fromNullable(LEVEL_COLORS[logLevel.label]),
          Option.getOrElse((): ColorName => "white")
        );
        const levelStr = colorize(levelColor, logLevel.label.padEnd(5), useColor);
        const serviceStr = pipe(
          getStringAnnotation(annotations, "service"),
          Option.match({
            onNone: (): string => "",
            onSome: (s): string => `${colorize("cyan", `[${s}]`, useColor)} `,
          })
        );
        return `${levelStr} ${serviceStr}${message}${formatCause(cause)}`;
      },
      onSome: (style): string => formatStyledMessage(style, message, annotations, useColor),
    })
  );

const collectExternalAnnotations = (
  annotations: HashMap.HashMap<string, unknown>
): Record<string, unknown> =>
  Object.fromEntries(
    Array.from(HashMap.toEntries(annotations)).filter(([k]) => !INTERNAL_KEYS.has(k))
  );

const formatJson = (
  logLevel: LogLevel.LogLevel,
  message: string,
  annotations: HashMap.HashMap<string, unknown>,
  date: Date
): string => {
  const service = getStringAnnotation(annotations, "service");
  return JSON.stringify({
    timestamp: date.toISOString(),
    level: logLevel.label.toLowerCase(),
    ...pipe(
      service,
      Option.match({
        onNone: (): Record<string, never> => ({}),
        onSome: (s): { readonly service: string } => ({ service: s }),
      })
    ),
    message,
    ...collectExternalAnnotations(annotations),
  });
};

const isStderrOutput = (logLevel: LogLevel.LogLevel, style: Option.Option<LogStyleTag>): boolean =>
  logLevel.label === "ERROR" ||
  pipe(
    style,
    Option.map((s) => s === "fail"),
    Option.getOrElse(() => false)
  );

/** Logger factory dispatching to pretty or JSON format. Routes errors/failures to stderr, others to stdout. */
const DivbanLogger = (format: LogFormat, useColor: boolean): Logger.Logger<unknown, void> =>
  Logger.make(({ logLevel, message, cause, annotations, date }) => {
    const msg = String(message);
    const style = getStyle(annotations);

    const output = pipe(
      Match.value(format),
      Match.when("json", () => formatJson(logLevel, msg, annotations, date)),
      Match.when("pretty", () => formatPretty(logLevel, msg, annotations, cause, useColor)),
      Match.exhaustive
    );

    const stream = pipe(
      Match.value(isStderrOutput(logLevel, style)),
      Match.when(true, () => process.stderr),
      Match.when(false, () => process.stdout),
      Match.exhaustive
    );
    stream.write(`${output}\n`);
  });

export const DivbanLoggerLive = (options: {
  readonly level: DivbanLogLevel;
  readonly format: LogFormat;
  readonly color?: boolean;
}): Layer.Layer<never> => {
  const useColor = options.color ?? Bun.color("white", "ansi") !== null;
  return Layer.merge(
    Logger.replace(Logger.defaultLogger, DivbanLogger(options.format, useColor)),
    Logger.minimumLogLevel(toEffectLogLevel(options.level))
  );
};
