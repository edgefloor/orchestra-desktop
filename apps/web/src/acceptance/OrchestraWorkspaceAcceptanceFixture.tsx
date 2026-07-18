import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { BotIcon, CheckCircle2Icon, FolderGit2Icon, GitBranchIcon, SearchIcon } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { AutomationWorkspace } from "../components/chat/AutomationProfileDialog";
import { ChatComposerFrame } from "../components/chat/ChatComposerFrame";
import { TaskAttentionView } from "../components/chat/TaskAttentionView";
import { RightPanelSheet } from "../components/RightPanelSheet";
import { WorkspaceContextRail, WorkspaceTaskContextBar } from "../components/WorkspaceContextRail";
import { WorkspaceTaskTabs } from "../components/WorkspaceTaskTabs";
import { Button } from "../components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
} from "../components/ui/sidebar";

type AcceptanceState = "workspace" | "attention-sheet" | "symphony";

declare global {
  interface Window {
    __ORCHESTRA_ACCEPTANCE__?: Readonly<Record<string, boolean>>;
  }
}

const environmentId = EnvironmentId.make("acceptance-local");
const threadId = ThreadId.make("acceptance-task");

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
  if (state === "symphony") {
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
  return assertions;
}

export function OrchestraWorkspaceAcceptanceFixture({
  state,
}: {
  readonly state: AcceptanceState;
}) {
  useEffect(() => {
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
              active: state !== "symphony",
              status: "running",
              onSelect: () => undefined,
              onClose: () => undefined,
            },
            {
              key: "symphony",
              title: "Symphony · Complete desktop workspace",
              active: state === "symphony",
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
        {state === "symphony" ? (
          <AutomationWorkspace
            environmentId={environmentId}
            threadId={threadId}
            threadTitle="Complete desktop workspace"
            onClose={() => undefined}
            onOpenIssueTask={() => undefined}
          />
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
        </div>
      </SidebarInset>
      {state === "attention-sheet" ? (
        <RightPanelSheet open onClose={() => undefined}>
          <ContextRail variant="sheet" />
        </RightPanelSheet>
      ) : null}
    </SidebarProvider>
  );
}
