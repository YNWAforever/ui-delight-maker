import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The 16-18px title that opens a section inside a workspace.
 *
 * It exists so section titles stop being ad-hoc `<h2 className="text-lg font-semibold">`
 * spellings that drifted across routes. The level is fixed at `h2`: `WorkspaceHeader`
 * owns the page's only `h1`, so every section under it is a sibling at level two, and
 * letting callers pick a level is how outlines get broken one route at a time.
 *
 * Weight is `font-medium`, not `font-semibold`: the type scale reserves semibold for page
 * titles, KPI values and priority markers, so a page of semibold section titles would put
 * every section at the same visual weight as the page title itself.
 */
export type SectionHeaderProps = {
  /** The section's name. Rendered as the section's h2. */
  title: string;
  /** One line of operational context. Omit rather than restating the title. */
  description?: string;
  /** A single control scoped to this section, e.g. "Add contact" or a view switch. */
  action?: ReactNode;
  className?: string;
};

export function SectionHeader({ title, description, action, className }: SectionHeaderProps) {
  return (
    // Stacks below sm so a long title and its action do not fight for the same row.
    <div
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-base font-medium tracking-tight text-foreground lg:text-lg">{title}</h2>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
