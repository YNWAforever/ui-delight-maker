import { Badge } from "@/components/ui/badge";
import type { JobSheetStatus } from "@/lib/types";

const LABELS: Record<JobSheetStatus, string> = {
  draft: "Draft",
  accounting_review: "Accounting review",
  accepted: "Accepted",
  change_required: "Change required",
  cancelled: "Cancelled",
};

export function JobSheetStatusBadge({ status }: { status: JobSheetStatus }) {
  const variant =
    status === "accepted" ? "default" : status === "change_required" ? "destructive" : "secondary";

  return <Badge variant={variant}>{LABELS[status]}</Badge>;
}
