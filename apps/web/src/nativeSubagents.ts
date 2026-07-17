import type { NativeSubagentStatus, OrchestrationThreadActivity } from "@t3tools/contracts";

export const MAX_NATIVE_SUBAGENT_SUMMARIES = 8;
const MAX_RECENT_ACTIVITY = 3;
const MAX_ACTIVITY_CHARS = 200;

export interface NativeSubagentSummary {
  readonly agentThreadId: string;
  readonly agentPath: string | null;
  readonly status: NativeSubagentStatus;
  readonly recentActivity: readonly string[];
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function boundedActivity(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  return normalized.length <= MAX_ACTIVITY_CHARS
    ? normalized
    : `${normalized.slice(0, MAX_ACTIVITY_CHARS - 1)}…`;
}

function status(value: unknown, fallback: NativeSubagentStatus): NativeSubagentStatus {
  switch (value) {
    case "pendingInit":
      return "pending";
    case "running":
      return "running";
    case "completed":
      return "completed";
    case "errored":
      return "failed";
    case "interrupted":
    case "shutdown":
      return "cancelled";
    case "notFound":
      return "unavailable";
    default:
      return fallback;
  }
}

function lifecycleFallback(value: unknown): NativeSubagentStatus {
  switch (value) {
    case "failed":
      return "failed";
    case "completed":
      return "completed";
    default:
      return "running";
  }
}

export function deriveNativeSubagents(activities: ReadonlyArray<OrchestrationThreadActivity>): {
  readonly agents: NativeSubagentSummary[];
  readonly truncated: boolean;
} {
  const byId = new Map<string, NativeSubagentSummary>();
  for (const activity of activities) {
    const payload = record(activity.payload);
    const data = record(payload?.data);
    const item = record(data?.item);
    if (!item) continue;

    if (item.type === "collabAgentToolCall") {
      const receiverThreadIds = Array.isArray(item.receiverThreadIds)
        ? item.receiverThreadIds.filter((value): value is string => typeof value === "string")
        : [];
      const agentStates = record(item.agentsStates);
      for (const agentThreadId of receiverThreadIds) {
        const previous = byId.get(agentThreadId);
        const agentState = record(agentStates?.[agentThreadId]);
        const nextActivity =
          boundedActivity(agentState?.message) ??
          boundedActivity(item.prompt) ??
          boundedActivity(payload?.detail) ??
          boundedActivity(activity.summary);
        const recentActivity = [...(previous?.recentActivity ?? [])];
        if (nextActivity && recentActivity.at(-1) !== nextActivity) {
          recentActivity.push(nextActivity);
        }
        byId.set(agentThreadId, {
          agentThreadId,
          agentPath: previous?.agentPath ?? null,
          status: status(agentState?.status, lifecycleFallback(payload?.status)),
          recentActivity: recentActivity.slice(-MAX_RECENT_ACTIVITY),
        });
      }
      continue;
    }

    if (item.type === "subAgentActivity" && typeof item.agentThreadId === "string") {
      const previous = byId.get(item.agentThreadId);
      const nextActivity = boundedActivity(
        `${String(item.agentPath ?? "Subagent")} · ${String(item.kind ?? "activity")}`,
      );
      const recentActivity = [...(previous?.recentActivity ?? [])];
      if (nextActivity && recentActivity.at(-1) !== nextActivity) recentActivity.push(nextActivity);
      byId.set(item.agentThreadId, {
        agentThreadId: item.agentThreadId,
        agentPath:
          typeof item.agentPath === "string" ? item.agentPath : (previous?.agentPath ?? null),
        status: item.kind === "interrupted" ? "cancelled" : (previous?.status ?? "running"),
        recentActivity: recentActivity.slice(-MAX_RECENT_ACTIVITY),
      });
    }
  }

  const allAgents = [...byId.values()];
  return {
    agents: allAgents.slice(-MAX_NATIVE_SUBAGENT_SUMMARIES),
    truncated: allAgents.length > MAX_NATIVE_SUBAGENT_SUMMARIES,
  };
}
