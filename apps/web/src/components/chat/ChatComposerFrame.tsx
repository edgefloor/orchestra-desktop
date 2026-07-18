import type {
  DragEventHandler,
  FocusEventHandler,
  FormEventHandler,
  PropsWithChildren,
  Ref,
} from "react";

import { cn } from "~/lib/utils";

export interface ChatComposerFrameProps extends PropsWithChildren {
  readonly formRef?: Ref<HTMLFormElement>;
  readonly surfaceRef?: Ref<HTMLDivElement>;
  readonly onSubmit?: FormEventHandler<HTMLFormElement>;
  readonly onDragEnter?: DragEventHandler<HTMLDivElement>;
  readonly onDragOver?: DragEventHandler<HTMLDivElement>;
  readonly onDragLeave?: DragEventHandler<HTMLDivElement>;
  readonly onDrop?: DragEventHandler<HTMLDivElement>;
  readonly onFocusCapture?: FocusEventHandler<HTMLDivElement>;
  readonly onBlurCapture?: FocusEventHandler<HTMLDivElement>;
  readonly frameClassName?: string | undefined;
  readonly surfaceClassName?: string;
  readonly mobileCollapsed?: boolean;
}

/** Production composer chrome shared with deterministic acceptance rendering. */
export function ChatComposerFrame({
  children,
  formRef,
  surfaceRef,
  onSubmit,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  onFocusCapture,
  onBlurCapture,
  frameClassName,
  surfaceClassName,
  mobileCollapsed = false,
}: ChatComposerFrameProps) {
  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="mx-auto w-full min-w-0 max-w-3xl"
      data-chat-composer-form="true"
    >
      <div
        className={cn("group rounded-[22px] p-px transition-colors duration-200", frameClassName)}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div
          ref={surfaceRef}
          data-chat-composer-mobile-collapsed={mobileCollapsed ? "true" : "false"}
          className={cn(
            "chat-composer-glass rounded-[20px] border border-border transition-colors duration-200 has-focus-visible:border-ring/45",
            surfaceClassName,
          )}
          onFocusCapture={onFocusCapture}
          onBlurCapture={onBlurCapture}
        >
          {children}
        </div>
      </div>
    </form>
  );
}
