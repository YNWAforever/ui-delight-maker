import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toCsv, csvFileName, type CsvColumn } from "@/lib/csv";
import { parseImportCsvDetailed } from "@/lib/csv-import";
import { formatCount } from "@/lib/format";
import { toSafeErrorMessage } from "@/lib/errors";
import {
  previewImportFn,
  commitImportFn,
  resumeImportFn,
  getImportResultFn,
} from "@/server-functions/import-sessions";
import type {
  ImportKind,
  ImportPreview,
  ImportResult,
  ImportRowResult,
} from "@/server/imports/import-session.server";

type SavedImport = {
  sessionId: string;
  previewHash: string;
  previewExpiresAt: string;
  idempotencyKey?: string;
};
const FAILURE_COLUMNS: CsvColumn<ImportRowResult>[] = [
  { header: "Record index", value: (row) => row.recordIndex, kind: "number" },
  { header: "Source line", value: (row) => row.sourceLine, kind: "number" },
  { header: "Action", value: (row) => row.action },
  { header: "Status", value: (row) => row.status },
  { header: "Errors", value: (row) => row.errors.join("; ") },
  { header: "Record ID", value: (row) => row.id },
];
function readSaved(key: string): SavedImport | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<SavedImport>;
    if (!data.sessionId || !data.previewHash || !data.previewExpiresAt) return null;
    return {
      sessionId: data.sessionId,
      previewHash: data.previewHash,
      previewExpiresAt: data.previewExpiresAt,
      ...(data.idempotencyKey ? { idempotencyKey: data.idempotencyKey } : {}),
    };
  } catch {
    return null;
  }
}
function save(key: string, data: SavedImport) {
  localStorage.setItem(key, JSON.stringify(data));
  if (localStorage.getItem(key) !== JSON.stringify(data))
    throw new Error("Could not save this import recovery key");
}
function failedRows(result: ImportResult) {
  return result.rows.filter(
    (row) => row.status !== null && row.status !== "succeeded" && row.status !== "skipped",
  );
}
function downloadFailures(result: ImportResult, kind: ImportKind) {
  const rows = failedRows(result);
  if (!rows.length) return;
  const blob = new Blob([toCsv(rows, FAILURE_COLUMNS)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = csvFileName(kind, "import-errors", result.sessionId);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ImportSessionPanel({
  kind,
  campaignId,
  title,
  onProgress,
}: {
  kind: ImportKind;
  campaignId?: string;
  title?: string;
  onProgress?: (result: ImportResult) => void | Promise<void>;
}) {
  const storageKey = `clientops-import:${kind}:${campaignId ?? ""}`;
  const [sourceNamespace, setSourceNamespace] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [saved, setSaved] = useState<SavedImport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const busyRef = useRef(false);

  useEffect(() => {
    const pending = readSaved(storageKey);
    if (!pending) return;
    setSaved(pending);
    void getImportResultFn({ data: { sessionId: pending.sessionId } })
      .then((recovered) => setResult(recovered))
      .catch((reason) => setError(toSafeErrorMessage(reason)));
  }, [storageKey]);

  async function guarded(work: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (reason) {
      setError(toSafeErrorMessage(reason));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function start(file: File) {
    await guarded(async () => {
      const csvText = await file.text();
      if (new TextEncoder().encode(csvText).length > 5 * 1024 * 1024)
        throw new Error("CSV exceeds 5 MiB");
      const parsed = parseImportCsvDetailed(csvText);
      if (parsed.errors.length)
        throw new Error(`CSV line ${parsed.errors[0].startLine}: ${parsed.errors[0].reason}`);
      if (parsed.rows.length === 0) throw new Error("No data rows found in that file");
      if (parsed.rows.length > 5000) throw new Error("CSV exceeds 5,000 rows");
      const prepared = await previewImportFn({
        data: {
          kind,
          csvText,
          ...(sourceNamespace.trim() ? { sourceNamespace: sourceNamespace.trim() } : {}),
          ...(campaignId ? { campaignId } : {}),
        },
      });
      const recovery = {
        sessionId: prepared.sessionId,
        previewHash: prepared.previewHash,
        previewExpiresAt: prepared.previewExpiresAt,
      };
      save(storageKey, recovery);
      setSaved(recovery);
      setPreview(prepared);
      setResult(prepared);
      setFileName(file.name);
      setPage(1);
    });
  }
  async function commit() {
    if (!saved) return;
    await guarded(async () => {
      const recovery = {
        ...saved,
        idempotencyKey: saved.idempotencyKey ?? crypto.randomUUID(),
      };
      // Persist before the network call. A lost response must replay this exact key.
      save(storageKey, recovery);
      setSaved(recovery);
      const next = await commitImportFn({
        data: {
          sessionId: recovery.sessionId,
          previewHash: recovery.previewHash,
          idempotencyKey: recovery.idempotencyKey,
        },
      });
      setResult(next);
      await onProgress?.(next);
    });
  }
  async function resume() {
    if (!saved || !result) return;
    if (result.state === "preview") {
      await commit();
      return;
    }
    await guarded(async () => {
      const next = await resumeImportFn({ data: { sessionId: saved.sessionId } });
      setResult(next);
      await onProgress?.(next);
    });
  }
  async function check() {
    if (!saved) return;
    await guarded(async () => {
      const next = await getImportResultFn({ data: { sessionId: saved.sessionId } });
      setResult(next);
      await onProgress?.(next);
    });
  }
  function clear() {
    localStorage.removeItem(storageKey);
    setSaved(null);
    setPreview(null);
    setResult(null);
    setFileName(null);
    setPage(1);
    setError(null);
  }

  const current = result ?? preview;
  const rows = current?.rows ?? [];
  const pageSize = 50;
  const visible = rows.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const failures = current ? failedRows(current).length : 0;
  const canStartNew =
    !current ||
    current.state === "completed" ||
    current.state === "expired" ||
    (current.state === "preview" && current.rows.every((row) => row.status !== null));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title ?? "CSV import"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Preview every row before writing. Each request processes at most 20 rows. Closing this
          page pauses the import; return here to check or continue it.
        </p>
        <label className="block space-y-1 text-sm">
          <span>Source system ID namespace (required with external_id)</span>
          <Input
            value={sourceNamespace}
            onChange={(event) => setSourceNamespace(event.target.value)}
            placeholder="For example: legacy-crm"
            disabled={busy || !canStartNew}
            maxLength={100}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span>CSV file (up to 5 MiB and 5,000 rows)</span>
          <Input
            type="file"
            accept=".csv,text/csv"
            disabled={busy || !canStartNew}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void start(file);
            }}
          />
        </label>
        {fileName && <p className="text-xs text-muted-foreground">{fileName}</p>}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {current && (
          <>
            <div className="flex flex-wrap gap-4 text-sm tabular-nums" aria-live="polite">
              <span>State: {current.state}</span>
              <span>
                Processed: {formatCount(current.processed)} / {formatCount(current.total)}
              </span>
              <span>Needs review: {formatCount(failures)}</span>
            </div>
            <p className="break-all text-xs text-muted-foreground">Session: {current.sessionId}</p>
            <div className="flex flex-wrap gap-2">
              {current.state === "preview" && rows.some((row) => row.status === null) && (
                <Button disabled={busy} onClick={() => void commit()}>
                  {busy ? "Working…" : "Commit next 20"}
                </Button>
              )}
              {(current.state === "paused" || current.state === "running") && (
                <Button disabled={busy} onClick={() => void resume()}>
                  {busy ? "Working…" : "Continue next 20"}
                </Button>
              )}
              <Button variant="outline" disabled={busy} onClick={() => void check()}>
                Check result
              </Button>
              <Button
                variant="outline"
                disabled={busy || failures === 0}
                onClick={() => downloadFailures(current, kind)}
              >
                Download issues CSV
              </Button>
              {canStartNew && (
                <Button variant="ghost" disabled={busy} onClick={clear}>
                  Start another import
                </Button>
              )}
            </div>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-2">CSV record / line</th>
                    <th className="p-2">Action</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Issue</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={row.recordIndex} className="border-t">
                      <td className="p-2">
                        {row.recordIndex} / {row.sourceLine}
                      </td>
                      <td className="p-2">{row.action}</td>
                      <td className="p-2">{row.status ?? "Ready"}</td>
                      <td className="p-2">{row.errors.join("; ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2 text-sm">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </Button>
                <span>
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
