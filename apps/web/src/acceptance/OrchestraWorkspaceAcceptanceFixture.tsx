import { EnvironmentId, ThreadId, type AutomationRunResult } from "@t3tools/contracts";
import { BotIcon, CheckCircle2Icon, FolderGit2Icon, GitBranchIcon, SearchIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { AutomationRunWorkspace } from "../components/chat/AutomationRunWorkspace";
import { AutomationRunActionFeedbackNotice } from "../components/chat/AutomationRunActionFeedback";
import { AutomationIssueTaskFrame } from "../components/chat/AutomationIssueTaskFrame";
import { AutomationIssueWorkspacePresentation } from "../components/chat/AutomationIssueWorkspace";
import { selectExactAutomationIssueSnapshot } from "../components/chat/AutomationIssueWorkspace.logic";
import type { AutomationRunActionFeedback } from "../components/chat/AutomationProfileDialog.logic";
import { ChatComposerFrame } from "../components/chat/ChatComposerFrame";
import { TaskAttentionView } from "../components/chat/TaskAttentionView";
import { RightPanelSheet } from "../components/RightPanelSheet";
import { WorkspaceContextRail, WorkspaceTaskContextBar } from "../components/WorkspaceContextRail";
import { WorkspaceTaskTabs } from "../components/WorkspaceTaskTabs";
import { Button } from "../components/ui/button";
import { BrowserPreviewAcceptanceSurface } from "./BrowserPreviewAcceptanceSurface";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
} from "../components/ui/sidebar";

type AcceptanceState =
  | "workspace"
  | "attention-sheet"
  | "symphony"
  | "symphony-activity"
  | "symphony-recovery"
  | "symphony-events"
  | "selected-issue"
  | "browser-preview"
  | "browser-preview-narrow"
  | "file-preview";

declare global {
  interface Window {
    __ORCHESTRA_ACCEPTANCE__?: Readonly<Record<string, boolean>>;
    __ORCHESTRA_ACCEPTANCE_ACTIONS__?: Readonly<Record<string, string>>;
  }
}

const environmentId = EnvironmentId.make("acceptance-local");
const threadId = ThreadId.make("acceptance-task");
const issueTaskThreadId = ThreadId.make("issue-task-orc-70");
const acceptanceAutomationRun: AutomationRunResult = {
  run: {
    schemaVersion: 1,
    runId: "automation-acceptance",
    ownerThreadId: threadId,
    sourceRevision: "836962e4",
    profileDigest: "profile-acceptance",
    profileRevision: 3,
    profileRevisionStatus: "active",
    profileDiagnostics: [],
    trackerProjectSlug: "orchestra-core",
    leaseEpoch: 2,
    revision: 19,
    status: "running",
    reconciliation: "required",
    coordination: {
      cycle: 7,
      scanRevision: 12,
      inputCursor: "linear-11",
      outputCursor: "linear-12",
      intakeStatus: "ready",
      error: { text: "Linear refresh failed before native dispatch.", truncated: false },
      pageDigest: "page-12",
      startedAtMs: 1_789_000_000_000,
      completedAtMs: 1_789_000_000_500,
      nextAction: { text: "Poll Linear again when the native schedule is due.", truncated: false },
      dispatchIntent: {
        intentId: "intent-orc-70",
        claimId: "claim-orc-70",
        issueId: "issue-orc-70",
        kind: "new_claim",
        status: "started",
        attempt: 1,
        profileDigest: "profile-acceptance",
        createdAtMs: 1_789_000_000_100,
        readyAtMs: 1_789_000_000_200,
      },
    },
    queueCounts: {
      queued: 1,
      running: 1,
      blocked: 1,
      waitingGate: 0,
      handoff: 0,
      terminal: 3,
    },
    claimsTotal: 1,
    claims: [
      {
        claimId: "claim-orc-70",
        issueId: "issue-orc-70",
        issueIdentifier: "ORC-70",
        issueTitle: { text: "Complete the Symphony workspace", truncated: false },
        issueUrl: "https://linear.app/demystify/issue/ORC-70/complete-the-symphony-workspace",
        trackerState: "In Progress",
        priority: 1,
        attempt: 1,
        workflowInvocations: 2,
        turnsInWindow: 6,
        continuationCount: 1,
        retryAttempt: 1,
        scheduledRetry: {
          kind: "retry",
          readyAtMs: 1_789_000_002_000,
          resetTurnWindow: true,
        },
        lastProgressAtMs: 1_789_000_001_000,
        profileDigest: "profile-acceptance",
        profileRevision: 3,
        status: "running",
        worktree: "/workspace/orchestra/.worktrees/orc-70",
        sourceRevision: "836962e4",
        issueTask: { threadId: issueTaskThreadId, taskPath: "/root/automation_orc_70" },
        workflowRunId: "workflow-orc-70",
        workflowStatus: "running",
        latestSteeringReceipt: {
          sequence: 2,
          submittedAtMs: 1_789_000_001_100,
          initiatorThreadId: threadId,
          targetThreadId: issueTaskThreadId,
          authority: "automation-claim-native-send-input-v1",
          inputSha256: "guidance-orc-70",
          inputPreview: "Keep the selected issue context grounded in native receipts.",
          status: "delivered",
        },
        effects: [
          {
            effectId: "effect-orc-70-transition",
            idempotencyKey: "effect-orc-70-transition-key",
            kind: "tracker.transition",
            status: "ambiguous",
            gatePolicy: "auto_accept",
            requestSha256: "effect-orc-70-transition-request",
            bodyPreview: { text: "Move ORC-70 to Done", truncated: false },
            failure: { text: "Provider receipt is ambiguous.", truncated: false },
          },
          {
            effectId: "effect-orc-70-comment",
            idempotencyKey: "effect-orc-70-comment-key",
            kind: "tracker.comment",
            status: "waiting_gate",
            gatePolicy: "ask_human",
            requestSha256: "effect-orc-70-comment-request",
            bodyPreview: {
              text: "Publish the verified selected-Issue acceptance receipt.",
              truncated: false,
            },
          },
          {
            effectId: "effect-orc-70-cleanup",
            idempotencyKey: "effect-orc-70-cleanup-key",
            kind: "tracker.link_pull_request",
            status: "waiting_gate",
            gatePolicy: "auto_accept",
            requestSha256: "effect-orc-70-cleanup-request",
            bodyPreview: { text: "Retain cleanup until verification completes.", truncated: false },
          },
        ],
        hookReceipts: [
          {
            kind: "after_run",
            invocation: 1,
            status: "failed",
            exitCode: 1,
            stdoutPreview: { text: "", truncated: false },
            stderrPreview: { text: "Verification hook failed.", truncated: false },
          },
        ],
        cleanup: {
          status: "retry_pending",
          attempts: 2,
          lastFailure: { text: "Worktree is still in use.", truncated: false },
        },
        nextAction: {
          text: "Verify the desktop workspace and publish evidence.",
          truncated: false,
        },
      },
    ],
    queuePreview: [
      {
        issueId: "issue-orc-71",
        issueIdentifier: "ORC-71",
        issueTitle: { text: "Exercise durable recovery", truncated: false },
        state: "Blocked",
        priority: 2,
        category: "blocked",
        nextAction: { text: "Inspect tracker blockers before dispatch.", truncated: false },
        blockedBy: [
          {
            id: { text: "issue-orc-69", truncated: false },
            identifier: { text: "ORC-69", truncated: false },
            state: { text: "In Progress", truncated: false },
          },
        ],
      },
    ],
    queuePreviewTruncated: false,
    nextAction: { text: "Automation remains resident in the owner task.", truncated: false },
  },
};

const acceptanceIssueSnapshot = selectExactAutomationIssueSnapshot(acceptanceAutomationRun, {
  routeThreadId: threadId,
  automationOwnerThreadId: acceptanceAutomationRun.run.ownerThreadId,
  automationRunId: acceptanceAutomationRun.run.runId,
  issueId: "issue-orc-70",
  issueTaskThreadId,
});

if (!acceptanceIssueSnapshot) {
  throw new Error("The deterministic acceptance Run must contain the exact ORC-70 issue task");
}

function StaticSidebar() {
  return (
    <Sidebar collapsible="none" className="border-r border-border">
      <SidebarHeader className="gap-3 border-b border-border p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            O
          </span>
          Orchestra
        </div>
        <div className="flex h-8 items-center gap-2 rounded-lg border bg-background px-2 text-xs text-muted-foreground">
          <SearchIcon className="size-3.5" /> Search tasks
        </div>
      </SidebarHeader>
      <SidebarContent className="p-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Projects
        </div>
        <button
          className="flex w-full items-center gap-2 rounded-lg bg-sidebar-accent px-2 py-2 text-left text-sm font-medium"
          type="button"
        >
          <FolderGit2Icon className="size-4 text-primary" /> orchestra
        </button>
        <div className="mt-5 mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Active tasks
        </div>
        {[
          ["Complete desktop workspace", "Running"],
          ["Package macOS acceptance", "Attention"],
          ["Harden Symphony recovery", "Idle"],
        ].map(([title, status]) => (
          <div key={title} className="mb-1 rounded-lg px-2 py-2 text-xs hover:bg-sidebar-accent">
            <div className="truncate text-foreground">{title}</div>
            <div className="mt-1 text-[10px] text-muted-foreground">{status}</div>
          </div>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}

function Timeline() {
  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-8"
      data-acceptance-active-task=""
    >
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <GitBranchIcon className="size-4" /> Native task · codex/orchestra-bootstrap
        </div>
        <div className="ml-auto max-w-[82%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm text-primary-foreground">
          Complete the standalone desktop workspace and preserve every retained coding surface.
        </div>
        <div className="rounded-xl border bg-card/65 p-4 shadow-xs">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <BotIcon className="size-4 text-primary" /> Orchestra
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            The task-owned workspace is connected. Child work, Workflow evidence, Symphony issues,
            files, diff, Preview, and terminals retain native authority.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {["12 typed surfaces", "1,405 tests", "Standalone forks"].map((label) => (
              <div
                key={label}
                className="flex items-center gap-2 rounded-lg border bg-background/70 px-3 py-2 text-xs"
              >
                <CheckCircle2Icon className="size-3.5 text-success" /> {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Composer() {
  return (
    <div className="shrink-0 px-4 pb-4 sm:px-8" data-acceptance-composer="">
      <ChatComposerFrame surfaceClassName="border-border bg-background/90 shadow-lg">
        <div className="min-h-20 px-4 py-3 text-sm text-muted-foreground">
          Ask Orchestra to continue the active task…
        </div>
        <div
          className="flex items-center justify-between border-t border-border/70 px-3 py-2"
          data-chat-composer-footer="true"
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-md bg-muted px-2 py-1">Codex</span>
            <span>Workspace write</span>
          </div>
          <Button aria-label="Send task message" size="sm">
            Send
          </Button>
        </div>
      </ChatComposerFrame>
    </div>
  );
}

function AttentionContent() {
  return (
    <TaskAttentionView
      environmentId={environmentId}
      threadId={threadId}
      runtimeRevisionKey="acceptance"
      approvals={[]}
      pendingUserInputs={[]}
      actionableProposedPlan={null}
      workLogEntries={[]}
      providerError="Provider reconnect requires review before this task can continue."
      respondingRequestIds={[]}
      onRespondToApproval={async () => undefined}
      onReviewComposer={() => undefined}
      onOpenPlanWorkspace={() => undefined}
      onOpenWorkflowWorkspace={() => undefined}
      onOpenAutomationWorkspace={() => undefined}
    />
  );
}

function ContextRail(props: {
  readonly variant?: "rail" | "sheet";
  readonly children?: ReactNode;
}) {
  return (
    <WorkspaceContextRail
      activeView="attention"
      {...(props.variant ? { variant: props.variant } : {})}
      onClose={() => undefined}
      subagents={<div />}
      workflow={<div />}
      attention={props.children ?? <AttentionContent />}
    />
  );
}

function semanticAssertions(state: AcceptanceState): Readonly<Record<string, boolean>> {
  const root = document.documentElement;
  const narrow = window.innerWidth <= 1024;
  const symphony = document.querySelector<HTMLElement>("[data-automation-workspace]");
  const symphonyScroll = document.querySelector<HTMLElement>("[data-automation-workspace-scroll]");
  const assertions: Record<string, boolean> = {
    activeTaskVisible: document.querySelector("[data-acceptance-active-task]") !== null,
    composerVisible: document.querySelector("[data-acceptance-composer]") !== null,
    contextTabsReachable: document.querySelector('[aria-label="Task context"]') !== null,
    noDocumentHorizontalOverflow: root.scrollWidth <= window.innerWidth,
    rootWidthMatchesViewport: root.getBoundingClientRect().width === window.innerWidth,
    taskTabsReachable: document.querySelector('[aria-label="Open tasks"]') !== null,
    ...(narrow ? { narrowLayoutActive: true } : { wideLayoutActive: true }),
  };
  if (state === "attention-sheet") {
    Object.assign(assertions, {
      attentionItemsPresent: document.querySelector('[aria-label="Task attention"]') !== null,
      attentionPanelVisible: document.querySelector("[data-workspace-context-rail]") !== null,
      contextSheetLabelled: Boolean(
        [...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-labelledby]')].some(
          (dialog) => dialog.textContent?.includes("Workspace panel"),
        ),
      ),
      contextSheetVisible:
        document.querySelector('[data-workspace-context-variant="sheet"]') !== null,
    });
  }
  if (state.startsWith("symphony")) {
    const maximumHeight = Math.min(window.innerHeight * 0.58, 44 * 16);
    Object.assign(assertions, {
      symphonyHeightBounded: Boolean(
        symphony && symphony.getBoundingClientRect().height <= maximumHeight + 1,
      ),
      symphonyScrollsInternally: Boolean(
        symphonyScroll && getComputedStyle(symphonyScroll).overflowY === "auto",
      ),
      symphonyWorkspaceVisible: Boolean(symphony),
    });
  }
  if (state.startsWith("browser-preview")) {
    Object.assign(assertions, {
      browserPreviewVisible:
        document.querySelector('[aria-label="Task Browser and Preview"]') !== null,
      browserPreviewTablistVisible:
        document.querySelector('[aria-label="Open panel surfaces"]') !== null,
      browserPreviewChromeVisible: document.querySelector("[data-preview-url-input]") !== null,
      browserPreviewTaskAssociated:
        document.querySelector('[data-task-association="acceptance-task"]') !== null,
      browserPreviewResponsiveMode:
        document
          .querySelector("[data-preview-panel-mode]")
          ?.getAttribute("data-preview-panel-mode") ===
        (state === "browser-preview-narrow" ? "sheet" : "inline"),
    });
  }
  if (state === "file-preview") {
    Object.assign(assertions, {
      filePreviewVisible: document.querySelector('[aria-label="README.md Preview"]') !== null,
      filePreviewActionVisible:
        document.querySelector('[aria-label="Show rendered markdown"]') !== null,
      filePreviewTaskAssociated:
        document.querySelector('[data-task-association="acceptance-task"]') !== null,
      filePreviewResponsiveMode:
        document
          .querySelector("[data-preview-panel-mode]")
          ?.getAttribute("data-preview-panel-mode") === "inline",
    });
  }
  return assertions;
}

export function OrchestraWorkspaceAcceptanceFixture({
  state,
}: {
  readonly state: AcceptanceState;
}) {
  const openBrowserPreviewButtonRef = useRef<HTMLButtonElement>(null);
  const [browserPreviewSheetOpen, setBrowserPreviewSheetOpen] = useState(true);
  const [automationFeedback, setAutomationFeedback] = useState<AutomationRunActionFeedback | null>(
    null,
  );
  const [selectedIssueOpen, setSelectedIssueOpen] = useState(false);
  const [issueGuidance, setIssueGuidance] = useState("");
  const recoveryScenario = state === "symphony-recovery";
  const automationRunResult: AutomationRunResult = recoveryScenario
    ? {
        run: {
          ...acceptanceAutomationRun.run,
          status: "suspended",
        },
      }
    : acceptanceAutomationRun;
  const symphonyView =
    state === "symphony-activity"
      ? "activity"
      : state === "symphony-recovery"
        ? "recovery"
        : state === "symphony-events"
          ? "events"
          : "issues";
  useEffect(() => {
    window.__ORCHESTRA_ACCEPTANCE_ACTIONS__ = {};
    let cancelled = false;
    void document.fonts.ready.then(() => {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (cancelled) return;
          window.__ORCHESTRA_ACCEPTANCE__ = semanticAssertions(state);
          document.documentElement.dataset.acceptanceReady = "true";
        }),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [state]);

  return (
    <SidebarProvider className="h-svh min-h-0 overflow-hidden bg-background">
      <StaticSidebar />
      <SidebarInset className="min-w-0 overflow-hidden">
        <WorkspaceTaskTabs
          tabs={[
            { key: "overview", title: "Overview", active: false, onSelect: () => undefined },
            {
              key: "task",
              title: "Complete desktop workspace",
              active: !state.startsWith("symphony") && state !== "selected-issue",
              status: "running",
              onSelect: () => undefined,
              onClose: () => undefined,
            },
            ...(state === "selected-issue"
              ? [
                  {
                    key: "issue-orc-70",
                    title: "ORC-70 · Complete the Symphony workspace",
                    active: selectedIssueOpen,
                    status: "running" as const,
                    onSelect: () => setSelectedIssueOpen(true),
                    onClose: () => undefined,
                  },
                ]
              : []),
            {
              key: "symphony",
              title: "Symphony · Complete desktop workspace",
              active: state.startsWith("symphony"),
              onSelect: () => undefined,
              onClose: () => undefined,
            },
          ]}
          onNewTask={() => undefined}
        />
        <WorkspaceTaskContextBar
          projectName="orchestra"
          workspaceRoot="/workspace/orchestra"
          activeView={state === "attention-sheet" ? "attention" : null}
          onSelectView={() => undefined}
        />
        {state === "selected-issue" && !selectedIssueOpen ? (
          <div className="shrink-0 border-b border-border px-6 py-3">
            <Button
              aria-label="Open ORC-70 issue workspace"
              onClick={() => {
                setSelectedIssueOpen(true);
                window.__ORCHESTRA_ACCEPTANCE_ACTIONS__ = {
                  ...window.__ORCHESTRA_ACCEPTANCE_ACTIONS__,
                  openedIssueId: "issue-orc-70",
                };
              }}
              size="sm"
              variant="outline"
            >
              Open ORC-70 issue
            </Button>
          </div>
        ) : null}
        {state.startsWith("symphony") ? (
          <section
            aria-label="Symphony automation workspace"
            className="flex h-[min(58vh,44rem)] max-h-[min(58vh,44rem)] shrink-0 flex-col border-b border-border bg-card/55"
            data-automation-workspace=""
          >
            <header className="border-b border-border px-6 py-3">
              <div className="text-sm font-semibold">Symphony automation</div>
              <p className="text-xs text-muted-foreground">
                Task-scoped native automation for Complete desktop workspace.
              </p>
            </header>
            <div
              className="min-h-0 flex-1 overflow-y-auto px-6 py-4"
              data-automation-workspace-scroll=""
            >
              <AutomationRunActionFeedbackNotice feedback={automationFeedback} />
              <AutomationRunWorkspace
                initialView={symphonyView}
                onCancelClaim={(claimId) => {
                  window.__ORCHESTRA_ACCEPTANCE_ACTIONS__ = {
                    ...window.__ORCHESTRA_ACCEPTANCE_ACTIONS__,
                    cancelledClaimId: claimId,
                  };
                }}
                onInspectQueue={() => undefined}
                onInspectRun={() => {
                  window.__ORCHESTRA_ACCEPTANCE_ACTIONS__ = {
                    ...window.__ORCHESTRA_ACCEPTANCE_ACTIONS__,
                    inspectedRunId: acceptanceAutomationRun.run.runId,
                  };
                  setAutomationFeedback({
                    kind: "accepted",
                    action: "Inspect",
                    detail: "Inspect accepted native Run revision 19 under lease 2.",
                  });
                }}
                onOpenIssueTask={(input) => {
                  window.__ORCHESTRA_ACCEPTANCE_ACTIONS__ = {
                    ...window.__ORCHESTRA_ACCEPTANCE_ACTIONS__,
                    openedIssueId: input.issueId,
                  };
                }}
                onRefreshRun={() => {
                  window.__ORCHESTRA_ACCEPTANCE_ACTIONS__ = {
                    ...window.__ORCHESTRA_ACCEPTANCE_ACTIONS__,
                    refreshedRunId: acceptanceAutomationRun.run.runId,
                  };
                  setAutomationFeedback({
                    kind: "accepted",
                    action: "Refresh",
                    detail: "Refresh accepted native Run revision 20 under lease 2.",
                  });
                }}
                onResumeRun={() => {
                  window.__ORCHESTRA_ACCEPTANCE_ACTIONS__ = {
                    ...window.__ORCHESTRA_ACCEPTANCE_ACTIONS__,
                    resumedRunId: acceptanceAutomationRun.run.runId,
                  };
                  setAutomationFeedback({
                    kind: "stale",
                    action: "Resume",
                    detail: "Resume failed. Retained Run revision 19 may be stale.",
                  });
                }}
                onSteerClaim={() => undefined}
                onSteeringInputChange={() => undefined}
                pending={false}
                queueResult={null}
                queueOffset={0}
                runResult={automationRunResult}
                steeringInputs={{}}
              />
            </div>
          </section>
        ) : null}
        {state === "selected-issue" && selectedIssueOpen ? (
          <AutomationIssueWorkspacePresentation
            error={null}
            fallbackIdentifier="Issue issue-orc-70"
            fallbackTitle="Complete the Symphony workspace"
            guidance={issueGuidance}
            onGuidanceChange={setIssueGuidance}
            onOpenDiff={() => {
              window.__ORCHESTRA_ACCEPTANCE_ACTIONS__ = {
                ...window.__ORCHESTRA_ACCEPTANCE_ACTIONS__,
                diffIssueId: "issue-orc-70",
              };
            }}
            onOpenSymphony={() => {
              window.__ORCHESTRA_ACCEPTANCE_ACTIONS__ = {
                ...window.__ORCHESTRA_ACCEPTANCE_ACTIONS__,
                parentRunId: acceptanceAutomationRun.run.runId,
              };
            }}
            onOpenTracker={() => {
              window.__ORCHESTRA_ACCEPTANCE_ACTIONS__ = {
                ...window.__ORCHESTRA_ACCEPTANCE_ACTIONS__,
                trackerUrl: acceptanceAutomationRun.run.claims[0]?.issueUrl ?? "",
              };
            }}
            onRefresh={() => undefined}
            onSendGuidance={() => {
              window.__ORCHESTRA_ACCEPTANCE_ACTIONS__ = {
                ...window.__ORCHESTRA_ACCEPTANCE_ACTIONS__,
                issueGuidance: issueGuidance.trim(),
              };
              setIssueGuidance("");
            }}
            pending={false}
            runtimeState="ready"
            snapshot={acceptanceIssueSnapshot}
          />
        ) : null}
        <div className="flex min-h-0 flex-1">
          <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {state === "selected-issue" && selectedIssueOpen ? (
              <AutomationIssueTaskFrame
                activity={<Timeline />}
                composer={<Composer />}
                issueActivity={<Timeline />}
                issueActive
              />
            ) : (
              <>
                <Timeline />
                <Composer />
              </>
            )}
          </main>
          {state === "workspace" && window.innerWidth > 1024 ? (
            <ContextRail>
              <div className="space-y-3 p-1 text-sm text-muted-foreground">
                <div className="font-semibold text-foreground">Task context</div>
                <p>Subagents, Workflow, and Attention stay attached to this native task.</p>
              </div>
            </ContextRail>
          ) : null}
          {state === "browser-preview" || state === "file-preview" ? (
            <BrowserPreviewAcceptanceSurface
              initialSurface={state === "file-preview" ? "file" : "browser"}
              mode="inline"
            />
          ) : null}
        </div>
      </SidebarInset>
      {state === "attention-sheet" ? (
        <RightPanelSheet open onClose={() => undefined}>
          <ContextRail variant="sheet" />
        </RightPanelSheet>
      ) : null}
      {state === "browser-preview-narrow" ? (
        <>
          <Button
            ref={openBrowserPreviewButtonRef}
            aria-label="Open Browser and Preview"
            className="fixed bottom-4 right-4 z-40"
            onClick={() => {
              setBrowserPreviewSheetOpen(true);
              window.__ORCHESTRA_ACCEPTANCE_ACTIONS__ = {
                ...window.__ORCHESTRA_ACCEPTANCE_ACTIONS__,
                sheetReopened: "true",
              };
            }}
            size="sm"
            variant="outline"
          >
            Open Browser and Preview
          </Button>
          <RightPanelSheet
            open={browserPreviewSheetOpen}
            onClose={() => {
              setBrowserPreviewSheetOpen(false);
              requestAnimationFrame(() => openBrowserPreviewButtonRef.current?.focus());
              window.__ORCHESTRA_ACCEPTANCE_ACTIONS__ = {
                ...window.__ORCHESTRA_ACCEPTANCE_ACTIONS__,
                sheetClosed: "true",
              };
            }}
          >
            <BrowserPreviewAcceptanceSurface mode="sheet" />
          </RightPanelSheet>
        </>
      ) : null}
    </SidebarProvider>
  );
}
