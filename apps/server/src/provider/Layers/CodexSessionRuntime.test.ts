import * as NodeAssert from "node:assert/strict";

import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe } from "vite-plus/test";
import { NATIVE_SUBAGENT_DETAIL_MAX_ITEMS, ThreadId } from "@t3tools/contracts";
import * as CodexErrors from "effect-codex-app-server/errors";
import * as CodexRpc from "effect-codex-app-server/rpc";
import type * as EffectCodexSchema from "effect-codex-app-server/schema";

import {
  CODEX_DEFAULT_MODE_DEVELOPER_INSTRUCTIONS,
  CODEX_PLAN_MODE_DEVELOPER_INSTRUCTIONS,
} from "../CodexDeveloperInstructions.ts";
import {
  buildTurnStartParams,
  decodeOrchestraThreadReadEnvelope,
  hasConfiguredMcpServer,
  isDirectNativeSubagent,
  isRecoverableThreadResumeError,
  openCodexThread,
  projectNativeSubagentDetail,
  redactCodexDiagnostic,
  validateOrchestraProductCompatibility,
} from "./CodexSessionRuntime.ts";
const isCodexAppServerRequestError = Schema.is(CodexErrors.CodexAppServerRequestError);

describe("CodexSessionRuntimeIdentifierGenerationError", () => {
  it("retains identifier purpose and the random source failure", () => {
    const cause = new Error("random source unavailable");
    const error = new CodexErrors.CodexAppServerIdentifierGenerationError({
      purpose: "provider-event",
      cause,
    });

    NodeAssert.equal(error.purpose, "provider-event");
    NodeAssert.strictEqual(error.cause, cause);
    NodeAssert.equal(
      error.message,
      "Failed to generate Codex App Server identifier for provider-event.",
    );
  });
});

describe("Orchestra Product compatibility", () => {
  it("accepts only the exact manifest with the required native capabilities", () => {
    NodeAssert.equal(
      validateOrchestraProductCompatibility("manifest-a", {
        manifestSha256: "manifest-a",
        capabilities: ["orchestra/query", "orchestra/threadItem"],
      }),
      undefined,
    );

    const wrongManifest = validateOrchestraProductCompatibility("manifest-a", {
      manifestSha256: "manifest-b",
      capabilities: ["orchestra/query", "orchestra/threadItem"],
    });
    NodeAssert.equal(wrongManifest?._tag, "CodexSessionRuntimeProductMismatchError");
    NodeAssert.equal(wrongManifest?.actualManifestSha256, "manifest-b");

    const missingCapability = validateOrchestraProductCompatibility("manifest-a", {
      manifestSha256: "manifest-a",
      capabilities: ["orchestra/query"],
    });
    NodeAssert.match(missingCapability?.message ?? "", /orchestra\/threadItem/);

    const stockCodex = validateOrchestraProductCompatibility("manifest-a", null);
    NodeAssert.match(stockCodex?.message ?? "", /does not expose/);
  });
});

describe("Orchestra task replay", () => {
  it.effect("decodes Rust Option fields serialized as null", () =>
    Effect.gen(function* () {
      const decoded = yield* decodeOrchestraThreadReadEnvelope({
        thread: { id: "provider-thread" },
        orchestra: {
          latest: {
            schemaVersion: 1,
            eventId: "run-1:1",
            runId: "run-1",
            sequence: 1,
            revision: 1,
            kind: "invoked",
            projection: {
              schemaVersion: 1,
              runId: "run-1",
              workflowSha256: "sha256",
              parentThreadId: "provider-thread",
              sourceRevision: "revision",
              status: "completed",
              promotion: "notRequired",
              steps: [
                {
                  id: "check",
                  status: "completed",
                  attempts: 1,
                  rounds: 1,
                  outputKeys: ["passed"],
                  finalResponse: null,
                  error: null,
                },
              ],
              nextAction: "run complete",
            },
          },
          events: [],
          replayTruncated: false,
        },
      });

      NodeAssert.equal(decoded.orchestra?.latest.projection.status, "completed");
      NodeAssert.equal(decoded.orchestra?.latest.projection.steps[0]?.error, null);
    }),
  );

  it.effect("rejects replay tails beyond the native task-local bound", () =>
    Effect.gen(function* () {
      const event = {
        schemaVersion: 1,
        eventId: "run-1:1",
        runId: "run-1",
        sequence: 1,
        revision: 1,
        kind: "invoked",
        projection: {
          schemaVersion: 1,
          runId: "run-1",
          workflowSha256: "sha256",
          parentThreadId: "provider-thread",
          sourceRevision: "revision",
          status: "running",
          promotion: "pending",
          steps: [],
          nextAction: "continue",
        },
      };
      const error = yield* decodeOrchestraThreadReadEnvelope({
        orchestra: {
          latest: event,
          events: Array.from({ length: 65 }, (_, index) => ({
            ...event,
            eventId: `run-1:${index + 1}`,
            sequence: index + 1,
            revision: index + 1,
          })),
          replayTruncated: false,
        },
      }).pipe(Effect.flip);

      NodeAssert.ok(Schema.isSchemaError(error));
    }),
  );
});

describe("native subagent detail", () => {
  const childThread = {
    agentNickname: "Scout",
    agentRole: "researcher",
    cliVersion: "0.1.0",
    createdAt: 1_768_435_200,
    cwd: "/tmp/project",
    ephemeral: false,
    id: "child-provider-thread",
    modelProvider: "openai",
    parentThreadId: "parent-provider-thread",
    preview: "Inspect the native Codex boundary",
    sessionId: "session-1",
    source: "appServer",
    status: { type: "active", activeFlags: ["waitingOnUserInput"] },
    turns: [
      {
        id: "turn-1",
        items: Array.from({ length: 30 }, (_, index) => ({
          type: "agentMessage" as const,
          id: `item-${index}`,
          text: `Finding ${index} ${"detail ".repeat(80)}`,
        })),
        status: "inProgress" as const,
      },
    ],
    updatedAt: 1_768_435_260,
  } satisfies EffectCodexSchema.V2ThreadReadResponse["thread"];

  it("accepts only a direct native child relationship", () => {
    NodeAssert.equal(isDirectNativeSubagent("parent-provider-thread", childThread), true);
    NodeAssert.equal(isDirectNativeSubagent("unrelated-provider-thread", childThread), false);
  });

  it("projects bounded child history and waiting state", () => {
    const detail = projectNativeSubagentDetail(ThreadId.make("parent-task"), childThread);

    NodeAssert.equal(detail.parentTaskId, "parent-task");
    NodeAssert.equal(detail.agentThreadId, "child-provider-thread");
    NodeAssert.equal(detail.status, "waiting");
    NodeAssert.equal(detail.items.length, NATIVE_SUBAGENT_DETAIL_MAX_ITEMS);
    NodeAssert.equal(detail.items[0]?.id, "item-6");
    NodeAssert.equal(detail.truncated, true);
    NodeAssert.ok(detail.items.every((item) => item.summary.length <= 320));
  });
});

describe("Codex diagnostics", () => {
  it("redacts credential-shaped values and bounds support output", () => {
    const secret = "diagnostic-secret-sentinel";
    const diagnostic = redactCodexDiagnostic(
      `Authorization: Bearer ${secret} api_key=${secret} ${"x".repeat(8_192)}`,
    );

    NodeAssert.doesNotMatch(diagnostic, new RegExp(secret));
    NodeAssert.match(diagnostic, /\[REDACTED\]/);
    NodeAssert.ok(diagnostic.length <= 4_096);
    NodeAssert.ok(diagnostic.endsWith("…"));
  });
});

function makeThreadOpenResponse(
  threadId: string,
): CodexRpc.ClientRequestResponsesByMethod["thread/start"] {
  return {
    cwd: "/tmp/project",
    model: "gpt-5.3-codex",
    modelProvider: "openai",
    approvalPolicy: "never",
    approvalsReviewer: "user",
    sandbox: { type: "danger-full-access" },
    thread: {
      id: threadId,
      createdAt: "2026-04-18T00:00:00.000Z",
      source: { session: "cli" },
      turns: [],
      status: {
        state: "idle",
        activeFlags: [],
      },
    },
  } as unknown as CodexRpc.ClientRequestResponsesByMethod["thread/start"];
}

describe("buildTurnStartParams", () => {
  it("keeps invalid turn values only in the schema cause", () => {
    const secret = "codex-turn-input-secret-sentinel";
    const error = Effect.runSync(
      buildTurnStartParams({
        threadId: "provider-thread-1",
        runtimeMode: "full-access",
        attachments: [
          {
            type: "image",
            url: { secret } as unknown as string,
          },
        ],
      }).pipe(Effect.flip),
    );
    const { cause, ...directDiagnostics } = error;

    NodeAssert.equal(error.operation, "decode-request-payload");
    NodeAssert.equal(error.method, "turn/start");
    NodeAssert.ok((error.issueCount ?? 0) > 0);
    NodeAssert.ok(error.issueKinds?.includes("Pointer"));
    NodeAssert.ok((error.maximumPathDepth ?? 0) > 0);
    NodeAssert.ok(Schema.isSchemaError(cause));
    NodeAssert.doesNotMatch(error.message, new RegExp(secret));
    NodeAssert.doesNotMatch(JSON.stringify(directDiagnostics), new RegExp(secret));
  });

  it("includes plan collaboration mode when requested", () => {
    const params = Effect.runSync(
      buildTurnStartParams({
        threadId: "provider-thread-1",
        runtimeMode: "full-access",
        prompt: "Make a plan",
        model: "gpt-5.3-codex",
        effort: "medium",
        interactionMode: "plan",
      }),
    );

    NodeAssert.deepStrictEqual(params, {
      threadId: "provider-thread-1",
      approvalPolicy: "never",
      sandboxPolicy: {
        type: "dangerFullAccess",
      },
      input: [
        {
          type: "text",
          text: "Make a plan",
        },
      ],
      model: "gpt-5.3-codex",
      effort: "medium",
      collaborationMode: {
        mode: "plan",
        settings: {
          model: "gpt-5.3-codex",
          reasoning_effort: "medium",
          developer_instructions: CODEX_PLAN_MODE_DEVELOPER_INSTRUCTIONS,
        },
      },
    });
  });

  it("includes default collaboration mode and image attachments", () => {
    const params = Effect.runSync(
      buildTurnStartParams({
        threadId: "provider-thread-1",
        runtimeMode: "auto-accept-edits",
        prompt: "Implement it",
        model: "gpt-5.3-codex",
        interactionMode: "default",
        attachments: [
          {
            type: "image",
            url: "data:image/png;base64,abc",
          },
        ],
      }),
    );

    NodeAssert.deepStrictEqual(params, {
      threadId: "provider-thread-1",
      approvalPolicy: "on-request",
      sandboxPolicy: {
        type: "workspaceWrite",
      },
      input: [
        {
          type: "text",
          text: "Implement it",
        },
        {
          type: "image",
          url: "data:image/png;base64,abc",
        },
      ],
      model: "gpt-5.3-codex",
      collaborationMode: {
        mode: "default",
        settings: {
          model: "gpt-5.3-codex",
          reasoning_effort: "medium",
          developer_instructions: CODEX_DEFAULT_MODE_DEVELOPER_INSTRUCTIONS,
        },
      },
    });
  });

  it("omits collaboration mode when interaction mode is absent", () => {
    const params = Effect.runSync(
      buildTurnStartParams({
        threadId: "provider-thread-1",
        runtimeMode: "approval-required",
        prompt: "Review",
      }),
    );

    NodeAssert.deepStrictEqual(params, {
      threadId: "provider-thread-1",
      approvalPolicy: "untrusted",
      sandboxPolicy: {
        type: "readOnly",
      },
      input: [
        {
          type: "text",
          text: "Review",
        },
      ],
    });
  });
});

describe("T3 browser developer instructions", () => {
  it("prefers the product-native preview tools in both collaboration modes", () => {
    for (const instructions of [
      CODEX_DEFAULT_MODE_DEVELOPER_INSTRUCTIONS,
      CODEX_PLAN_MODE_DEVELOPER_INSTRUCTIONS,
    ]) {
      NodeAssert.match(instructions, /t3-code/);
      NodeAssert.match(instructions, /preview_status/);
      NodeAssert.match(instructions, /preview_open/);
      NodeAssert.match(instructions, /Do not switch to global browser skills/);
    }
  });
});

describe("hasConfiguredMcpServer", () => {
  it("detects inline Codex MCP configuration arguments", () => {
    NodeAssert.equal(hasConfiguredMcpServer(undefined), false);
    NodeAssert.equal(hasConfiguredMcpServer(["--model", "gpt-5.4"]), false);
    NodeAssert.equal(
      hasConfiguredMcpServer(["-c", 'mcp_servers.t3-code.url="http://127.0.0.1/mcp"']),
      true,
    );
  });
});

describe("isRecoverableThreadResumeError", () => {
  it("matches missing thread errors", () => {
    NodeAssert.equal(
      isRecoverableThreadResumeError(
        new CodexErrors.CodexAppServerRequestError({
          code: -32603,
          errorMessage: "Thread does not exist",
        }),
      ),
      true,
    );
  });

  it("ignores non-recoverable resume errors", () => {
    NodeAssert.equal(
      isRecoverableThreadResumeError(
        new CodexErrors.CodexAppServerRequestError({
          code: -32603,
          errorMessage: "Permission denied",
        }),
      ),
      false,
    );
  });

  it("ignores unrelated missing-resource errors that do not mention threads", () => {
    NodeAssert.equal(
      isRecoverableThreadResumeError(
        new CodexErrors.CodexAppServerRequestError({
          code: -32603,
          errorMessage: "Config file not found",
        }),
      ),
      false,
    );
    NodeAssert.equal(
      isRecoverableThreadResumeError(
        new CodexErrors.CodexAppServerRequestError({
          code: -32603,
          errorMessage: "Model does not exist",
        }),
      ),
      false,
    );
  });
});

describe("openCodexThread", () => {
  it.effect("falls back to thread/start when resume fails recoverably", () =>
    Effect.gen(function* () {
      const calls: Array<{ method: "thread/start" | "thread/resume"; payload: unknown }> = [];
      const started = makeThreadOpenResponse("fresh-thread");
      const client = {
        request: <M extends "thread/start" | "thread/resume">(
          method: M,
          payload: CodexRpc.ClientRequestParamsByMethod[M],
        ) => {
          calls.push({ method, payload });
          if (method === "thread/resume") {
            return Effect.fail(
              new CodexErrors.CodexAppServerRequestError({
                code: -32603,
                errorMessage: "thread not found",
              }),
            );
          }
          return Effect.succeed(started as CodexRpc.ClientRequestResponsesByMethod[M]);
        },
      };

      const opened = yield* openCodexThread({
        client,
        threadId: ThreadId.make("thread-1"),
        runtimeMode: "full-access",
        cwd: "/tmp/project",
        requestedModel: "gpt-5.3-codex",
        serviceTier: undefined,
        resumeThreadId: "stale-thread",
      });

      NodeAssert.equal(opened.thread.id, "fresh-thread");
      NodeAssert.deepStrictEqual(
        calls.map((call) => call.method),
        ["thread/resume", "thread/start"],
      );
    }),
  );

  it.effect("propagates non-recoverable resume failures", () =>
    Effect.gen(function* () {
      const client = {
        request: <M extends "thread/start" | "thread/resume">(
          method: M,
          _payload: CodexRpc.ClientRequestParamsByMethod[M],
        ) => {
          if (method === "thread/resume") {
            return Effect.fail(
              new CodexErrors.CodexAppServerRequestError({
                code: -32603,
                errorMessage: "timed out waiting for server",
              }),
            );
          }
          return Effect.succeed(
            makeThreadOpenResponse("fresh-thread") as CodexRpc.ClientRequestResponsesByMethod[M],
          );
        },
      };

      const error = yield* openCodexThread({
        client,
        threadId: ThreadId.make("thread-1"),
        runtimeMode: "full-access",
        cwd: "/tmp/project",
        requestedModel: "gpt-5.3-codex",
        serviceTier: undefined,
        resumeThreadId: "stale-thread",
      }).pipe(Effect.flip);

      NodeAssert.ok(isCodexAppServerRequestError(error));
      NodeAssert.equal(error.errorMessage, "timed out waiting for server");
    }),
  );
});
