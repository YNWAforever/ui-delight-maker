import type { ReactNode } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface SalesContextPanelBaseProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

interface ControlledSalesContextPanelProps extends SalesContextPanelBaseProps {
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}

interface UncontrolledSalesContextPanelProps extends SalesContextPanelBaseProps {
  mobileOpen?: never;
  onMobileOpenChange?: never;
}

type SalesContextPanelProps = ControlledSalesContextPanelProps | UncontrolledSalesContextPanelProps;

export function SalesContextPanel(props: SalesContextPanelProps) {
  const { title, subtitle, children } = props;
  const sheetProps =
    props.mobileOpen !== undefined
      ? { open: props.mobileOpen, onOpenChange: props.onMobileOpenChange }
      : { defaultOpen: false };

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
      <Sheet {...sheetProps}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription className={subtitle ? undefined : "sr-only"}>
              {subtitle ?? `${title} context details`}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">{children}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}
