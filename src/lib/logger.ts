/**
 * Structured logging with ANSI colors for CLI output.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * ANSI color codes for terminal output.
 */
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",

  // Foreground colors
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
} as const;

/**
 * Check if output supports colors.
 */
const supportsColor = (): boolean => {
  // Check NO_COLOR environment variable (https://no-color.org/)
  if (process.env["NO_COLOR"] !== undefined) return false;

  // Check FORCE_COLOR
  if (process.env["FORCE_COLOR"] !== undefined) return true;

  // Check if stdout is a TTY
  return process.stdout.isTTY === true;
};

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
  child(service: string): Logger;
}

/**
 * Create a logger instance with the given options.
 */
export const createLogger = (options: LoggerOptions): Logger => {
  const minLevel = LOG_LEVELS[options.level];
  const useColor = options.color ?? supportsColor();
  const service = options.service;

  const colorize = (color: keyof typeof colors, text: string): string =>
    useColor ? `${colors[color]}${text}${colors.reset}` : text;

  const formatContext = (ctx?: Record<string, unknown>): string => {
    if (!ctx || Object.keys(ctx).length === 0) return "";
    return (
      " " +
      Object.entries(ctx)
        .map(([k, v]) => colorize("dim", `${k}=`) + JSON.stringify(v))
        .join(" ")
    );
  };

  const formatPrefix = (level: LogLevel): string => {
    const levelColors: Record<LogLevel, keyof typeof colors> = {
      debug: "gray",
      info: "blue",
      warn: "yellow",
      error: "red",
    };

    const levelStr = colorize(levelColors[level], level.toUpperCase().padEnd(5));
    const serviceStr = service ? colorize("cyan", `[${service}]`) + " " : "";
    return `${levelStr} ${serviceStr}`;
  };

  const formatJson = (level: LogLevel, message: string, context?: Record<string, unknown>): string =>
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      service,
      message,
      ...context,
    });

  const log = (level: LogLevel, message: string, context?: Record<string, unknown>): void => {
    if (LOG_LEVELS[level] < minLevel) return;

    const output =
      options.format === "json"
        ? formatJson(level, message, context)
        : `${formatPrefix(level)}${message}${formatContext(context)}`;

    const stream = level === "error" ? process.stderr : process.stdout;
    stream.write(output + "\n");
  };

  return {
    debug: (message, context) => log("debug", message, context),
    info: (message, context) => log("info", message, context),
    warn: (message, context) => log("warn", message, context),
    error: (message, context) => log("error", message, context),

    step: (current: number, total: number, message: string) => {
      const prefix = colorize("bold", `[${current}/${total}]`);
      const arrow = colorize("cyan", "→");
      process.stdout.write(`${prefix} ${arrow} ${message}\n`);
    },

    success: (message: string) => {
      const check = colorize("green", "✓");
      process.stdout.write(`${check} ${message}\n`);
    },

    fail: (message: string) => {
      const cross = colorize("red", "✗");
      process.stderr.write(`${cross} ${message}\n`);
    },

    child: (childService: string) =>
      createLogger({
        ...options,
        service: service ? `${service}:${childService}` : childService,
      }),
  };
};

/**
 * Default logger for quick access.
 */
let defaultLogger: Logger | null = null;

export const getLogger = (): Logger => {
  if (!defaultLogger) {
    defaultLogger = createLogger({ level: "info", format: "pretty" });
  }
  return defaultLogger;
};

export const setDefaultLogger = (logger: Logger): void => {
  defaultLogger = logger;
};
