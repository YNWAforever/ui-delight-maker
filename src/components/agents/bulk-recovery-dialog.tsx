import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  previewAgentRecoveryFn,
  executeAgentRecoveryFn,
  getAgentRecoveryOperationFn,
  resumeAgentRecoveryFn,
  type AgentRecoveryReceipt,
} from "@/server-functions/agent-bulk-recovery";
type Intent = { previewId: string; idempotencyKey: string; reason: string };
type Preview = Awaited<ReturnType<typeof previewAgentRecoveryFn>>;
type BulkRecoveryDialogProps = {
  runIds: string[];
  actorId: string;
  onComplete: () => void;
};
export function BulkRecoveryDialog(props: BulkRecoveryDialogProps) {
  // Authenticated route context can change without remounting its queue.
  return <ActorBulkRecoveryDialog key={props.actorId} {...props} />;
}
function ActorBulkRecoveryDialog({ runIds, actorId, onComplete }: BulkRecoveryDialogProps) {
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const key = "clientops-agent-recovery:" + actorId;
  const [action, setAction] = useState<"cancel" | "expire">("expire");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [receipt, setReceipt] = useState<AgentRecoveryReceipt | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const selectionIdentity = runIds.join(",");
  const latestSelection = useRef(selectionIdentity);
  latestSelection.current = selectionIdentity;
  useEffect(() => {
    if (!intent) setPreview(null);
  }, [selectionIdentity, intent]);
  const perform = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch {
      setError(
        "The result is unconfirmed. Read or resume the same operation; keep its original intent.",
      );
    } finally {
      setBusy(false);
    }
  };
  const persist = (value: Intent) => {
    sessionStorage.setItem(key, JSON.stringify(value));
    setIntent(value);
  };
  const loadIntent = () => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) ?? "null") as Intent | null;
      return saved &&
        /^[a-f0-9-]{36}$/.test(saved.previewId) &&
        /^[a-f0-9-]{36}$/.test(saved.idempotencyKey) &&
        typeof saved.reason === "string"
        ? saved
        : null;
    } catch {
      return null;
    }
  };
  const record = (r: AgentRecoveryReceipt) => {
    // Late receipts must not invalidate another actor's UI or erase the saved original intent.
    // Its owner can read the durable server receipt when they return.
    if (!active.current) return;
    setReceipt(r);
    setUncertain(false);
    if (r.status === "completed") {
      sessionStorage.removeItem(key);
      setIntent(null);
      setPreview(null);
      onComplete();
    }
  };
  return (
    <section aria-label="Local bulk maintenance" className="space-y-3 rounded border p-3">
      <h3 className="font-semibold">Local bulk maintenance</h3>
      <p className="text-sm">
        {runIds.length} selected. Only close local run records; provider jobs and customer messages
        are not cancelled. Linked approvals and unknown provider outcomes require individual review.
      </p>
      {!intent && !uncertain && (
        <>
          <label className="block text-sm">
            Local action{" "}
            <select
              value={action}
              onChange={(e) => {
                setAction(e.target.value as typeof action);
                setPreview(null);
              }}
              disabled={busy}
            >
              <option value="expire">Expire stuck local records</option>
              <option value="cancel">Cancel local records</option>
            </select>
          </label>
          <Button
            variant="outline"
            disabled={busy || runIds.length < 1 || runIds.length > 100}
            onClick={() =>
              void perform(async () => {
                setReceipt(null);
                const requestedSelection = selectionIdentity;
                const nextPreview = await previewAgentRecoveryFn({ data: { runIds, action } });
                if (latestSelection.current === requestedSelection) setPreview(nextPreview);
                else setError("Selection changed. Preview the current selection again.");
              })
            }
          >
            Preview {runIds.length} selected
          </Button>
        </>
      )}
      {runIds.length > 100 && (
        <p role="alert">More than 100 selected. Narrow the query; no IDs will be truncated.</p>
      )}
      {preview && !intent && (
        <div role="group" aria-label="Confirm local recovery">
          <p>
            {preview.eligibleCount} eligible / {preview.items.length} selected;{" "}
            {preview.blockedCount} blocked. Preview expires {preview.expiresAt}.
          </p>
          <ul>
            {preview.items.map((i) => (
              <li key={i.runId}>
                {i.runId}: {i.reasonCode}
              </li>
            ))}
          </ul>
          <label className="block">
            Recovery reason{" "}
            <textarea
              value={reason}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
              minLength={10}
              maxLength={1000}
            />
          </label>
          <Button
            disabled={
              busy ||
              preview.eligibleCount === 0 ||
              reason.trim().length < 10 ||
              reason.trim().length > 1000
            }
            onClick={() =>
              void perform(async () => {
                const next = {
                  previewId: preview.previewId,
                  idempotencyKey: crypto.randomUUID(),
                  reason: reason.trim(),
                };
                persist(next);
                setUncertain(true);
                record(await executeAgentRecoveryFn({ data: next }));
              })
            }
          >
            Confirm {preview.eligibleCount} local {action}
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => setPreview(null)}>
            Cancel preview
          </Button>
        </div>
      )}
      <Button
        variant="outline"
        disabled={busy}
        onClick={() =>
          void perform(async () => {
            const saved = intent ?? loadIntent();
            if (!saved) {
              setError("No saved operation in this browser session.");
              return;
            }
            setIntent(saved);
            setReason(saved.reason);
            record(await getAgentRecoveryOperationFn({ data: { operationId: saved.previewId } }));
          })
        }
      >
        Read saved operation
      </Button>
      {intent && (
        <>
          <p>
            Operation {intent.previewId}. Original reason: {intent.reason}
          </p>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                setUncertain(true);
                record(await executeAgentRecoveryFn({ data: intent }));
              })
            }
          >
            Resume original intent
          </Button>
          <Button
            variant="outline"
            disabled={busy || !receipt || receipt.status === "completed"}
            onClick={() =>
              void perform(async () =>
                record(await resumeAgentRecoveryFn({ data: { operationId: intent.previewId } })),
              )
            }
          >
            Continue local operation
          </Button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">Checking local records…</p>}
      {receipt && (
        <div aria-live="polite">
          <p>
            {receipt.status}: {receipt.completedCount} / {receipt.totalCount} processed.
          </p>
          <ul>
            {receipt.items.map((i) => (
              <li key={i.runId}>
                {i.runId}: {i.status} · {i.reasonCode}
                {i.commandReceiptId ? " · receipt " + i.commandReceiptId : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
