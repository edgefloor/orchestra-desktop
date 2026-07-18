import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as PlatformError from "effect/PlatformError";
import * as TestClock from "effect/testing/TestClock";
import { ChildProcessSpawner } from "effect/unstable/process";

import * as CodexError from "../errors.ts";
import {
  CODEX_APP_SERVER_STDERR_DRAIN_TIMEOUT_MS,
  CODEX_APP_SERVER_STDERR_MAX_CHARS,
  makeBoundedChildStderr,
  makeTerminationError,
} from "./stdio.ts";

describe("Codex App Server child process termination", () => {
  it.effect("retains the process identifier with the exit code", () =>
    Effect.gen(function* () {
      const error = yield* makeTerminationError({
        pid: ChildProcessSpawner.ProcessId(51),
        exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(9)),
      });

      assert.instanceOf(error, CodexError.CodexAppServerProcessExitedError);
      assert.equal(error.pid, 51);
      assert.equal(error.code, 9);
      assert.equal(error.message, "Codex App Server process exited with code 9");
    }),
  );

  it.effect("retains bounded child stderr with the abnormal exit", () =>
    Effect.gen(function* () {
      const stderr = makeBoundedChildStderr();
      stderr.push(new TextEncoder().encode(`fatal config ${"x".repeat(8_000)}`));
      const error = yield* makeTerminationError(
        {
          pid: ChildProcessSpawner.ProcessId(53),
          exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(1)),
        },
        stderr.snapshot,
      );

      assert.instanceOf(error, CodexError.CodexAppServerProcessExitedError);
      assert.equal(error.stderr?.length, CODEX_APP_SERVER_STDERR_MAX_CHARS);
      assert.isTrue(error.stderrTruncated);
      assert.include(error.message, "fatal config");
      assert.notInclude(error.message, "x".repeat(8_000));
    }),
  );

  it.effect("waits for the stderr stream before constructing the exit diagnostic", () =>
    Effect.gen(function* () {
      let stderr = "before drain";
      const error = yield* makeTerminationError(
        {
          pid: ChildProcessSpawner.ProcessId(54),
          exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(1)),
        },
        () => ({ stderr }),
        Effect.sync(() => {
          stderr = "after drain";
        }),
      );

      assert.instanceOf(error, CodexError.CodexAppServerProcessExitedError);
      assert.equal(error.stderr, "after drain");
    }),
  );

  it.effect("bounds stderr drain settlement after the child exits", () =>
    Effect.gen(function* () {
      const errorFiber = yield* makeTerminationError(
        {
          pid: ChildProcessSpawner.ProcessId(55),
          exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(1)),
        },
        () => ({ stderr: "partial drain" }),
        Effect.never,
      ).pipe(Effect.forkChild);

      yield* Effect.yieldNow;
      yield* TestClock.adjust(`${CODEX_APP_SERVER_STDERR_DRAIN_TIMEOUT_MS} millis`);
      const error = yield* Fiber.join(errorFiber);

      assert.instanceOf(error, CodexError.CodexAppServerProcessExitedError);
      assert.equal(error.stderr, "partial drain");
      assert.isTrue(error.stderrTruncated);
    }),
  );

  it("keeps the exact bound when a later chunk proves truncation", () => {
    const stderr = makeBoundedChildStderr();
    stderr.push(new TextEncoder().encode("x".repeat(CODEX_APP_SERVER_STDERR_MAX_CHARS)));
    stderr.push(new TextEncoder().encode("later"));
    stderr.flush();

    assert.equal(stderr.snapshot().stderr?.length, CODEX_APP_SERVER_STDERR_MAX_CHARS);
    assert.isTrue(stderr.snapshot().stderr?.endsWith("…"));
    assert.isTrue(stderr.snapshot().stderrTruncated);
  });

  it("decodes a multibyte stderr character split across chunks", () => {
    const stderr = makeBoundedChildStderr();
    const encoded = new TextEncoder().encode("€");
    stderr.push(encoded.slice(0, 2));
    stderr.push(encoded.slice(2));
    stderr.flush();

    assert.equal(stderr.snapshot().stderr, "€");
    assert.isFalse(stderr.snapshot().stderrTruncated);
  });

  it("truncates an astral character only at its code-point boundary", () => {
    const stderr = makeBoundedChildStderr();
    const prefix = "x".repeat(CODEX_APP_SERVER_STDERR_MAX_CHARS - 2);
    stderr.push(new TextEncoder().encode(`${prefix}😀`));
    stderr.push(new TextEncoder().encode("later"));
    stderr.flush();

    assert.equal(stderr.snapshot().stderr, `${prefix}…`);
    assert.isTrue(stderr.snapshot().stderrTruncated);
  });

  it.effect("retains the process identifier and exact exit-status cause", () =>
    Effect.gen(function* () {
      const rootCause = new Error("private process diagnostics");
      const cause = PlatformError.systemError({
        _tag: "Unknown",
        module: "ChildProcess",
        method: "exitCode",
        cause: rootCause,
      });
      const error = yield* makeTerminationError({
        pid: ChildProcessSpawner.ProcessId(52),
        exitCode: Effect.fail(cause),
      });

      assert.instanceOf(error, CodexError.CodexAppServerTransportError);
      assert.equal(error.pid, 52);
      assert.strictEqual(error.cause, cause);
      assert.equal(
        error.message,
        "Codex App Server transport operation 'read-process-exit-status' failed.",
      );
      assert.notInclude(error.message, rootCause.message);
    }),
  );
});
