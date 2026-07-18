import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Sink from "effect/Sink";
import * as Stdio from "effect/Stdio";
import * as Stream from "effect/Stream";
import { ChildProcessSpawner } from "effect/unstable/process";

import * as CodexError from "../errors.ts";

const encoder = new TextEncoder();

export const makeChildStdio = (handle: ChildProcessSpawner.ChildProcessHandle) =>
  Stdio.make({
    args: Effect.succeed([]),
    stdin: handle.stdout,
    stdout: () =>
      Sink.mapInput(handle.stdin, (chunk: string | Uint8Array) =>
        typeof chunk === "string" ? encoder.encode(chunk) : chunk,
      ),
    stderr: () => Sink.drain,
  });

export const makeInMemoryStdio = Effect.fn("makeInMemoryStdio")(function* () {
  const input = yield* Queue.unbounded<Uint8Array, Cause.Done<void>>();
  const output = yield* Queue.unbounded<string>();
  const decoder = new TextDecoder();

  return {
    stdio: Stdio.make({
      args: Effect.succeed([]),
      stdin: Stream.fromQueue(input),
      stdout: () =>
        Sink.forEach((chunk: string | Uint8Array) =>
          Queue.offer(
            output,
            typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true }),
          ),
        ),
      stderr: () => Sink.drain,
    }),
    input,
    output,
  };
});

type ChildProcessTerminationHandle = Pick<
  ChildProcessSpawner.ChildProcessHandle,
  "exitCode" | "pid"
>;

export const CODEX_APP_SERVER_STDERR_MAX_CHARS = 4_096;
export const CODEX_APP_SERVER_STDERR_DRAIN_TIMEOUT_MS = 250;

function sliceOnCodePointBoundary(value: string, maxCodeUnits: number): string {
  const sliced = value.slice(0, Math.max(0, maxCodeUnits));
  if (sliced.length === 0) return sliced;
  const lastCodeUnit = sliced.charCodeAt(sliced.length - 1);
  return lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff ? sliced.slice(0, -1) : sliced;
}

export function makeBoundedChildStderr(maxChars = CODEX_APP_SERVER_STDERR_MAX_CHARS) {
  const decoder = new TextDecoder();
  let stderr = "";
  let stderrTruncated = false;
  const append = (decoded: string) => {
    if (stderrTruncated || decoded.length === 0) return;
    const remaining = Math.max(0, maxChars - stderr.length);
    if (decoded.length <= remaining) {
      stderr += decoded;
      return;
    }
    if (maxChars > 0) {
      stderr = `${sliceOnCodePointBoundary(`${stderr}${decoded}`, maxChars - 1)}…`;
    }
    stderrTruncated = true;
  };
  return Object.freeze({
    push(chunk: Uint8Array) {
      append(decoder.decode(chunk, { stream: true }));
    },
    flush() {
      append(decoder.decode());
    },
    snapshot() {
      const normalized = stderr.trim();
      return {
        ...(normalized.length > 0 ? { stderr: normalized } : {}),
        stderrTruncated,
      };
    },
  });
}

export const makeTerminationError = (
  handle: ChildProcessTerminationHandle,
  readStderr: () => { readonly stderr?: string; readonly stderrTruncated?: boolean } = () => ({}),
  awaitStderr: Effect.Effect<void> = Effect.void,
): Effect.Effect<CodexError.CodexAppServerError> =>
  Effect.matchEffect(handle.exitCode, {
    onFailure: (cause) =>
      Effect.succeed(
        new CodexError.CodexAppServerTransportError({
          operation: "read-process-exit-status",
          pid: handle.pid,
          cause,
        }),
      ),
    onSuccess: (code) =>
      awaitStderr.pipe(
        Effect.timeoutOption(CODEX_APP_SERVER_STDERR_DRAIN_TIMEOUT_MS),
        Effect.map((drainResult) => {
          const diagnostic = readStderr();
          return new CodexError.CodexAppServerProcessExitedError({
            code,
            pid: handle.pid,
            ...diagnostic,
            ...(Option.isNone(drainResult) ? { stderrTruncated: true } : {}),
          });
        }),
      ),
  });
