import { Code2, Eye } from "lucide-react";

import { Toggle } from "~/components/ui/toggle";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";

export function FilePreviewModeToggle({
  rendered,
  onRenderedChange,
}: {
  readonly rendered: boolean;
  readonly onRenderedChange: (rendered: boolean) => void;
}) {
  const label = rendered ? "Show markdown source" : "Show rendered markdown";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Toggle
            aria-label={label}
            className="shrink-0"
            onPressedChange={onRenderedChange}
            pressed={rendered}
            size="sm"
            variant="ghost"
          >
            {rendered ? <Code2 className="size-3.5" /> : <Eye className="size-3.5" />}
          </Toggle>
        }
      />
      <TooltipPopup>{label}</TooltipPopup>
    </Tooltip>
  );
}
