export type NativeActivityPanelState =
  | "empty"
  | "error"
  | "loading"
  | "ready"
  | "refreshing"
  | "stale";

export interface NativeActivityRecord {
  readonly id: string;
  readonly kind?: string | undefined;
  readonly status?: string | undefined;
  readonly summary: string;
  readonly detail?: string | undefined;
  readonly occurredAt?: string | undefined;
}

export interface NativeActivityPresentation {
  readonly accessibleLabel: string;
  readonly identity: {
    readonly label: string;
    readonly value: string;
    readonly status?: string | undefined;
  };
  readonly state: NativeActivityPanelState;
  readonly overview?:
    | {
        readonly summary: string;
        readonly metadata?: string | undefined;
      }
    | undefined;
  readonly records: readonly NativeActivityRecord[];
  readonly emptyMessage: string;
  readonly loadingMessage?: string | undefined;
  readonly failure?:
    | {
        readonly message: string;
        readonly retainedMessage?: string | undefined;
        readonly retryLabel: string;
      }
    | undefined;
  readonly truncationMessage?: string | undefined;
}
