import type { ReactNode } from "react";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface SalesContextPanelProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
}

export function SalesContextPanel({
  title,
  subtitle,
  children,
  mobileOpen = false,
  onMobileOpenChange,
}: SalesContextPanelProps) {
  return (
    <>
      <aside
        aria-label={`${title} context`}
        className="hidden space-y-4 lg:sticky lg:top-20 lg:block lg:self-start"
      >
        <div className="rounded-md border border-border bg-card p-4 shadow-sm">
          <div className="mb-4">
            <h2 className="text-sm font-semibold">{title}</h2>
            {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          {children}
        </div>
      </aside>
      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </SheetHeader>
          <div className="mt-4">{children}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}
