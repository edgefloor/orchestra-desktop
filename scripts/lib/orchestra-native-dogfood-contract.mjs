export const ORCHESTRA_NATIVE_DOGFOOD_WORKFLOW_PATH =
  "orchestra-native-workspace-dogfood.workflow.ts";
export const ORCHESTRA_NATIVE_DOGFOOD_SYMPHONY_WORKFLOW_PATH =
  "orchestra-native-symphony-dogfood.workflow.ts";
export const ORCHESTRA_NATIVE_DOGFOOD_PROFILE_PATH = "WORKFLOW.md";
export const ORCHESTRA_NATIVE_DOGFOOD_PARENT_PROMPT =
  "Run the current-fork native workspace dogfood workflow.";
export const ORCHESTRA_NATIVE_DOGFOOD_RESUME_PROMPT =
  "Accept and resume the current-fork native workspace dogfood workflow.";
export const ORCHESTRA_NATIVE_DOGFOOD_CHILD_PROMPT =
  "Inspect the acceptance repository and return the native finding.";
export const ORCHESTRA_NATIVE_DOGFOOD_CHILD_FINDING = "deterministic native child";
export const ORCHESTRA_NATIVE_DOGFOOD_CALL_ID = "call-cycle8-orchestra-run";
export const ORCHESTRA_NATIVE_DOGFOOD_RESUME_CALL_ID = "call-cycle8-orchestra-resume";
export const ORCHESTRA_NATIVE_DOGFOOD_REQUEST_COUNT = 5;
export const ORCHESTRA_NATIVE_DOGFOOD_MAX_REQUEST_BYTES = 2 * 1024 * 1024;
export const ORCHESTRA_NATIVE_DOGFOOD_CHECK_STEP_ID = "verify-native-repository";
export const ORCHESTRA_NATIVE_DOGFOOD_AGENT_STEP_ID = "inspect-native-runtime";
export const ORCHESTRA_NATIVE_DOGFOOD_CHILD_OUTPUT_NAME = "finding";
export const ORCHESTRA_NATIVE_DOGFOOD_CHECK_EVIDENCE_NAME = `${ORCHESTRA_NATIVE_DOGFOOD_CHECK_STEP_ID}-1.json`;
export const ORCHESTRA_NATIVE_DOGFOOD_CHECK_EVIDENCE_RELATIVE_PATH = `checks/${ORCHESTRA_NATIVE_DOGFOOD_CHECK_EVIDENCE_NAME}`;
export const ORCHESTRA_NATIVE_DOGFOOD_FINAL_ASSISTANT_TEXT =
  "Native workflow approval was accepted and the same run completed with one deterministic child finding.";

const providerId = "orchestra_native_dogfood";
const model = "gpt-5.4";
const checkStepId = ORCHESTRA_NATIVE_DOGFOOD_CHECK_STEP_ID;
const approvalStepId = "accept-native-finding";
const missingLinearCredential = "ORCHESTRA_NATIVE_DOGFOOD_LINEAR_API_KEY";
const functionArguments = JSON.stringify({
  workflow_path: ORCHESTRA_NATIVE_DOGFOOD_WORKFLOW_PATH,
});
const childOutput = JSON.stringify({
  [ORCHESTRA_NATIVE_DOGFOOD_CHILD_OUTPUT_NAME]: ORCHESTRA_NATIVE_DOGFOOD_CHILD_FINDING,
});
const waitingAssistantText = "Native workflow is waiting for approval.";

const completedEvent = (id) => ({
  type: "response.completed",
  response: {
    id,
    usage: {
      input_tokens: 0,
      input_tokens_details: null,
      output_tokens: 0,
      output_tokens_details: null,
      total_tokens: 0,
    },
  },
});

const createdEvent = (id) => ({ type: "response.created", response: { id } });

const assistantEvent = (id, text) => ({
  type: "response.output_item.done",
  item: {
    type: "message",
    role: "assistant",
    id,
    content: [{ type: "output_text", text }],
  },
});

const responseEvents = Object.freeze([
  Object.freeze([
    createdEvent("resp-cycle8-parent-tool"),
    {
      type: "response.output_item.done",
      item: {
        type: "function_call",
        call_id: ORCHESTRA_NATIVE_DOGFOOD_CALL_ID,
        name: "orchestra_run",
        arguments: functionArguments,
      },
    },
    completedEvent("resp-cycle8-parent-tool"),
  ]),
  Object.freeze([
    createdEvent("resp-cycle8-child"),
    assistantEvent("msg-cycle8-child", childOutput),
    completedEvent("resp-cycle8-child"),
  ]),
  Object.freeze([
    createdEvent("resp-cycle8-parent-waiting"),
    assistantEvent("msg-cycle8-parent-waiting", waitingAssistantText),
    completedEvent("resp-cycle8-parent-waiting"),
  ]),
  null,
  Object.freeze([
    createdEvent("resp-cycle8-resume-final"),
    assistantEvent("msg-cycle8-resume-final", ORCHESTRA_NATIVE_DOGFOOD_FINAL_ASSISTANT_TEXT),
    completedEvent("resp-cycle8-resume-final"),
  ]),
]);

export class NativeDogfoodContractError extends Error {
  constructor(code, message, statusCode) {
    super(`${code}: ${message}`);
    this.name = "NativeDogfoodContractError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function contractError(code, message, statusCode = 422) {
  throw new NativeDogfoodContractError(code, message, statusCode);
}

function normalizeOrigin(responsesOrigin) {
  let url;
  try {
    url = new URL(responsesOrigin);
  } catch {
    contractError("invalid_responses_origin", "responses origin must be an absolute URL", 400);
  }
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    !url.port ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.origin !== responsesOrigin
  ) {
    contractError(
      "invalid_responses_origin",
      "responses origin must be an exact http://127.0.0.1:<port> origin",
      400,
    );
  }
  return url.origin;
}

export function buildNativeDogfoodFixtures(responsesOrigin) {
  const origin = normalizeOrigin(responsesOrigin);
  const workflow = `import { agent, approval, check, pipeline, workflow } from "@codex-orchestra/workflow";

export default workflow({
  name: "native-workspace-dogfood",
  max_parallel: 1,
  steps: [pipeline([
    agent({
      id: "${ORCHESTRA_NATIVE_DOGFOOD_AGENT_STEP_ID}",
      prompt: "${ORCHESTRA_NATIVE_DOGFOOD_CHILD_PROMPT}",
      model: "${model}",
      reasoning_effort: "low",
      outputs: ["${ORCHESTRA_NATIVE_DOGFOOD_CHILD_OUTPUT_NAME}"],
    }),
    check({ id: "${checkStepId}", command: ["git", "rev-parse", "--is-inside-work-tree"] }),
    approval({
      id: "${approvalStepId}",
      prompt: "Accept the deterministic native finding?",
      choices: ["accept", "reject"],
    }),
  ])],
});
`;
  const profile = `---
tracker:
  kind: linear
  project_slug: orchestra-native-dogfood
  api_key: $${missingLinearCredential}
  required_labels:
    - orchestra-native-dogfood
  active_states:
    - Todo
    - In Progress
  terminal_states:
    - Done
    - Cancelled
workspace:
  root: .codex/orchestra/automation-worktrees
agent:
  max_concurrent_agents: 1
orchestra:
  workflow: ${ORCHESTRA_NATIVE_DOGFOOD_SYMPHONY_WORKFLOW_PATH}
  effects: []
---

Implement {{ issue.identifier }}: {{ issue.title }}

Work only on the claimed acceptance issue and return bounded verification evidence.
`;
  const symphonyWorkflow = `import { agent, pipeline, workflow } from "@codex-orchestra/workflow";

export default workflow({
  name: "native-symphony-dogfood",
  max_parallel: 1,
  inputs: {
    issue: { type: "object" },
    task_prompt: { type: "string" },
    automation: { type: "object" },
  },
  steps: [pipeline([
    agent({
      id: "implement-automation-issue",
      prompt: "{{inputs.task_prompt}}\\n\\nReturn summary and tracker_comment as bounded JSON outputs.",
      model: "${model}",
      reasoning_effort: "low",
      outputs: ["summary", "tracker_comment"],
    }),
  ])],
});
`;
  const config = `model = "${model}"
approval_policy = "never"
sandbox_mode = "workspace-write"
model_provider = "${providerId}"

[model_providers.${providerId}]
name = "Orchestra native dogfood model boundary"
base_url = "${origin}/v1"
wire_api = "responses"
request_max_retries = 0
stream_max_retries = 0
supports_websockets = false
`;

  return Object.freeze({
    repositoryFiles: Object.freeze({
      [ORCHESTRA_NATIVE_DOGFOOD_WORKFLOW_PATH]: workflow,
      [ORCHESTRA_NATIVE_DOGFOOD_SYMPHONY_WORKFLOW_PATH]: symphonyWorkflow,
      [ORCHESTRA_NATIVE_DOGFOOD_PROFILE_PATH]: profile,
    }),
    codexHomeFiles: Object.freeze({ "config.toml": config }),
    missingCredentialEnvironmentVariable: missingLinearCredential,
  });
}

export function buildNativeDogfoodSse(events) {
  return events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("");
}

function parseRequestBody(body) {
  if (body !== null && typeof body === "object" && !ArrayBuffer.isView(body)) return body;
  const bytes = Buffer.from(body ?? []);
  if (bytes.byteLength > ORCHESTRA_NATIVE_DOGFOOD_MAX_REQUEST_BYTES) {
    contractError(
      "request_too_large",
      `Responses request exceeds ${ORCHESTRA_NATIVE_DOGFOOD_MAX_REQUEST_BYTES} bytes`,
      413,
    );
  }
  const text = typeof body === "string" ? body : bytes.toString("utf8");
  try {
    const value = JSON.parse(text);
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      contractError("malformed_request", "Responses request body must be a JSON object", 400);
    }
    return value;
  } catch (error) {
    if (error instanceof NativeDogfoodContractError) throw error;
    contractError("malformed_request", "Responses request body is not valid JSON", 400);
  }
}

function inputTexts(body, role) {
  if (!Array.isArray(body.input)) return [];
  return body.input.flatMap((item) => {
    if (item?.type !== "message" || item.role !== role || !Array.isArray(item.content)) return [];
    return item.content
      .filter((content) => content?.type === "input_text" && typeof content.text === "string")
      .map((content) => content.text);
  });
}

function assertCommonRequest(request, requestIndex, body) {
  if (request.method !== "POST") {
    contractError("unexpected_method", `request ${requestIndex + 1} must use POST`, 405);
  }
  if (request.pathname !== "/v1/responses") {
    contractError("unexpected_path", `request ${requestIndex + 1} must target /v1/responses`, 404);
  }
  const contentEncoding = request.contentEncoding?.trim().toLowerCase();
  if (contentEncoding && contentEncoding !== "identity") {
    contractError("unsupported_encoding", `unsupported content encoding ${contentEncoding}`, 415);
  }
  if (body.model !== model) {
    contractError("unexpected_model", `request ${requestIndex + 1} must use ${model}`);
  }
  if (body.stream !== true) {
    contractError("stream_required", `request ${requestIndex + 1} must enable streaming`);
  }
  if (!Array.isArray(body.input)) {
    contractError("input_required", `request ${requestIndex + 1} must contain an input array`);
  }
}

function assertInitialParentRequest(body) {
  if (!inputTexts(body, "user").includes(ORCHESTRA_NATIVE_DOGFOOD_PARENT_PROMPT)) {
    contractError("parent_prompt_missing", "initial parent prompt is missing");
  }
  const tools = Array.isArray(body.tools) ? body.tools : [];
  const orchestraTools = tools.filter(
    (tool) => tool?.type === "function" && tool.name === "orchestra_run",
  );
  if (orchestraTools.length !== 1) {
    contractError("orchestra_tool_missing", "exactly one orchestra_run function tool is required");
  }
  if (
    body.input.some(
      (item) =>
        item?.call_id === ORCHESTRA_NATIVE_DOGFOOD_CALL_ID ||
        item?.type === "function_call" ||
        item?.type === "function_call_output",
    )
  ) {
    contractError("unexpected_initial_call", "initial parent request contains tool history");
  }
}

function assertChildRequest(body) {
  const texts = inputTexts(body, "user");
  const prompt = texts.find((text) => text.includes(ORCHESTRA_NATIVE_DOGFOOD_CHILD_PROMPT));
  if (!prompt) contractError("child_prompt_missing", "native child prompt is missing");
  for (const expected of [
    "Do not spawn or delegate to child agents.",
    "Return exactly one JSON object containing these keys: finding.",
  ]) {
    if (!prompt.includes(expected)) {
      contractError("child_contract_missing", `native child prompt is missing: ${expected}`);
    }
  }
  if (JSON.stringify(body.input).includes(ORCHESTRA_NATIVE_DOGFOOD_CALL_ID)) {
    contractError("child_history_leak", "native child request contains the parent tool call id");
  }
}

function findToolPair(body, { callId, name }) {
  const callIndex = body.input.findIndex(
    (item) => item?.type === "function_call" && item.call_id === callId && item.name === name,
  );
  const outputIndex = body.input.findIndex(
    (item) => item?.type === "function_call_output" && item.call_id === callId,
  );
  if (callIndex < 0 || outputIndex <= callIndex) {
    contractError("tool_pair_missing", `request must contain the ordered ${name} tool pair`);
  }
  return { call: body.input[callIndex], output: body.input[outputIndex] };
}

function parseJsonString(value, code, message) {
  if (typeof value !== "string") contractError(code, message);
  try {
    return JSON.parse(value);
  } catch {
    contractError(code, message);
  }
}

function boundedJson(value, maxLength = 512) {
  let rendered;
  try {
    rendered = JSON.stringify(value);
  } catch {
    rendered = "<unserializable>";
  }
  if (rendered === undefined) rendered = "<undefined>";
  return rendered.length <= maxLength ? rendered : `${rendered.slice(0, maxLength - 1)}…`;
}

function outcomeCheckpoint(outcome, variant, code) {
  if (
    outcome === null ||
    typeof outcome !== "object" ||
    Array.isArray(outcome) ||
    Object.keys(outcome).length !== 1 ||
    outcome[variant] === null ||
    typeof outcome[variant] !== "object" ||
    Array.isArray(outcome[variant])
  ) {
    contractError(
      code,
      `expected ${variant} RunOutcome; observed shape=${boundedJson({
        outcome_keys:
          outcome !== null && typeof outcome === "object" && !Array.isArray(outcome)
            ? Object.keys(outcome).sort()
            : [],
        outcome_type: typeof outcome,
      })}`,
    );
  }
  return outcome[variant];
}

function finalResponseDiagnostic(outcome, checkpoint, step) {
  return boundedJson({
    final_response: step?.final_response,
    final_response_type: typeof step?.final_response,
    outcome_keys: Object.keys(outcome).sort(),
    status: checkpoint?.status ?? null,
    step_keys:
      checkpoint?.steps !== null &&
      typeof checkpoint?.steps === "object" &&
      !Array.isArray(checkpoint.steps)
        ? Object.keys(checkpoint.steps).sort()
        : [],
    steps_type: Array.isArray(checkpoint?.steps) ? "array" : typeof checkpoint?.steps,
  });
}

function assertWaitingOutcome(outcome) {
  const checkpoint = outcomeCheckpoint(outcome, "Paused", "workflow_projection_mismatch");
  const step = checkpoint.steps?.[ORCHESTRA_NATIVE_DOGFOOD_AGENT_STEP_ID] ?? null;
  if (typeof step?.final_response !== "string") {
    contractError(
      "workflow_projection_mismatch",
      `agent final response is not valid JSON; observed=${finalResponseDiagnostic(
        outcome,
        checkpoint,
        step,
      )}`,
    );
  }
  const finalResponse = parseJsonString(
    step.final_response,
    "workflow_projection_mismatch",
    `agent final response is not valid JSON; observed=${finalResponseDiagnostic(
      outcome,
      checkpoint,
      step,
    )}`,
  );
  if (
    typeof checkpoint.run_id !== "string" ||
    checkpoint.run_id.length === 0 ||
    checkpoint.run_id.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(checkpoint.run_id) ||
    checkpoint.status !== "waiting_approval" ||
    !step ||
    step.status !== "completed" ||
    step.outputs?.finding !== ORCHESTRA_NATIVE_DOGFOOD_CHILD_FINDING ||
    finalResponse?.finding !== ORCHESTRA_NATIVE_DOGFOOD_CHILD_FINDING
  ) {
    contractError(
      "workflow_projection_mismatch",
      "orchestra_run output does not contain the waiting native workflow projection",
    );
  }
  const checkStep = checkpoint.steps?.[checkStepId];
  const approvalStep = checkpoint.steps?.[approvalStepId];
  if (checkStep?.status !== "completed" || approvalStep?.status !== "waiting_approval") {
    contractError(
      "workflow_gate_mismatch",
      "check must complete before the native approval gate waits",
    );
  }
  return checkpoint.run_id;
}

function waitingRunId(body) {
  const { output } = findToolPair(body, {
    callId: ORCHESTRA_NATIVE_DOGFOOD_CALL_ID,
    name: "orchestra_run",
  });
  return assertWaitingOutcome(
    parseJsonString(
      output.output,
      "tool_output_malformed",
      "orchestra_run output must be valid JSON text",
    ),
  );
}

function assertParentWaitingFollowUp(body) {
  if (!inputTexts(body, "user").includes(ORCHESTRA_NATIVE_DOGFOOD_PARENT_PROMPT)) {
    contractError("parent_prompt_missing", "parent follow-up lost the original prompt");
  }
  const { call } = findToolPair(body, {
    callId: ORCHESTRA_NATIVE_DOGFOOD_CALL_ID,
    name: "orchestra_run",
  });
  const argumentsValue = parseJsonString(
    call.arguments,
    "tool_arguments_malformed",
    "orchestra_run arguments are not valid JSON",
  );
  if (
    argumentsValue === null ||
    typeof argumentsValue !== "object" ||
    Array.isArray(argumentsValue) ||
    Object.keys(argumentsValue).length !== 1 ||
    argumentsValue.workflow_path !== ORCHESTRA_NATIVE_DOGFOOD_WORKFLOW_PATH
  ) {
    contractError("tool_arguments_mismatch", "orchestra_run workflow path changed");
  }
  waitingRunId(body);
}

function assertResumeTurnRequest(body) {
  if (!inputTexts(body, "user").includes(ORCHESTRA_NATIVE_DOGFOOD_RESUME_PROMPT)) {
    contractError("resume_prompt_missing", "resume turn prompt is missing");
  }
  const tools = Array.isArray(body.tools) ? body.tools : [];
  if (
    tools.filter((tool) => tool?.type === "function" && tool.name === "orchestra_resume").length !==
    1
  ) {
    contractError(
      "orchestra_resume_tool_missing",
      "exactly one orchestra_resume function tool is required",
    );
  }
  waitingRunId(body);
  if (
    body.input.some(
      (item) =>
        item?.call_id === ORCHESTRA_NATIVE_DOGFOOD_RESUME_CALL_ID ||
        (item?.type === "function_call" && item.name === "orchestra_resume"),
    )
  ) {
    contractError(
      "unexpected_resume_call",
      "resume turn already contains orchestra_resume history",
    );
  }
}

function assertCompletedOutcome(outcome, runId) {
  const checkpoint = outcomeCheckpoint(outcome, "Completed", "resume_projection_mismatch");
  const agentStep = checkpoint.steps?.[ORCHESTRA_NATIVE_DOGFOOD_AGENT_STEP_ID] ?? null;
  if (typeof agentStep?.final_response !== "string") {
    contractError(
      "resume_projection_mismatch",
      `completed agent final response is not valid JSON; observed=${finalResponseDiagnostic(
        outcome,
        checkpoint,
        agentStep,
      )}`,
    );
  }
  const finalResponse = parseJsonString(
    agentStep.final_response,
    "resume_projection_mismatch",
    `completed agent final response is not valid JSON; observed=${finalResponseDiagnostic(
      outcome,
      checkpoint,
      agentStep,
    )}`,
  );
  const checkStep = checkpoint.steps?.[checkStepId];
  const approvalStep = checkpoint.steps?.[approvalStepId];
  if (
    checkpoint.run_id !== runId ||
    checkpoint.status !== "completed" ||
    agentStep?.status !== "completed" ||
    checkStep?.status !== "completed" ||
    approvalStep?.status !== "completed" ||
    approvalStep.approval_decision !== "accept" ||
    agentStep.outputs?.finding !== ORCHESTRA_NATIVE_DOGFOOD_CHILD_FINDING ||
    finalResponse?.finding !== ORCHESTRA_NATIVE_DOGFOOD_CHILD_FINDING
  ) {
    contractError(
      "resume_projection_mismatch",
      "orchestra_resume did not complete the same accepted native run",
    );
  }
}

function assertResumeFollowUp(body) {
  if (!inputTexts(body, "user").includes(ORCHESTRA_NATIVE_DOGFOOD_RESUME_PROMPT)) {
    contractError("resume_prompt_missing", "resume follow-up lost the resume prompt");
  }
  const waitingId = waitingRunId(body);
  const { call, output } = findToolPair(body, {
    callId: ORCHESTRA_NATIVE_DOGFOOD_RESUME_CALL_ID,
    name: "orchestra_resume",
  });
  const argumentsValue = parseJsonString(
    call.arguments,
    "resume_arguments_malformed",
    "orchestra_resume arguments are not valid JSON",
  );
  if (
    argumentsValue === null ||
    typeof argumentsValue !== "object" ||
    Array.isArray(argumentsValue) ||
    Object.keys(argumentsValue).sort().join(",") !== "approval_decision,run_id" ||
    argumentsValue.run_id !== waitingId ||
    argumentsValue.approval_decision !== "accept"
  ) {
    contractError(
      "resume_arguments_mismatch",
      "orchestra_resume must accept the exact waiting run",
    );
  }
  assertCompletedOutcome(
    parseJsonString(
      output.output,
      "resume_output_malformed",
      "orchestra_resume output must be valid JSON text",
    ),
    waitingId,
  );
}

function resumeToolEvents(body) {
  const runId = waitingRunId(body);
  const id = "resp-cycle8-resume-tool";
  return Object.freeze([
    createdEvent(id),
    {
      type: "response.output_item.done",
      item: {
        type: "function_call",
        call_id: ORCHESTRA_NATIVE_DOGFOOD_RESUME_CALL_ID,
        name: "orchestra_resume",
        arguments: JSON.stringify({
          run_id: runId,
          approval_decision: "accept",
        }),
      },
    },
    completedEvent(id),
  ]);
}

export function matchNativeDogfoodResponsesRequest(requestIndex, request) {
  if (!Number.isInteger(requestIndex) || requestIndex < 0) {
    contractError("invalid_request_index", "request index must be a non-negative integer", 400);
  }
  if (requestIndex >= ORCHESTRA_NATIVE_DOGFOOD_REQUEST_COUNT) {
    contractError(
      "extra_request",
      "the native dogfood contract permits exactly five requests",
      409,
    );
  }
  const body = parseRequestBody(request.body);
  assertCommonRequest(request, requestIndex, body);
  [
    assertInitialParentRequest,
    assertChildRequest,
    assertParentWaitingFollowUp,
    assertResumeTurnRequest,
    assertResumeFollowUp,
  ][requestIndex](body);
  const events = requestIndex === 3 ? resumeToolEvents(body) : responseEvents[requestIndex];
  return Object.freeze({
    kind: ["parent_tool", "native_child", "parent_waiting", "resume_tool", "resume_final"][
      requestIndex
    ],
    statusCode: 200,
    headers: Object.freeze({ "content-type": "text/event-stream" }),
    events,
    body: buildNativeDogfoodSse(events),
  });
}

export function assertNativeDogfoodResponsesComplete(requestCount) {
  if (requestCount !== ORCHESTRA_NATIVE_DOGFOOD_REQUEST_COUNT) {
    contractError(
      "incomplete_sequence",
      `expected ${ORCHESTRA_NATIVE_DOGFOOD_REQUEST_COUNT} requests, received ${requestCount}`,
      408,
    );
  }
}
