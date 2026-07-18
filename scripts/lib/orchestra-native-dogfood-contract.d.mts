export const ORCHESTRA_NATIVE_DOGFOOD_WORKFLOW_PATH: string;
export const ORCHESTRA_NATIVE_DOGFOOD_SYMPHONY_WORKFLOW_PATH: string;
export const ORCHESTRA_NATIVE_DOGFOOD_PROFILE_PATH: string;
export const ORCHESTRA_NATIVE_DOGFOOD_PARENT_PROMPT: string;
export const ORCHESTRA_NATIVE_DOGFOOD_RESUME_PROMPT: string;
export const ORCHESTRA_NATIVE_DOGFOOD_CHILD_PROMPT: string;
export const ORCHESTRA_NATIVE_DOGFOOD_CHILD_FINDING: string;
export const ORCHESTRA_NATIVE_DOGFOOD_CALL_ID: string;
export const ORCHESTRA_NATIVE_DOGFOOD_RESUME_CALL_ID: string;
export const ORCHESTRA_NATIVE_DOGFOOD_REQUEST_COUNT: number;
export const ORCHESTRA_NATIVE_DOGFOOD_MAX_REQUEST_BYTES: number;
export const ORCHESTRA_NATIVE_DOGFOOD_CHECK_STEP_ID: string;
export const ORCHESTRA_NATIVE_DOGFOOD_CHECK_EVIDENCE_NAME: string;
export const ORCHESTRA_NATIVE_DOGFOOD_CHECK_EVIDENCE_RELATIVE_PATH: string;
export const ORCHESTRA_NATIVE_DOGFOOD_FINAL_ASSISTANT_TEXT: string;

export class NativeDogfoodContractError extends Error {
  readonly code: string;
  readonly statusCode: number;
}

export interface NativeDogfoodFixture {
  readonly repositoryFiles: Readonly<Record<string, string>>;
  readonly codexHomeFiles: Readonly<Record<string, string>>;
  readonly missingCredentialEnvironmentVariable: string;
}

export interface NativeDogfoodModelRequest {
  readonly method: string;
  readonly pathname: string;
  readonly contentEncoding?: string;
  readonly body: string | Uint8Array | Readonly<Record<string, unknown>>;
}

export interface NativeDogfoodModelResponse {
  readonly kind: "parent_tool" | "native_child" | "parent_waiting" | "resume_tool" | "resume_final";
  readonly statusCode: 200;
  readonly headers: Readonly<Record<string, string>>;
  readonly events: ReadonlyArray<Readonly<Record<string, unknown>>>;
  readonly body: string;
}

export function buildNativeDogfoodFixtures(responsesOrigin: string): NativeDogfoodFixture;
export function buildNativeDogfoodSse(
  events: ReadonlyArray<Readonly<Record<string, unknown>>>,
): string;
export function matchNativeDogfoodResponsesRequest(
  requestIndex: number,
  request: NativeDogfoodModelRequest,
): NativeDogfoodModelResponse;
export function assertNativeDogfoodResponsesComplete(requestCount: number): void;
