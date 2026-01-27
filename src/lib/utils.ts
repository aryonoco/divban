// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { peek } from "bun";
import { pipe } from "effect";
import { filterCharsToString, mapCharsToString } from "./str";

/** UUIDv7: time-sortable, suitable for database primary keys and log correlation. */
export const generateId = (): string => Bun.randomUUIDv7();
export const generateIdBuffer = (): Buffer => Bun.randomUUIDv7("buffer");
export const generateIdBase64 = (): string => Bun.randomUUIDv7("base64url");
export const generateUUID = (): string => Bun.randomUUIDv7();

export const sleep = (ms: number): Promise<void> => Bun.sleep(ms);
/** Blocks the event loop — only for CLI initialization or tests. */
export const sleepSync = (ms: number): void => Bun.sleepSync(ms);

export interface StringWidthOptions {
  readonly countAnsiEscapeCodes?: boolean;
  readonly ambiguousIsNarrow?: boolean;
}

/** Display width in terminal columns, accounting for Unicode and ANSI escapes. */
export const stringWidth = (text: string, options: StringWidthOptions = {}): number => {
  return Bun.stringWidth(text, options);
};

/** Right-pad to display width, accounting for wide characters. */
export const padEnd = (text: string, width: number): string => {
  const currentWidth = Bun.stringWidth(text);
  const padding = Math.max(0, width - currentWidth);
  return text + " ".repeat(padding);
};

export const padStart = (text: string, width: number): string => {
  const currentWidth = Bun.stringWidth(text);
  const padding = Math.max(0, width - currentWidth);
  return " ".repeat(padding) + text;
};

export const center = (text: string, width: number): string => {
  const currentWidth = Bun.stringWidth(text);
  const totalPadding = Math.max(0, width - currentWidth);
  const leftPadding = Math.floor(totalPadding / 2);
  const rightPadding = totalPadding - leftPadding;
  return " ".repeat(leftPadding) + text + " ".repeat(rightPadding);
};

/** Mutable to avoid O(n^2) spread in reduce. */
interface TruncateState {
  width: number;
  chars: string[];
  done: boolean;
}

const processChar = (state: TruncateState, char: string, targetWidth: number): TruncateState => {
  const charWidth = Bun.stringWidth(char);
  const wouldExceed = state.width + charWidth > targetWidth;
  state.done = state.done || wouldExceed;
  state.width = state.done ? state.width : state.width + charWidth;
  state.done ? undefined : state.chars.push(char);
  return state;
};

const buildTruncated = (chars: readonly string[], targetWidth: number, ellipsis: string): string =>
  chars
    .reduce((state, char) => processChar(state, char, targetWidth), {
      width: 0,
      chars: [],
      done: false,
    } as TruncateState)
    .chars.join("") + ellipsis;

export const truncate = (text: string, maxWidth: number, ellipsis = "..."): string =>
  pipe(Bun.stringWidth(text), (textWidth) =>
    textWidth <= maxWidth
      ? text
      : pipe(maxWidth - Bun.stringWidth(ellipsis), (targetWidth) =>
          targetWidth <= 0
            ? ellipsis.slice(0, maxWidth)
            : buildTruncated(Array.from(text), targetWidth, ellipsis)
        )
  );

/** Synchronously inspect a promise's value if already settled. */
export const peekPromise = <T>(promise: Promise<T>): T | Promise<T> => {
  return peek(promise);
};

/** Synchronously inspect a promise's status without awaiting. */
export const promiseStatus = (promise: Promise<unknown>): "pending" | "fulfilled" | "rejected" => {
  return peek.status(promise);
};

export const isPending = (promise: Promise<unknown>): boolean => peek.status(promise) === "pending";

export const isFulfilled = (promise: Promise<unknown>): boolean =>
  peek.status(promise) === "fulfilled";

export const isRejected = (promise: Promise<unknown>): boolean =>
  peek.status(promise) === "rejected";

export const escapeHTML = (text: string): string => {
  return Bun.escapeHTML(text);
};

export const fileURLToPath = (url: URL | string): string => {
  return Bun.fileURLToPath(url);
};

export const pathToFileURL = (path: string): URL => {
  return Bun.pathToFileURL(path);
};

export const bunVersion = (): string => Bun.version;
export const bunRevision = (): string => Bun.revision;
export const isMain = (): boolean => import.meta.main;
export const mainPath = (): string => Bun.main;

export const resolveModule = (specifier: string, from: string): string => {
  return Bun.resolveSync(specifier, from);
};

export const streamToText = (stream: ReadableStream<Uint8Array>): Promise<string> =>
  Bun.readableStreamToText(stream);

export const streamToBytes = async (stream: ReadableStream<Uint8Array>): Promise<Uint8Array> =>
  await Bun.readableStreamToBytes(stream);

export const streamToJSON = <T>(stream: ReadableStream<Uint8Array>): Promise<T> =>
  Bun.readableStreamToJSON(stream) as Promise<T>;

export const streamToArray = async <T>(stream: ReadableStream<T>): Promise<T[]> =>
  await Bun.readableStreamToArray(stream);

export const streamToBlob = (stream: ReadableStream<Uint8Array>): Promise<Blob> =>
  Bun.readableStreamToBlob(stream);

export const base64Encode = (data: string): string => btoa(data);
export const base64Decode = (encoded: string): string => atob(encoded);
export const base64EncodeBytes = (data: Uint8Array): string => Buffer.from(data).toString("base64");
export const base64DecodeBytes = (encoded: string): Uint8Array => Buffer.from(encoded, "base64");

const stripPadding = filterCharsToString((c) => c !== "=");
const URL_SAFE_MAP: Readonly<Record<string, string>> = { "+": "-", "/": "_" };
const toUrlSafe = mapCharsToString((c) => URL_SAFE_MAP[c] ?? c);

/** Strip `=` padding, then replace `+/` with `-_` for URL safety. */
export const base64UrlEncode = (data: string): string => pipe(btoa(data), stripPadding, toUrlSafe);

export const getAnsiColor = (
  color: string,
  format: "ansi" | "ansi-16m" | "ansi-256" | "ansi-16" = "ansi"
): string => Bun.color(color, format) ?? "";

export const supportsColor = (): boolean => Bun.color("white", "ansi") !== null;

export const colorize = (text: string, color: string): string => {
  const ansi = Bun.color(color, "ansi");
  return ansi ? `${ansi}${text}\x1b[0m` : text;
};

export interface BufferBuilderOptions {
  readonly initialCapacity?: number;
  readonly stream?: boolean;
}

/** Incremental binary data builder backed by `ArrayBufferSink`. */
export const createBufferBuilder = (
  options: BufferBuilderOptions = {}
): {
  write: (data: string | Uint8Array | ArrayBuffer) => number;
  flush: () => Uint8Array;
  end: () => Uint8Array;
} => {
  const sink = new Bun.ArrayBufferSink();
  sink.start({
    highWaterMark: options.initialCapacity ?? 16 * 1024,
    stream: options.stream ?? false,
    asUint8Array: true,
  });

  return {
    write: (data: string | Uint8Array | ArrayBuffer): number => {
      return sink.write(data);
    },
    flush: (): Uint8Array => {
      return sink.flush() as Uint8Array;
    },
    end: (): Uint8Array => {
      return sink.end() as Uint8Array;
    },
  };
};
