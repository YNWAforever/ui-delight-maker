import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SectionState } from "@/server/company-workspace/types";

export type CompanyWorkspaceSectionStateProps<T> = {
  state?: SectionState<T>;
  isLoading: boolean;
  isRefreshing?: boolean;
  emptyMessage: string;
  onRetry?: () => void;
  children?: (data: T) => ReactNode;
};

export function CompanyWorkspaceSectionState<T>({
  state,
  isLoading,
  isRefreshing = false,
  emptyMessage,
  onRetry,
  children,
}: CompanyWorkspaceSectionStateProps<T>) {
  const retryButton =
    state?.status === "error" && state.error.retryable && onRetry ? (
      <Button
        aria-label="Retry section"
        title="Retry section"
        variant="outline"
        size="icon"
        disabled={isRefreshing}
        onClick={onRetry}
      >
        <RefreshCw aria-hidden="true" className={isRefreshing ? "animate-spin" : undefined} />
      </Button>
    ) : null;

  return (
    <div
      data-testid="company-workspace-section-state"
      className="min-h-40"
      aria-busy={isRefreshing || undefined}
    >
      {isLoading ? (
        <p role="status">Loading company details…</p>
      ) : state?.status === "error" && state.staleData !== undefined && children ? (
        <div className="space-y-3">
          <div
            role="status"
            aria-live="polite"
            className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/40 p-3 text-sm"
          >
            <div>
              <p className="font-medium text-foreground">
                {isRefreshing
                  ? "Refreshing saved company details..."
                  : "Showing saved company details. Refresh failed."}
              </p>
              <p className="text-muted-foreground">Reference {state.error.requestId}</p>
            </div>
            {retryButton}
          </div>
          {children(state.staleData)}
        </div>
      ) : state?.status === "error" ? (
        <div role="alert" className="space-y-2">
          <p>Company details are temporarily unavailable.</p>
          <p>Reference {state.error.requestId}</p>
          {retryButton}
        </div>
      ) : state?.status === "ready" ? (
        children ? (
          children(state.data)
        ) : null
      ) : (
        <p>{emptyMessage}</p>
      )}
    </div>
  );
}
