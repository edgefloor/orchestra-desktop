import type { AutomationRunActionFeedback } from "./AutomationProfileDialog.logic";

export function AutomationRunActionFeedbackNotice({
  feedback,
}: {
  readonly feedback: AutomationRunActionFeedback | null;
}) {
  if (!feedback) return null;
  return (
    <div
      className={
        feedback.kind === "stale"
          ? "rounded-lg border border-amber-500/40 bg-amber-500/8 p-3 text-sm text-amber-700"
          : "rounded-lg border border-emerald-500/40 bg-emerald-500/8 p-3 text-sm text-emerald-700"
      }
      data-automation-action-feedback={feedback.kind}
      role={feedback.kind === "stale" ? "alert" : "status"}
    >
      {feedback.detail}
    </div>
  );
}
