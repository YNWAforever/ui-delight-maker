import { useMemo, useState } from "react";
import { toast } from "sonner";
import { RelationshipSignalCard } from "@/components/relationship/relationship-signal-card";
import { Button } from "@/components/ui/button";
import type { Account, RelationshipSignal } from "@/lib/types";
import { dismissRelationshipSignalFn } from "@/server-functions/relationship-signals";

export function RelationshipCommandCenter({
  accounts,
  signals,
}: {
  accounts: Account[];
  signals: RelationshipSignal[];
}) {
  const [rows, setRows] = useState(signals);
  const accountById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );

  const dismiss = async (signal: RelationshipSignal) => {
    try {
      await dismissRelationshipSignalFn({
        data: { id: signal.id, reason: "Dismissed from Relationship Command Center" },
      });
      setRows((prev) => prev.filter((row) => row.id !== signal.id));
      toast.success("Signal dismissed");
    } catch {
      toast.error("Could not dismiss signal");
    }
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
        No open relationship signals. Import event attendees, add stakeholders, or run
        relationship intelligence to generate the next set of actions.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((signal) => (
        <RelationshipSignalCard
          key={signal.id}
          signal={signal}
          accountName={accountById.get(signal.account_id)?.name ?? "Unknown account"}
          onDismiss={dismiss}
        />
      ))}
      <Button variant="outline" size="sm" disabled>
        Bulk actions arrive after signal quality is proven
      </Button>
    </div>
  );
}
