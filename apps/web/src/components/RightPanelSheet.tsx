import { type ReactNode } from "react";

import { RIGHT_PANEL_SHEET_CLASS_NAME } from "../rightPanelLayout";
import { Sheet, SheetDescription, SheetPopup, SheetTitle } from "./ui/sheet";

export function RightPanelSheet(props: {
  children: ReactNode;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={props.open}
      onOpenChange={(open) => {
        if (!open) {
          props.onClose();
        }
      }}
    >
      <SheetPopup
        side="right"
        showCloseButton={false}
        keepMounted
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
