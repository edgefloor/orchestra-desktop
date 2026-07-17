import * as Schema from "effect/Schema";

import { ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";

export const NATIVE_SUBAGENT_DETAIL_MAX_ITEMS = 24;
export const NATIVE_SUBAGENT_SUMMARY_MAX_CHARS = 320;

const NativeSubagentBoundedText = Schema.String.check(
  Schema.isMaxLength(NATIVE_SUBAGENT_SUMMARY_MAX_CHARS),
);

export const NativeSubagentStatus = Schema.Literals([
  "pending",
  "running",
  "waiting",
  "completed",
  "failed",
  "cancelled",
  "unavailable",
]);
export type NativeSubagentStatus = typeof NativeSubagentStatus.Type;

export const NativeSubagentReadInput = Schema.Struct({
  threadId: ThreadId,
  agentThreadId: TrimmedNonEmptyString,
});
export type NativeSubagentReadInput = typeof NativeSubagentReadInput.Type;

export const NativeSubagentDetailItem = Schema.Struct({
  id: TrimmedNonEmptyString,
  type: TrimmedNonEmptyString,
  summary: NativeSubagentBoundedText,
  status: Schema.optional(Schema.String),
});
export type NativeSubagentDetailItem = typeof NativeSubagentDetailItem.Type;

export const NativeSubagentDetail = Schema.Struct({
  parentTaskId: ThreadId,
  agentThreadId: TrimmedNonEmptyString,
  status: NativeSubagentStatus,
  nickname: Schema.NullOr(NativeSubagentBoundedText),
  role: Schema.NullOr(NativeSubagentBoundedText),
  preview: NativeSubagentBoundedText,
  updatedAt: Schema.String,
  items: Schema.Array(NativeSubagentDetailItem).check(
    Schema.isMaxLength(NATIVE_SUBAGENT_DETAIL_MAX_ITEMS),
  ),
  truncated: Schema.Boolean,
});
export type NativeSubagentDetail = typeof NativeSubagentDetail.Type;

export class NativeSubagentReadError extends Schema.TaggedErrorClass<NativeSubagentReadError>()(
  "NativeSubagentReadError",
  {
    message: TrimmedNonEmptyString,
    threadId: Schema.optional(ThreadId),
    agentThreadId: Schema.optional(TrimmedNonEmptyString),
    cause: Schema.optional(Schema.Defect()),
  },
) {}
