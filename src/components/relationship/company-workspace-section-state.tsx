import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SectionState } from "@/server/company-workspace/types";

export type CompanyWorkspaceSectionStateProps<T> = {
  state?: SectionState<T>;
  isLoading: boolean;
  emptyMessage: string;
  onRetry?: () => void;
  children?: (data: T) => ReactNode;
};

export function CompanyWorkspaceSectionState<T>({
  state,
  isLoading,
  emptyMessage,
  onRetry,
  children,
}: CompanyWorkspaceSectionStateProps<T>) {
  return (
    <div data-testid="company-workspace-section-state" className="min-h-40">
      {isLoading ? (
        <p role="status">Loading company details…</p>
      ) : state?.status === "error" ? (
        <div role="alert">
          <p>Company details are temporarily unavailable.</p>
          <p>Reference {state.error.requestId}</p>
          {state.error.retryable && onRetry ? (
            <Button
              aria-label="Retry section"
              title="Retry section"
              variant="outline"
              size="icon"
              onClick={onRetry}
            >
              <RefreshCw aria-hidden="true" />
            </Button>
          ) : null}
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
