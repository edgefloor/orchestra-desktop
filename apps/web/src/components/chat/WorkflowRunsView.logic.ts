import {
  OrchestraReplayEvent as OrchestraReplayEventSchema,
  type OrchestraReplayEvent,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";

import type { WorkLogEntry } from "../../session-logic";

export const MAX_WORKSPACE_WORKFLOW_RUNS = 12;

export interface WorkspaceWorkflowRun {
  readonly event: OrchestraReplayEvent;
  readonly updatedAt: string;
}

export interface WorkspaceWorkflowRunProjection {
  readonly items: ReadonlyArray<WorkspaceWorkflowRun>;
  readonly omitted: number;
}

const isOrchestraReplayEvent = Schema.is(OrchestraReplayEventSchema);

function eventIsNewer(candidate: OrchestraReplayEvent, current: OrchestraReplayEvent): boolean {
  if (candidate.revision !== current.revision) return candidate.revision > current.revision;
  return candidate.sequence > current.sequence;
}

export function deriveWorkspaceWorkflowRuns(
  workLogEntries: ReadonlyArray<WorkLogEntry>,
  limit = MAX_WORKSPACE_WORKFLOW_RUNS,
): WorkspaceWorkflowRunProjection {
  const latestByRunId = new Map<string, WorkspaceWorkflowRun>();

  for (const entry of workLogEntries) {
    if (!isOrchestraReplayEvent(entry.toolData)) continue;
    const event = entry.toolData;
    const current = latestByRunId.get(event.runId);
    if (!current || eventIsNewer(event, current.event)) {
      latestByRunId.set(event.runId, { event, updatedAt: entry.createdAt });
    }
  }

  const all = [...latestByRunId.values()].sort((left, right) => {
    const byTime = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    if (Number.isFinite(byTime) && byTime !== 0) return byTime;
    if (left.event.sequence !== right.event.sequence) {
      return left.event.sequence > right.event.sequence ? -1 : 1;
    }
    return left.event.runId.localeCompare(right.event.runId);
  });
  const boundedLimit = Math.max(0, limit);

  return {
    items: all.slice(0, boundedLimit),
    omitted: Math.max(0, all.length - boundedLimit),
  };
}
