import { useId, useRef, type ReactNode } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * The read-only summary of one record, opened beside a list without leaving it.
 *
 * It is built on the existing Sheet (Radix Dialog) rather than a hand-rolled panel for one
 * reason: focus. Radix's FocusScope records the element that was focused when the panel
 * mounts and focuses it again on unmount, so closing returns the user to the row or button
 * they opened it from. Re-implementing that by hand is how "close the panel and land at
 * the top of the document" bugs get shipped, and it is invisible to anyone testing with a
 * mouse.
 *
 * The one thing Radix cannot do for us is know what the trigger was. Its modal content
 * restores focus to a `DialogTrigger`, and this panel has none — it is opened from a table
 * row, a keyboard shortcut or a URL, so `open` is controlled by the route. So the opener is
 * captured in `onOpenAutoFocus`, the last moment before focus moves into the panel, and
 * restored in `onCloseAutoFocus`. Both are the primitive's own hooks; the focus trap, the
 * scroll lock and the Escape handling all stay Radix's.
 *
 * There is one Sheet, not a desktop aside plus a mobile sheet. Two mount points would mean
 * two focus traps and a return-to-trigger guarantee that holds only at one breakpoint.
 * Anchoring right gives a full-height panel at every size; the width is what changes —
 * full-bleed on phones, a side panel from `sm` up, wider again on `lg`.
 */
export type RecordSummarySection = {
  id: string;
  /** Short noun phrase, e.g. "Owner" or "Recent activity". */
  title: string;
  content: ReactNode;
};

export type RecordSummaryPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The record's name. Becomes the panel's accessible name. */
  title: string;
  /** Identifying context, e.g. "Quote QT-1042 · Acme Media". */
  subtitle?: string;
  sections: RecordSummarySection[];
  /** The one thing to do with this record. Everything else belongs on the full page. */
  primaryAction?: ReactNode;
  className?: string;
};

export function RecordSummaryPanel({
  open,
  onOpenChange,
  title,
  subtitle,
  sections,
  primaryAction,
  className,
}: RecordSummaryPanelProps) {
  const headingPrefix = useId();
  const openerRef = useRef<HTMLElement | null>(null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        onOpenAutoFocus={() => {
          openerRef.current = document.activeElement as HTMLElement | null;
        }}
        onCloseAutoFocus={(event) => {
          const opener = openerRef.current;
          // Nothing worth returning to — let Radix's own fallback decide.
          if (!opener || opener === document.body || !opener.isConnected) return;
          event.preventDefault();
          opener.focus();
        }}
        className={cn("flex w-full flex-col overflow-y-auto sm:max-w-md lg:max-w-lg", className)}
      >
        {/* pr-8 keeps a long title clear of the primitive's own close button. */}
        <SheetHeader className="pr-8">
          <SheetTitle>{title}</SheetTitle>
          {/* Radix warns when a dialog has no description; when there is no subtitle to
              show, the panel still needs one for assistive technology. */}
          <SheetDescription className={subtitle ? undefined : "sr-only"}>
            {subtitle ?? `Summary of ${title}`}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex-1 space-y-6">
          {sections.map((section) => {
            const headingId = `${headingPrefix}-${section.id}`;
            return (
              <section key={section.id} aria-labelledby={headingId}>
                <h3
                  id={headingId}
                  className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {section.title}
                </h3>
                <div className="mt-2 text-sm text-foreground">{section.content}</div>
              </section>
            );
          })}
        </div>

        {primaryAction && (
          // Sticky so the action stays reachable in a long panel on a short screen.
          <div className="sticky bottom-0 mt-6 border-t border-border bg-background pt-4">
            {primaryAction}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
