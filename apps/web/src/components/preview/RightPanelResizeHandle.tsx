import type { KeyboardEvent } from "react";
import type { ResizableWidthHandlers } from "~/hooks/useResizableWidth";
import { cn } from "~/lib/utils";
import { resolveResizeSeparatorKey } from "../resizeSeparator";

interface Props {
  handlers: ResizableWidthHandlers;
  width: number;
  minWidth: number;
  maxWidth: number;
  onWidthChange: (width: number) => void;
  className?: string;
}

/**
 * Hit target for resizing a right-anchored panel via its left edge.
 *
 * - Sits on top of the panel's border with a 4px overlap on each side so the
 *   user can grab a few pixels off the edge without aiming.
 * - Visual indicator is a 1px line that lights up on hover/active to mirror
 *   VS Code / Cursor.
 */
export function RightPanelResizeHandle({
  handlers,
  width,
  minWidth,
  maxWidth,
  onWidthChange,
  className,
}: Props) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const nextWidth = resolveResizeSeparatorKey({
      key: event.key,
      value: width,
      min: minWidth,
      max: maxWidth,
      // The panel is right-anchored, so moving its left edge left makes it wider.
      increaseKey: "ArrowLeft",
      decreaseKey: "ArrowRight",
    });
    if (nextWidth === null) return;
    event.preventDefault();
    event.stopPropagation();
    onWidthChange(nextWidth);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize right panel"
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      aria-valuenow={width}
      aria-valuetext={`${width} pixels`}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={cn(
        "group absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        className,
      )}
      {...handlers}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors duration-150 group-hover:bg-border group-active:bg-primary/60 group-focus-visible:bg-primary"
      />
    </div>
  );
}
