import { Building2, BriefcaseBusiness, CalendarClock, Users } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { userById } from "@/lib/users";
import type { Account } from "@/lib/types";

export function AccountSummaryCard({
  account,
  openSignalCount,
  linkedClientCount,
}: {
  account: Account;
  openSignalCount: number;
  linkedClientCount: number;
}) {
  const owner = account.account_owner ? userById(account.account_owner) : undefined;
  const csOwner = account.cs_owner ? userById(account.cs_owner) : undefined;

  return (
    <Card className="h-full border-border/80 transition-colors hover:bg-accent/20">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Building2 className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wide">Company</span>
            </div>
            <p className="truncate text-sm font-semibold text-foreground">{account.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {account.industry ?? "Industry unassigned"}
            </p>
          </div>
          <StatusBadge value={account.lifecycle_stage} />
        </div>

        <dl className="grid grid-cols-2 gap-3 text-xs">
          <div className="space-y-1 rounded-md border border-border/70 bg-muted/20 p-3">
            <dt className="flex items-center gap-2 text-muted-foreground">
              <BriefcaseBusiness className="h-3.5 w-3.5" />
              Owners
            </dt>
            <dd className="text-sm font-medium text-foreground">{owner?.name ?? "Unassigned"}</dd>
            <p className="text-muted-foreground">CS: {csOwner?.name ?? "Unassigned"}</p>
          </div>
          <div className="space-y-1 rounded-md border border-border/70 bg-muted/20 p-3">
            <dt className="flex items-center gap-2 text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              Coverage
            </dt>
            <dd className="text-sm font-medium text-foreground">
              {openSignalCount} open signal{openSignalCount === 1 ? "" : "s"}
            </dd>
            <p className="text-muted-foreground">
              {linkedClientCount} linked client{linkedClientCount === 1 ? "" : "s"}
            </p>
          </div>
        </dl>

        <div className="flex items-start gap-2 rounded-md border border-dashed border-border/80 px-3 py-2 text-xs text-muted-foreground">
          <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="min-w-0">
            <p>Last activity: {formatDate(account.last_activity_at)}</p>
            <p className="truncate">Next action: {account.next_action ?? "Not set"}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
