import type { ReactNode } from "react";
import { Inbox, type LucideIcon } from "lucide-react";

export function WorkSurfaceEmpty({
  icon: Icon = Inbox,
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
    <div className="flex min-h-[160px] flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted/20 p-8 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-background text-muted-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
