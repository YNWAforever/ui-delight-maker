import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { RelationshipSignalCard } from "@/components/relationship/relationship-signal-card";
import type { Account, RelationshipSignal } from "@/lib/types";
import { dismissRelationshipSignalFn } from "@/server-functions/relationship-signals";

export function RelationshipCommandCenter({
  accounts,
  signals,
  hiddenSignalCount = 0,
  onDismissed,
}: {
  accounts: Account[];
  signals: RelationshipSignal[];
  hiddenSignalCount?: number;
  onDismissed?: () => void;
}) {
  const [rows, setRows] = useState(signals);
  const [activeDismissId, setActiveDismissId] = useState<string | null>(null);
  const [dismissReasons, setDismissReasons] = useState<Record<string, string>>({});
  const [pendingSignalIds, setPendingSignalIds] = useState<string[]>([]);
  const [optimisticDismissedIds, setOptimisticDismissedIds] = useState<string[]>([]);
  const accountById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );

  useEffect(() => {
    setRows(signals.filter((signal) => !optimisticDismissedIds.includes(signal.id)));
  }, [signals, optimisticDismissedIds]);

  const startDismiss = (signal: RelationshipSignal) => {
    setActiveDismissId(signal.id);
    setDismissReasons((prev) => ({ ...prev, [signal.id]: prev[signal.id] ?? "" }));
  };

  const changeDismissReason = (signalId: string, reason: string) => {
    setDismissReasons((prev) => ({ ...prev, [signalId]: reason }));
  };

  const cancelDismiss = (signalId: string) => {
    if (pendingSignalIds.includes(signalId)) {
      return;
    }

    setActiveDismissId((current) => (current === signalId ? null : current));
  };

  const dismiss = async (signal: RelationshipSignal) => {
    if (pendingSignalIds.includes(signal.id)) {
      return;
    }

    const reason = dismissReasons[signal.id] ?? "";

    if (!reason.trim()) {
      toast.error("Dismissal reason is required");
      return;
    }

    setPendingSignalIds((prev) => [...prev, signal.id]);

    try {
      await dismissRelationshipSignalFn({
        data: { id: signal.id, reason: reason.trim() },
      });
      setOptimisticDismissedIds((prev) => [...prev, signal.id]);
      setRows((prev) => prev.filter((row) => row.id !== signal.id));
      setActiveDismissId((current) => (current === signal.id ? null : current));
      setDismissReasons((prev) => {
        const next = { ...prev };
        delete next[signal.id];
        return next;
      });
      onDismissed?.();
      toast.success("Signal dismissed");
    } catch {
      toast.error("Could not dismiss signal");
    } finally {
      setPendingSignalIds((prev) => prev.filter((id) => id !== signal.id));
    }
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
        No open relationship signals. Import event attendees, add stakeholders, or run relationship
        intelligence to generate the next set of actions.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {hiddenSignalCount > 0 ? (
        <p className="text-xs text-muted-foreground">
          Showing the 10 highest-priority signals per account. {hiddenSignalCount} additional open
          signal{hiddenSignalCount === 1 ? " is" : "s are"} available on account records.
        </p>
      ) : null}
      {rows.map((signal) => (
        <RelationshipSignalCard
          key={signal.id}
          signal={signal}
          accountName={accountById.get(signal.account_id)?.name ?? "Unknown account"}
          dismissReason={dismissReasons[signal.id] ?? ""}
          isDismissOpen={activeDismissId === signal.id}
          isDismissing={pendingSignalIds.includes(signal.id)}
          onStartDismiss={startDismiss}
          onDismissReasonChange={changeDismissReason}
          onConfirmDismiss={dismiss}
          onCancelDismiss={cancelDismiss}
        />
      ))}
    </div>
  );
}
