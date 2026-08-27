import { Link } from "@tanstack/react-router";
import { Building2, ExternalLink, FileText, ShieldAlert, Star, Users } from "lucide-react";
import { LifecycleBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatCount, formatDate } from "@/lib/format";

/**
 * A read-only look at one account, opened beside the list.
 *
 * The counts are a deliberate departure from what this panel used to render. It was fed a
 * `CompanyWorkspaceSummary` built with empty `leads`, `quotes` and `tasks` arrays, so
 * "Leads 0", "Open quotes 0" and "Open tasks 0" were printed for every company in the
 * tenant regardless of what it actually had. Those are gone; what is left comes from the
 * account overview read, which counts them in SQL. When that read fails, `counts` is null
 * and the panel says the numbers are unavailable rather than showing zeros.
 */
export type AccountPreviewCounts = {
  contacts: number;
  clients: number;
  engagements: number;
  quotes: number;
  openSignals: number;
};

export type AccountPreviewSummary = {
  id: string;
  name: string;
  lifecycleStage: string | null;
  relationshipHealth: number;
  lastActivityAt: string | null;
  nextAction: string | null;
  /** Null when the overview read failed. Never zeros standing in for unknown. */
  counts: AccountPreviewCounts | null;
};

type AccountPreviewPanelProps = {
  account: AccountPreviewSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  /** True while the favorite write is in flight. Disables the star so a toggle cannot race. */
  favoritePending?: boolean;
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
  favoritePending = false,
  loading = false,
  error = null,
  onRetry,
}: AccountPreviewPanelProps) {
  // Typed as a plain string: the router's `to` union rejects a template-literal type, and
  // the destination is a real registered route either way.
  const workspaceHref: string = account ? `/accounts/${account.id}` : "/accounts";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-md lg:max-w-[28rem]">
        {account ? (
          <div className="min-h-full">
            <SheetHeader className="border-b px-6 py-5 pr-14 text-left">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-2">
                  <LifecycleBadge stage={account.lifecycleStage} />
                  <SheetTitle className="break-words text-xl">{account.name}</SheetTitle>
                  <SheetDescription>Company relationship overview</SheetDescription>
                </div>
                {onToggleFavorite ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 shrink-0"
                    onClick={onToggleFavorite}
                    /*
                     * `toggleWorkspaceFavorite` deletes when a row exists and inserts when it
                     * does not, so two clicks in flight together net to zero while both
                     * requests race. The write has to be locked, not debounced.
                     */
                    disabled={favoritePending}
                    aria-busy={favoritePending || undefined}
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
                </dl>
              </section>

              <Separator />

              <section aria-labelledby="linked-work-heading" className="space-y-3">
                <h3 id="linked-work-heading" className="text-sm font-semibold">
                  Linked work
                </h3>
                {account.counts ? (
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <Metric icon={Users} label="Stakeholders" value={account.counts.contacts} />
                    <Metric icon={Building2} label="Clients" value={account.counts.clients} />
                    <Metric
                      icon={Building2}
                      label="Engagements"
                      value={account.counts.engagements}
                    />
                    <Metric icon={FileText} label="Quotes" value={account.counts.quotes} />
                    <Metric
                      icon={ShieldAlert}
                      label="Open signals"
                      value={account.counts.openSignals}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Linked work counts are unavailable for this company right now.
                  </p>
                )}
              </section>

              {/*
                A router Link, not a raw anchor. The anchor here triggered a full document
                load out of a single-page app, discarding the query cache and the router
                state on the way into the account it had just previewed.
              */}
              <Button asChild className="h-11 w-full">
                <Link to={workspaceHref}>
                  Open full workspace
                  <ExternalLink className="h-4 w-4" />
                </Link>
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
      <span className="font-semibold tabular-nums">{formatCount(value)}</span>
    </div>
  );
}
