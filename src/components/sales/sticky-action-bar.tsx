import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The commit row for a long form or an editable record.
 *
 * On a phone the actions stick to the bottom of the viewport, because a job sheet or quote
 * editor is taller than the screen and a Save button parked at the end of the document is
 * a scroll away from every field a user is editing. From `md` up the bar returns to normal
 * document flow — there is no viewport pressure to solve, and a permanently pinned bar
 * would just eat desktop height.
 *
 * The bottom padding adds `env(safe-area-inset-bottom)` so the actions clear the iOS home
 * indicator; without it the last few pixels of the button sit under the system gesture
 * area and taps land on the OS instead of the app. It is a utility class rather than an
 * inline style so the global `prefers-reduced-motion` and theme layers can still reach the
 * element.
 */
export type StickyActionBarProps = {
  /** The actions. Order them primary-last, matching WorkspaceHeader. */
  children: ReactNode;
  className?: string;
};

export function StickyActionBar({ children, className }: StickyActionBarProps) {
  return (
    <div
      className={cn(
        // -mx-4/px-4 lets the bar bleed to the edges of the mobile content padding so it
        // reads as a surface, not a floating card.
        "sticky bottom-0 z-30 -mx-4 flex flex-wrap items-center justify-end gap-2",
        "border-t border-border bg-background/95 px-4 pt-3 backdrop-blur",
        "pb-[calc(0.75rem_+_env(safe-area-inset-bottom))]",
        "md:static md:z-auto md:mx-0 md:border-t-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none",
        className,
      )}
    >
      {children}
    </div>
  );
}
