import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1 border-b border-border bg-background/60 px-6 py-5 backdrop-blur md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description && (
          <p className="mt-1 break-words text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && (
        <div className="mt-3 flex flex-wrap items-center gap-2 md:mt-0 md:justify-end">
          {actions}
        </div>
      )}
    </div>
  );
}
