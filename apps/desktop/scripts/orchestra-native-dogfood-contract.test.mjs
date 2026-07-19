import { describe, expect, it } from "vite-plus/test";

import {
  assertNativeDogfoodResponsesComplete,
  buildNativeDogfoodFixtures,
  matchNativeDogfoodResponsesRequest,
  NativeDogfoodContractError,
  ORCHESTRA_NATIVE_DOGFOOD_CALL_ID,
  ORCHESTRA_NATIVE_DOGFOOD_CHILD_FINDING,
  ORCHESTRA_NATIVE_DOGFOOD_CHILD_PROMPT,
  ORCHESTRA_NATIVE_DOGFOOD_FINAL_ASSISTANT_TEXT,
  ORCHESTRA_NATIVE_DOGFOOD_MAX_REQUEST_BYTES,
  ORCHESTRA_NATIVE_DOGFOOD_PARENT_PROMPT,
  ORCHESTRA_NATIVE_DOGFOOD_PROFILE_PATH,
  ORCHESTRA_NATIVE_DOGFOOD_RESUME_CALL_ID,
  ORCHESTRA_NATIVE_DOGFOOD_RESUME_PROMPT,
  ORCHESTRA_NATIVE_DOGFOOD_SELECTED_ISSUE,
  ORCHESTRA_NATIVE_DOGFOOD_SELECTED_ISSUE_PROFILE_PATH,
  ORCHESTRA_NATIVE_DOGFOOD_SYMPHONY_WORKFLOW_PATH,
  ORCHESTRA_NATIVE_DOGFOOD_TOTAL_REQUEST_COUNT,
  ORCHESTRA_NATIVE_DOGFOOD_WORKFLOW_PATH,
} from "../../../scripts/lib/orchestra-native-dogfood-contract.mjs";

const message = (role, text) => ({
  type: "message",
  role,
  content: [{ type: "input_text", text }],
});

const common = (input) => ({ model: "gpt-5.4", stream: true, input });

const request = (body, overrides = {}) => ({
  method: "POST",
  pathname: "/v1/responses",
  body,
  ...overrides,
});

const workflowOutcome = (status = "waiting_approval") => {
  const checkpoint = {
    schema_version: 4,
    run_id: "run-cycle8-dynamic",
    workflow_sha256: "a".repeat(64),
    inputs: {},
    inputs_sha256: "b".repeat(64),
    skills: [],
    skills_sha256: "c".repeat(64),
    parent_thread_id: "thread-cycle8",
    repository: "/tmp/orchestra-native-dogfood",
    source_revision: "revision-cycle8",
    status,
    promotion: "not_required",
    steps: {
      "inspect-native-runtime": {
        status: "completed",
        attempts: 1,
        rounds: 1,
        outputs: { finding: ORCHESTRA_NATIVE_DOGFOOD_CHILD_FINDING },
        final_response: JSON.stringify({
          finding: ORCHESTRA_NATIVE_DOGFOOD_CHILD_FINDING,
        }),
        agent: { thread_id: "child-thread", task_path: "/root/child" },
        context_sha256: "d".repeat(64),
        approval_decision: null,
        error: null,
      },
      "verify-native-repository": {
        status: "completed",
        attempts: 1,
        rounds: 1,
        outputs: { passed: true },
        final_response: null,
        agent: null,
        context_sha256: null,
        approval_decision: null,
        error: null,
      },
      "accept-native-finding": {
        status: status === "completed" ? "completed" : "waiting_approval",
        attempts: 1,
        rounds: 1,
        outputs: {},
        final_response: null,
        agent: null,
        context_sha256: null,
        approval_decision: status === "completed" ? "accept" : null,
        error: null,
      },
    },
    next_action: status === "completed" ? "run complete" : "approval required",
  };
  return status === "completed" ? { Completed: checkpoint } : { Paused: checkpoint };
};

const parentInitial = () => ({
  ...common([message("user", ORCHESTRA_NATIVE_DOGFOOD_PARENT_PROMPT)]),
  tools: [{ type: "function", name: "orchestra_run" }],
});

const child = () =>
  common([
    message(
      "user",
      `${ORCHESTRA_NATIVE_DOGFOOD_CHILD_PROMPT}\n\nDo not spawn or delegate to child agents.\nReturn exactly one JSON object containing these keys: finding.`,
    ),
  ]);

const parentWaitingFollowUp = () => ({
  ...common([
    message("user", ORCHESTRA_NATIVE_DOGFOOD_PARENT_PROMPT),
    {
      type: "function_call",
      call_id: ORCHESTRA_NATIVE_DOGFOOD_CALL_ID,
      name: "orchestra_run",
      arguments: JSON.stringify({
        workflow_path: ORCHESTRA_NATIVE_DOGFOOD_WORKFLOW_PATH,
      }),
    },
    {
      type: "function_call_output",
      call_id: ORCHESTRA_NATIVE_DOGFOOD_CALL_ID,
      output: JSON.stringify(workflowOutcome()),
    },
  ]),
});

const resumeTurn = () => ({
  ...common([
    ...parentWaitingFollowUp().input,
    {
      type: "message",
      role: "assistant",
      content: [
        {
          type: "output_text",
          text: "Native workflow is waiting for approval.",
        },
      ],
    },
    message("user", ORCHESTRA_NATIVE_DOGFOOD_RESUME_PROMPT),
  ]),
  tools: [{ type: "function", name: "orchestra_resume" }],
});

const resumeFollowUp = () => ({
  ...common([
    ...resumeTurn().input,
    {
      type: "function_call",
      call_id: ORCHESTRA_NATIVE_DOGFOOD_RESUME_CALL_ID,
      name: "orchestra_resume",
      arguments: JSON.stringify({
        run_id: "run-cycle8-dynamic",
        approval_decision: "accept",
      }),
    },
    {
      type: "function_call_output",
      call_id: ORCHESTRA_NATIVE_DOGFOOD_RESUME_CALL_ID,
      output: JSON.stringify(workflowOutcome("completed")),
    },
  ]),
});

const selectedIssueReady = () =>
  common([
    message(
      "user",
      `You are the persistent Issue task for \`${ORCHESTRA_NATIVE_DOGFOOD_SELECTED_ISSUE.identifier}\`. Retain ${ORCHESTRA_NATIVE_DOGFOOD_SELECTED_ISSUE.title} at ${ORCHESTRA_NATIVE_DOGFOOD_SELECTED_ISSUE.url} and return exactly {"ready":true}.`,
    ),
  ]);

const selectedIssueWorkflow = () =>
  common([
    message(
      "user",
      `Implement ${ORCHESTRA_NATIVE_DOGFOOD_SELECTED_ISSUE.identifier}: ${ORCHESTRA_NATIVE_DOGFOOD_SELECTED_ISSUE.title}\n\nReturn exactly one JSON object containing these keys: summary, tracker_comment.`,
    ),
  ]);

describe("native workspace dogfood contract", () => {
  it("builds sealed repository, Symphony profile, and isolated Codex config fixtures", () => {
    const fixtures = buildNativeDogfoodFixtures("http://127.0.0.1:43123");

    expect(Object.keys(fixtures.repositoryFiles).sort()).toEqual([
      ORCHESTRA_NATIVE_DOGFOOD_SELECTED_ISSUE_PROFILE_PATH,
      ORCHESTRA_NATIVE_DOGFOOD_PROFILE_PATH,
      ORCHESTRA_NATIVE_DOGFOOD_SYMPHONY_WORKFLOW_PATH,
      ORCHESTRA_NATIVE_DOGFOOD_WORKFLOW_PATH,
    ]);
    expect(fixtures.repositoryFiles[ORCHESTRA_NATIVE_DOGFOOD_WORKFLOW_PATH]).toContain(
      `id: "inspect-native-runtime"`,
    );
    expect(fixtures.repositoryFiles[ORCHESTRA_NATIVE_DOGFOOD_WORKFLOW_PATH]).toContain(
      `command: ["git", "rev-parse", "--is-inside-work-tree"]`,
    );
    expect(fixtures.repositoryFiles[ORCHESTRA_NATIVE_DOGFOOD_WORKFLOW_PATH]).toContain(
      `id: "accept-native-finding"`,
    );
    expect(fixtures.repositoryFiles[ORCHESTRA_NATIVE_DOGFOOD_PROFILE_PATH]).toContain(
      "api_key: $ORCHESTRA_NATIVE_DOGFOOD_LINEAR_API_KEY",
    );
    expect(fixtures.repositoryFiles[ORCHESTRA_NATIVE_DOGFOOD_PROFILE_PATH]).toContain(
      `workflow: ${ORCHESTRA_NATIVE_DOGFOOD_SYMPHONY_WORKFLOW_PATH}`,
    );
    expect(fixtures.repositoryFiles[ORCHESTRA_NATIVE_DOGFOOD_SYMPHONY_WORKFLOW_PATH]).toContain(
      'task_prompt: { type: "string" }',
    );
    expect(fixtures.codexHomeFiles["config.toml"]).toContain(
      'base_url = "http://127.0.0.1:43123/v1"',
    );
    expect(fixtures.codexHomeFiles["config.toml"]).toContain('sandbox_mode = "workspace-write"');
    expect(fixtures.codexHomeFiles["config.toml"]).not.toContain("danger-full-access");
    expect(fixtures.codexHomeFiles["config.toml"]).toContain("request_max_retries = 0");
    expect(fixtures.codexHomeFiles["config.toml"]).toContain("stream_max_retries = 0");
    expect(() => buildNativeDogfoodFixtures("https://example.com")).toThrow(
      "invalid_responses_origin",
    );
  });

  it("matches the exact run, waiting, resume, and completion SSE sequence", () => {
    const responses = [
      parentInitial(),
      child(),
      parentWaitingFollowUp(),
      resumeTurn(),
      resumeFollowUp(),
      selectedIssueReady(),
      selectedIssueWorkflow(),
    ].map((body, index) =>
      matchNativeDogfoodResponsesRequest(index, request(JSON.stringify(body))),
    );

    expect(responses.map(({ kind }) => kind)).toEqual([
      "parent_tool",
      "native_child",
      "parent_waiting",
      "resume_tool",
      "resume_final",
      "selected_issue_ready",
      "selected_issue_workflow",
    ]);
    expect(responses[0].events[1]).toMatchObject({
      item: {
        type: "function_call",
        call_id: ORCHESTRA_NATIVE_DOGFOOD_CALL_ID,
        name: "orchestra_run",
      },
    });
    expect(responses[1].events[1]).toMatchObject({
      item: {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify({
              finding: ORCHESTRA_NATIVE_DOGFOOD_CHILD_FINDING,
            }),
          },
        ],
      },
    });
    expect(responses[3].events[1]).toMatchObject({
      item: {
        type: "function_call",
        call_id: ORCHESTRA_NATIVE_DOGFOOD_RESUME_CALL_ID,
        name: "orchestra_resume",
        arguments: JSON.stringify({
          run_id: "run-cycle8-dynamic",
          approval_decision: "accept",
        }),
      },
    });
    expect(responses[4].events[1]).toMatchObject({
      item: {
        type: "message",
        content: [
          {
            type: "output_text",
            text: ORCHESTRA_NATIVE_DOGFOOD_FINAL_ASSISTANT_TEXT,
          },
        ],
      },
    });
    for (const response of responses) {
      expect(response.headers).toEqual({ "content-type": "text/event-stream" });
      expect(response.body).toContain("event: response.completed\n");
      expect(response.body).not.toContain("[DONE]");
    }
    expect(() => assertNativeDogfoodResponsesComplete(5)).not.toThrow();
  });

  it("fails closed for malformed, mismatched, incomplete, and extra requests", () => {
    const cases = [
      [0, request("{"), "malformed_request", 400],
      [
        0,
        request("x".repeat(ORCHESTRA_NATIVE_DOGFOOD_MAX_REQUEST_BYTES + 1)),
        "request_too_large",
        413,
      ],
      [0, request(parentInitial(), { method: "GET" }), "unexpected_method", 405],
      [0, request(parentInitial(), { pathname: "/responses" }), "unexpected_path", 404],
      [0, request(parentInitial(), { contentEncoding: "zstd" }), "unsupported_encoding", 415],
      [0, request({ ...parentInitial(), model: "other" }), "unexpected_model", 422],
      [0, request({ ...parentInitial(), stream: false }), "stream_required", 422],
      [1, request(parentInitial()), "child_prompt_missing", 422],
      [2, request(child()), "parent_prompt_missing", 422],
      [3, request(parentWaitingFollowUp()), "resume_prompt_missing", 422],
      [3, request({ ...resumeTurn(), tools: [] }), "orchestra_resume_tool_missing", 422],
      [4, request(resumeTurn()), "tool_pair_missing", 422],
      [5, request(resumeFollowUp()), "selected_issue_prompt_missing", 422],
      [6, request(selectedIssueReady()), "selected_issue_workflow_prompt_missing", 422],
      [7, request(selectedIssueWorkflow()), "extra_request", 409],
    ];

    for (const [index, modelRequest, code, statusCode] of cases) {
      try {
        matchNativeDogfoodResponsesRequest(index, modelRequest);
        throw new Error(`expected ${code}`);
      } catch (error) {
        expect(error).toBeInstanceOf(NativeDogfoodContractError);
        expect(error).toMatchObject({ code, statusCode });
        if (code === "extra_request") {
          expect(error.message).toContain(
            `exactly ${ORCHESTRA_NATIVE_DOGFOOD_TOTAL_REQUEST_COUNT} requests`,
          );
        }
      }
    }
    expect(() => assertNativeDogfoodResponsesComplete(4)).toThrow("incomplete_sequence");
  });

  it("rejects a reordered or semantically false native projection", () => {
    const reordered = parentWaitingFollowUp();
    reordered.input.reverse();
    expect(() => matchNativeDogfoodResponsesRequest(2, request(reordered))).toThrow(
      "tool_pair_missing",
    );

    const falseProjection = parentWaitingFollowUp();
    falseProjection.input[2].output = JSON.stringify({
      Completed: workflowOutcome().Paused,
    });
    expect(() => matchNativeDogfoodResponsesRequest(2, request(falseProjection))).toThrow(
      "workflow_projection_mismatch",
    );

    const wrongRun = resumeFollowUp();
    wrongRun.input.at(-1).output = JSON.stringify({
      Completed: {
        ...workflowOutcome("completed").Completed,
        run_id: "a-different-run",
      },
    });
    expect(() => matchNativeDogfoodResponsesRequest(4, request(wrongRun))).toThrow(
      "resume_projection_mismatch",
    );
  });

  it("bounds serializer-shape diagnostics when final_response is absent", () => {
    const malformed = parentWaitingFollowUp();
    const outcome = workflowOutcome();
    outcome.Paused.steps["inspect-native-runtime"].final_response = undefined;
    outcome.Paused.steps.unexpected = { marker: "x".repeat(1_000) };
    malformed.input[2].output = JSON.stringify(outcome);

    try {
      matchNativeDogfoodResponsesRequest(2, request(malformed));
      throw new Error("expected workflow_projection_mismatch");
    } catch (error) {
      expect(error).toBeInstanceOf(NativeDogfoodContractError);
      expect(error.message).toContain("final_response_type");
      expect(error.message).toContain('"outcome_keys":["Paused"]');
      expect(error.message.length).toBeLessThan(700);
    }
  });
});
