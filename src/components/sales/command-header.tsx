import type { ReactNode } from "react";

interface CommandHeaderProps {
  title: string;
  status?: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
}

export function CommandHeader({ title, status, description, actions, meta }: CommandHeaderProps) {
  return (
    <header className="border-b border-border bg-background/80 px-6 py-5 backdrop-blur">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          {status && (
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {status}
            </p>
          )}
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">{title}</h1>
          {description && (
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {meta && <div className="mt-4">{meta}</div>}
    </header>
  );
}
