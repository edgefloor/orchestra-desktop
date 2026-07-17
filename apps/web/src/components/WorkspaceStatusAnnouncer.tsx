import { memo, useEffect, useRef, useState } from "react";

import {
  diffWorkspaceStatusSnapshots,
  type WorkspaceStatusAnnouncement,
  type WorkspaceStatusSnapshot,
} from "./WorkspaceStatusAnnouncer.logic";

export const WorkspaceStatusAnnouncer = memo(function WorkspaceStatusAnnouncer(props: {
  readonly snapshot: WorkspaceStatusSnapshot;
}) {
  const previousRef = useRef<WorkspaceStatusSnapshot | null>(null);
  const [announcement, setAnnouncement] = useState<WorkspaceStatusAnnouncement | null>(null);

  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = props.snapshot;
    if (!previous || previous.scopeKey !== props.snapshot.scopeKey) {
      setAnnouncement(null);
      return;
    }
    setAnnouncement(diffWorkspaceStatusSnapshots(previous, props.snapshot));
  }, [props.snapshot]);

  return (
    <div className="sr-only" data-workspace-status-announcer="">
      <div role="status" aria-live="polite" aria-atomic="true">
        {announcement?.politeness === "polite" ? announcement.text : ""}
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="true">
        {announcement?.politeness === "assertive" ? announcement.text : ""}
      </div>
    </div>
  );
});
