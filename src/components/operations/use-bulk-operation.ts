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

export function useBulkOperation(
  storageKey: string,
  onResult: (result: BulkResult) => void | Promise<void>,
) {
  const [preview, setPreview] = useState<BulkPreview | null>(null);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [busy, setBusy] = useState(false);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    setResult(null);
    setPreview(null);
    const operationId = sessionStorage.getItem(storageKey);
    if (!operationId) return;
    let mounted = true;
    void getBulkResultFn({ data: { operationId } })
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
    sessionStorage.setItem(storageKey, next.operationId);
    await onResultRef.current(next);
  };

  const prepare = async (action: BulkAction, ids: string[]): Promise<boolean> => {
    if (busy || ids.length === 0) return false;
    setBusy(true);
    try {
      setPreview(await previewBulkFn({ data: { action, ids } }));
      return true;
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (busy || !preview) return;
    setBusy(true);
    try {
      const next = await commitBulkFn({
        data: { previewToken: preview.token, idempotencyKey: crypto.randomUUID() },
      });
      setPreview(null);
      await acceptResult(next);
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const resume = async () => {
    if (busy || !result) return;
    setBusy(true);
    try {
      await acceptResult(await resumeBulkFn({ data: { operationId: result.operationId } }));
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
    } finally {
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
