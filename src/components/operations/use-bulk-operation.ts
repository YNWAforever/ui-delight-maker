import { useEffect, useRef, useState } from "react";
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
  const busyRef = useRef(false);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    setResult(null);
    setPreview(null);
    const stored = readStoredOperation(sessionStorage.getItem(storageKey));
    if (!stored) {
      sessionStorage.removeItem(storageKey);
      return;
    }
    let mounted = true;
    void getBulkResultFn({ data: { operationId: stored.operationId } })
      .then((saved) => {
        if (!mounted) return;
        setResult(saved);
        void onResultRef.current(saved);
      })
      .catch(() => {
        if (mounted) sessionStorage.removeItem(storageKey);
      });
    return () => {
      mounted = false;
    };
  }, [storageKey]);

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
    prepare,
    commit,
    resume,
    cancelPreview: () => setPreview(null),
    dismiss: () => {
      setResult(null);
      sessionStorage.removeItem(storageKey);
    },
  };
}
