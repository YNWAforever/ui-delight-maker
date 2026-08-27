import { Badge } from "@/components/ui/badge";
import { getJobSheetStatusLabel } from "@/lib/job-sheet-editor";
import type { JobSheetStatus } from "@/lib/types";

export function JobSheetStatusBadge({ status }: { status: JobSheetStatus }) {
  const variant =
    status === "accepted" ? "default" : status === "change_required" ? "destructive" : "secondary";

  return <Badge variant={variant}>{getJobSheetStatusLabel(status)}</Badge>;
}
