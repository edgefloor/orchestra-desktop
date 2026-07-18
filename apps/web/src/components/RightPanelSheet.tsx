import { type ReactNode } from "react";

import { RIGHT_PANEL_SHEET_CLASS_NAME } from "../rightPanelLayout";
import { Sheet, SheetDescription, SheetPopup, SheetTitle } from "./ui/sheet";

export const RIGHT_PANEL_TOGGLE_ID = "workspace-right-panel-toggle";

export function RightPanelSheet(props: {
  children: ReactNode;
  open: boolean;
  onClose: () => void;
  returnFocusId?: string;
}) {
  return (
    <Sheet
      open={props.open}
      onOpenChange={(open) => {
        if (!open) {
          props.onClose();
          const returnFocusId = props.returnFocusId;
          if (returnFocusId) {
            requestAnimationFrame(() => document.getElementById(returnFocusId)?.focus());
          }
        }
      }}
    >
      <SheetPopup
        side="right"
        showCloseButton={false}
        keepMounted
        finalFocus={props.returnFocusId ? false : undefined}
        className={RIGHT_PANEL_SHEET_CLASS_NAME}
      >
        <SheetTitle className="sr-only">Workspace panel</SheetTitle>
        <SheetDescription className="sr-only">
          Contextual workspace tools and task information.
        </SheetDescription>
        {props.children}
      </SheetPopup>
    </Sheet>
  );
}
