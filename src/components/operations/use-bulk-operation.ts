import { useCallback, useEffect, useRef, useState } from "react";
import type { BulkAction, BulkPreview, BulkResult } from "@/lib/operations/bulk-contract";
import { toSafeErrorMessage } from "@/lib/errors";
import {
  commitBulkFn,
  getBulkResultFn,
  previewBulkFn,
  resumeBulkFn,
} from "@/server-functions/bulk-operations";
import { toast } from "sonner";

type PendingCommit = {
  kind: "pending_commit";
  operationId: string;
  previewToken: string;
  idempotencyKey: string;
};

function readStoredOperation(raw: string | null): {
  operationId: string;
  pending: PendingCommit | null;
} | null {
  if (!raw) return null;
  if (!raw.startsWith("{")) return { operationId: raw, pending: null };
  try {
    const value: unknown = JSON.parse(raw);
    if (
      value &&
      typeof value === "object" &&
      "kind" in value &&
      value.kind === "pending_commit" &&
      "operationId" in value &&
      typeof value.operationId === "string" &&
      "previewToken" in value &&
      typeof value.previewToken === "string" &&
      "idempotencyKey" in value &&
      typeof value.idempotencyKey === "string"
    ) {
      const pending = value as PendingCommit;
      return { operationId: pending.operationId, pending };
    }
  } catch {
    // Invalid local state never grants access; the owner-checked server result is authoritative.
  }
  return null;
}

export function useBulkOperation(
  storageKey: string,
  onResult: (result: BulkResult) => void | Promise<void>,
) {
  const [preview, setPreview] = useState<BulkPreview | null>(null);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryState, setRecoveryState] = useState<"loading" | "retry" | null>(null);
  const busyRef = useRef(false);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const restoreReceipt = useCallback(
    async (isMounted: () => boolean = () => true) => {
      const stored = readStoredOperation(sessionStorage.getItem(storageKey));
      if (!stored) {
        sessionStorage.removeItem(storageKey);
        if (isMounted()) setRecoveryState(null);
        return;
      }
      setRecoveryState("loading");
      try {
        const saved = await getBulkResultFn({ data: { operationId: stored.operationId } });
        if (!isMounted()) return;
        setResult(saved);
        setRecoveryState(null);
        void onResultRef.current(saved);
      } catch (error) {
        if (!isMounted()) return;
        if (error instanceof Error && error.message === "Bulk operation owner access denied") {
          // The server uses one response for a missing operation and another actor's
          // operation. Discard this tab's inaccessible pointer without exposing either.
          sessionStorage.removeItem(storageKey);
          setRecoveryState(null);
        } else {
          // A failed read says nothing about whether the earlier write committed.
          // Keep the exact receipt until an owner-checked read can answer that.
          setRecoveryState("retry");
        }
      }
    },
    [storageKey],
  );

  useEffect(() => {
    setResult(null);
    setPreview(null);
    let mounted = true;
    void restoreReceipt(() => mounted);
    return () => {
      mounted = false;
    };
  }, [restoreReceipt]);
  const acceptResult = async (next: BulkResult) => {
    setResult(next);
    try {
      sessionStorage.setItem(storageKey, next.operationId);
    } catch {
      toast.error("Browser storage is unavailable; keep this result open until it is recorded.");
    }
    await onResultRef.current(next);
  };

  const prepare = async (action: BulkAction, ids: string[]): Promise<boolean> => {
    if (busyRef.current || ids.length === 0) return false;
    if (recoveryState) {
      toast.error("Check the previous bulk result before starting another change.");
      return false;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      setPreview(await previewBulkFn({ data: { action, ids } }));
      return true;
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const commit = async () => {
    if (busyRef.current || !preview) return;
    const pending: PendingCommit = {
      kind: "pending_commit",
      operationId: preview.operationId,
      previewToken: preview.token,
      idempotencyKey: crypto.randomUUID(),
    };
    // Save the same key before the network request. If the response is lost after a
    // database commit, reload and Resume replay this exact logical command.
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(pending));
    } catch {
      toast.error("Browser storage is unavailable; the bulk change cannot safely start.");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const next = await commitBulkFn({
        data: { previewToken: pending.previewToken, idempotencyKey: pending.idempotencyKey },
      });
      setPreview(null);
      await acceptResult(next);
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
      try {
        const saved = await getBulkResultFn({ data: { operationId: pending.operationId } });
        setPreview(null);
        setResult(saved);
        await onResultRef.current(saved);
      } catch {
        // Keep the pending key for an authorized retry after connectivity returns.
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const resume = async () => {
    if (busyRef.current || !result) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const stored = readStoredOperation(sessionStorage.getItem(storageKey));
      const pending = stored?.operationId === result.operationId ? stored.pending : null;
      const next = pending
        ? await commitBulkFn({
            data: {
              previewToken: pending.previewToken,
              idempotencyKey: pending.idempotencyKey,
            },
          })
        : await resumeBulkFn({ data: { operationId: result.operationId } });
      await acceptResult(next);
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return {
    preview,
    result,
    busy,
    recoveryState,
    retryLoadResult: () => void restoreReceipt(),
    prepare,
    commit,
    resume,
    cancelPreview: () => setPreview(null),
    dismiss: () => {
      setResult(null);
      setRecoveryState(null);
      sessionStorage.removeItem(storageKey);
    },
  };
}
