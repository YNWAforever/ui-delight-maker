import { Activity, Building2, ExternalLink, FileText, ListTodo, Star, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatDate } from "@/lib/format";
import type { CompanyWorkspaceSummary } from "@/lib/relationship/company-workspace";

type AccountPreviewPanelProps = {
  account: CompanyWorkspaceSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
};

export function AccountPreviewPanel({
  account,
  open,
  onOpenChange,
  isFavorite = false,
  onToggleFavorite,
  loading = false,
  error = null,
  onRetry,
}: AccountPreviewPanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-md lg:max-w-[28rem]">
        {account ? (
          <div className="min-h-full">
            <SheetHeader className="border-b px-6 py-5 pr-14 text-left">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-2">
                  <Badge variant="secondary">{account.lifecycleLabel}</Badge>
                  <SheetTitle className="break-words text-xl">{account.displayName}</SheetTitle>
                  <SheetDescription>Company relationship overview</SheetDescription>
                </div>
                {onToggleFavorite ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 shrink-0"
                    onClick={onToggleFavorite}
                    aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                    title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                  >
                    <Star className={isFavorite ? "h-5 w-5 fill-current" : "h-5 w-5"} />
                  </Button>
                ) : null}
              </div>
            </SheetHeader>

            <div className="space-y-6 px-6 py-5">
              {loading ? (
                <p role="status" className="text-sm text-muted-foreground">
                  Refreshing company details...
                </p>
              ) : null}
              {error ? (
                <div
                  role="alert"
                  className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 p-3 text-sm"
                >
                  <span>{error}</span>
                  {onRetry ? (
                    <Button variant="outline" size="sm" onClick={onRetry}>
                      Retry
                    </Button>
                  ) : null}
                </div>
              ) : null}
              <section aria-labelledby="relationship-heading" className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 id="relationship-heading" className="text-sm font-semibold">
                    Relationship health
                  </h3>
                  <span className="text-sm font-semibold tabular-nums">
                    {account.relationshipHealth}/100
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-transform duration-200 motion-reduce:transition-none"
                    style={{
                      transform: `scaleX(${Math.max(0, Math.min(100, account.relationshipHealth)) / 100})`,
                      transformOrigin: "left",
                    }}
                  />
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Last activity</dt>
                  <dd className="text-right">
                    {account.lastActivityAt
                      ? formatDate(account.lastActivityAt)
                      : "No activity yet"}
                  </dd>
                  <dt className="text-muted-foreground">Next action</dt>
                  <dd className="text-right font-medium">
                    {account.nextAction ?? "No next action set"}
                  </dd>
                  <dt className="text-muted-foreground">Primary contact</dt>
                  <dd className="text-right">
                    {account.primaryContactId ? "Connected" : "Not set"}
                  </dd>
                </dl>
              </section>

              <Separator />

              <section aria-labelledby="linked-work-heading" className="space-y-3">
                <h3 id="linked-work-heading" className="text-sm font-semibold">
                  Linked work
                </h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Metric icon={Users} label="Contacts" value={account.counts.contacts} />
                  <Metric icon={Building2} label="Clients" value={account.counts.clients} />
                  <Metric icon={Activity} label="Leads" value={account.counts.leads} />
                  <Metric icon={FileText} label="Open quotes" value={account.counts.openQuotes} />
                  <Metric icon={ListTodo} label="Open tasks" value={account.counts.openTasks} />
                </div>
              </section>

              <Button asChild className="h-11 w-full">
                <a href={`/accounts/${account.id}`}>
                  Open full workspace
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: number;
}) {
  return (
    <div className="flex min-h-11 items-center gap-2 rounded-md border px-3 py-2">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1 text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}
