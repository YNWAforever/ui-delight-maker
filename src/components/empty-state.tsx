import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { EmptyWorkspaceState } from "@/components/sales/states";

/**
 * Superseded by `EmptyWorkspaceState`, and now a thin alias for it.
 *
 * This and `sales/work-surface-empty.tsx` were the same empty state drawn twice, differing
 * only in padding and in whether the action was given its own margin — which is how two
 * pages that show "nothing here yet" came to look like two different products. Both now
 * render one component. The two remaining call sites (`pipeline-board`, `report-charts`)
 * keep this import until they move; nothing new should use it.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <EmptyWorkspaceState icon={icon} title={title} description={description} action={action} />
  );
}
