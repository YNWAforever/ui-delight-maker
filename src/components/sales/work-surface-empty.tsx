import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { EmptyWorkspaceState } from "./states";

/**
 * Superseded by `EmptyWorkspaceState`, and now a thin alias for it.
 *
 * Eleven routes call this, so the name and prop shape stay exactly as they were rather
 * than being migrated in this phase — but the markup is no longer a second copy. New call
 * sites should import `EmptyWorkspaceState` directly; this export is removed once the
 * eleven have moved.
 */
export function WorkSurfaceEmpty({
  icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <EmptyWorkspaceState icon={icon} title={title} description={description} action={action} />
  );
}
