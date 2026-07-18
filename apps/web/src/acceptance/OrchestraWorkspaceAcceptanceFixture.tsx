import { EnvironmentId, ThreadId, type AutomationRunResult } from "@t3tools/contracts";
import { BotIcon, CheckCircle2Icon, FolderGit2Icon, GitBranchIcon, SearchIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { AutomationRunWorkspace } from "../components/chat/AutomationRunWorkspace";
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
  | "symphony-events"
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
    reconciliation: "complete",
    coordination: {
      cycle: 7,
      scanRevision: 12,
      inputCursor: "linear-11",
      outputCursor: "linear-12",
      intakeStatus: "ready",
      pageDigest: "page-12",
      startedAtMs: 1_789_000_000_000,
      completedAtMs: 1_789_000_000_500,
      nextAction: { text: "Poll Linear again when the native schedule is due.", truncated: false },
      dispatchIntent: {
        intentId: "intent-orc-70",
        claimId: "claim-orc-70",
        issueId: "issue-orc-70",
        kind: "new_claim",
        status: "completed",
        attempt: 1,
        profileDigest: "profile-acceptance",
        createdAtMs: 1_789_000_000_100,
        readyAtMs: 1_789_000_000_200,
      },
    },
    queueCounts: {
      queued: 1,
      running: 1,
      blocked: 0,
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
        trackerState: "In Progress",
        priority: 1,
        attempt: 1,
        workflowInvocations: 2,
        turnsInWindow: 6,
        continuationCount: 1,
        retryAttempt: 0,
        lastProgressAtMs: 1_789_000_001_000,
        profileDigest: "profile-acceptance",
        profileRevision: 3,
        status: "running",
        worktree: "/workspace/orchestra/.worktrees/orc-70",
        sourceRevision: "836962e4",
        issueTask: { threadId: "issue-task-orc-70", taskPath: "/root/automation_orc_70" },
        workflowRunId: "workflow-orc-70",
        workflowStatus: "running",
        effects: [],
        hookReceipts: [],
        cleanup: { status: "retained", attempts: 0 },
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
        state: "Todo",
        priority: 2,
        category: "queued",
        nextAction: { text: "Await the next bounded dispatch slot.", truncated: false },
      },
    ],
    queuePreviewTruncated: false,
    nextAction: { text: "Automation remains resident in the owner task.", truncated: false },
  },
};

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
          <Button size="sm">Send</Button>
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
  const symphonyView =
    state === "symphony-activity" ? "activity" : state === "symphony-events" ? "events" : "issues";
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
              active: !state.startsWith("symphony"),
              status: "running",
              onSelect: () => undefined,
              onClose: () => undefined,
            },
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
              <AutomationRunWorkspace
                initialView={symphonyView}
                onCancelClaim={(claimId) => {
                  window.__ORCHESTRA_ACCEPTANCE_ACTIONS__ = {
                    ...window.__ORCHESTRA_ACCEPTANCE_ACTIONS__,
                    cancelledClaimId: claimId,
                  };
                }}
                onInspectQueue={() => undefined}
                onOpenIssueTask={(input) => {
                  window.__ORCHESTRA_ACCEPTANCE_ACTIONS__ = {
                    ...window.__ORCHESTRA_ACCEPTANCE_ACTIONS__,
                    openedIssueId: input.issueId,
                  };
                }}
                onSteerClaim={() => undefined}
                onSteeringInputChange={() => undefined}
                pending={false}
                queueResult={null}
                queueOffset={0}
                runResult={acceptanceAutomationRun}
                steeringInputs={{}}
              />
            </div>
          </section>
        ) : null}
        <div className="flex min-h-0 flex-1">
          <main className="flex min-w-0 flex-1 flex-col">
            <Timeline />
            <Composer />
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
