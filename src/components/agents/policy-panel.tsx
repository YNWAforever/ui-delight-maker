import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAgentPolicyHistory,
  rollbackAgentPolicyFn,
  setAgentPolicyFn,
} from "@/server-functions/agent-policy";
import type { AgentWorkflowType } from "@/lib/agents";
import { crmQueryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type History = Awaited<ReturnType<typeof getAgentPolicyHistory>>;
type Intent = {
  status: "active" | "inactive";
  previousStatus: "active" | "inactive";
  expectedVersionId: string | null;
  versionId?: string;
  humanApproval: boolean;
};

export function PolicyPanel({
  workflowType,
  onChanged,
}: {
  workflowType: AgentWorkflowType;
  onChanged?: () => Promise<unknown>;
}) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: crmQueryKeys.agents.section(workflowType, "policy"),
    queryFn: () => getAgentPolicyHistory({ data: { workflowType, limit: 25 } }),
  });
  const [versions, setVersions] = useState<History["items"]>([]),
    [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<"active" | "inactive">("active"),
    [reason, setReason] = useState("");
  const [intent, setIntent] = useState<Intent | null>(null),
    [busy, setBusy] = useState(false),
    [loadingMore, setLoadingMore] = useState(false);
  const [problem, setProblem] = useState<string | null>(null),
    [success, setSuccess] = useState<string | null>(null);
  const restoreFocus = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (query.data) {
      setVersions(query.data.items);
      setCursor(query.data.nextCursor);
      setStatus(query.data.effectivePolicy.status);
    }
  }, [query.data]);
  const data = query.data,
    reasonValid = reason.trim().length >= 10 && reason.trim().length <= 1000;
  const canChange = data?.canConfigure === true;
  const preview = (
    button: HTMLButtonElement,
    nextStatus: "active" | "inactive",
    versionId?: string,
  ) => {
    if (!data || !canChange || !reasonValid) return;
    restoreFocus.current = button;
    setProblem(null);
    setSuccess(null);
    setIntent({
      status: nextStatus,
      previousStatus: data.effectivePolicy.status,
      expectedVersionId: data.effectiveVersionId,
      humanApproval: data.effectivePolicy.humanApproval,
      versionId,
    });
  };
  const apply = async () => {
    if (!intent || busy || !reasonValid) return;
    setBusy(true);
    setProblem(null);
    try {
      const common = {
        workflowType,
        reason: reason.trim(),
        expectedVersionId: intent.expectedVersionId,
      };
      if (intent.versionId)
        await rollbackAgentPolicyFn({ data: { ...common, versionId: intent.versionId } });
      else await setAgentPolicyFn({ data: { ...common, status: intent.status } });
      setSuccess("Policy version saved. New dispatches use the stored status.");
      setReason("");
      setIntent(null);
      try {
        await client.invalidateQueries({ queryKey: crmQueryKeys.agents.all() });
        await onChanged?.();
      } catch {
        setProblem(
          "Policy was saved; refreshing its presentation failed. Reload the policy before another change.",
        );
      }
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : null;
      setProblem(
        code === "CONFLICT"
          ? "Policy changed. Reload the policy and review the current version before trying again."
          : code === "FORBIDDEN"
            ? "You do not have permission to change policy."
            : code === "UNAUTHENTICATED"
              ? "Sign in again before changing policy."
              : code === "INVALID_INPUT" || code === "VALIDATION_FAILED"
                ? "Check the workflow, version and reason (10–1000 characters). Your reason was kept."
                : "Policy change failed. Your reason was kept; reload the policy before trying again.",
      );
    } finally {
      setBusy(false);
    }
  };
  const more = async () => {
    if (!cursor || !data || loadingMore) return;
    setLoadingMore(true);
    setProblem(null);
    try {
      const next = await getAgentPolicyHistory({ data: { workflowType, limit: 25, cursor } });
      if (next.effectiveVersionId !== data.effectiveVersionId) {
        await query.refetch();
        setProblem("Policy changed while loading history. Review the current version.");
        return;
      }
      setVersions((previous) => [
        ...new Map([...previous, ...next.items].map((item) => [item.id, item])).values(),
      ]);
      setCursor(next.nextCursor);
    } catch {
      setProblem("Older policy versions did not load. Try loading them again.");
    } finally {
      setLoadingMore(false);
    }
  };
  if (!data)
    return (
      <section className="rounded-md border p-4" aria-label="Policy governance">
        <p>{query.isPending ? "Loading policy history…" : "Policy history unavailable."}</p>
        {query.isError && (
          <Button variant="outline" onClick={() => void query.refetch()}>
            Reload policy
          </Button>
        )}
      </section>
    );
  return (
    <section className="space-y-3 rounded-md border p-4" aria-label="Policy governance">
      <h3 className="font-medium">Versioned policy</h3>
      <p className="text-sm text-muted-foreground">
        Stored status: {data.effectivePolicy.status}. Human approval:{" "}
        {data.effectivePolicy.humanApproval ? "Required" : "Auto-execute"} (read-only).
      </p>
      <p className="text-sm text-muted-foreground">
        Worker/provider readiness: unknown. An active policy alone does not verify an operational
        worker.
      </p>
      {!canChange && (
        <p className="text-sm">View only. Changing policy requires agents.configure.</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`policy-status-${workflowType}`}>Policy status</Label>
          <select
            id={`policy-status-${workflowType}`}
            value={status}
            disabled={!canChange || busy}
            className="mt-1 block w-full rounded-md border bg-background p-2 focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => setStatus(event.target.value as "active" | "inactive")}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div>
          <Label htmlFor={`policy-reason-${workflowType}`}>Reason</Label>
          <Textarea
            id={`policy-reason-${workflowType}`}
            value={reason}
            disabled={!canChange || busy}
            maxLength={1000}
            onChange={(event) => setReason(event.target.value)}
            aria-describedby={`policy-reason-help-${workflowType}`}
          />
          <p id={`policy-reason-help-${workflowType}`} className="text-xs text-muted-foreground">
            10–1000 characters; recorded with the new version.
          </p>
        </div>
      </div>
      <Button
        disabled={!canChange || busy || !reasonValid || status === data.effectivePolicy.status}
        onClick={(event) => preview(event.currentTarget, status)}
      >
        Preview status change
      </Button>
      <Button
        variant="outline"
        disabled={busy || query.isFetching}
        onClick={() => {
          setIntent(null);
          void query.refetch();
        }}
      >
        Reload policy
      </Button>
      {success && (
        <p role="status" className="text-sm">
          {success}
        </p>
      )}
      {problem && !intent && (
        <p role="alert" className="text-sm">
          {problem}
        </p>
      )}
      <ul className="space-y-2" aria-label="Policy version history">
        {versions.map((version) => (
          <li key={version.id} className="rounded border p-3 text-sm">
            <p className="font-medium">Version {version.version_seq}</p>
            <p>
              {version.status} · {version.created_at}
            </p>
            <p>{version.reason ?? "No historical reason recorded."}</p>
            <details className="text-xs text-muted-foreground">
              <summary>Version details</summary>
              <p>Version ID: {version.id}</p>
              <p>Recorded actor: {version.changed_by}</p>
            </details>
            {version.id !== data.effectiveVersionId && (
              <Button
                variant="outline"
                size="sm"
                disabled={!canChange || busy || !reasonValid}
                aria-label={`Restore status from version ${version.version_seq}`}
                onClick={(event) => preview(event.currentTarget, version.status, version.id)}
              >
                Restore this status
              </Button>
            )}
          </li>
        ))}
      </ul>
      {cursor && (
        <Button variant="outline" disabled={loadingMore || busy} onClick={() => void more()}>
          Load older policy versions
        </Button>
      )}
      <AlertDialog
        open={intent !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setIntent(null);
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreFocus.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm policy status</AlertDialogTitle>
            <AlertDialogDescription>
              {intent?.previousStatus} → {intent?.status}. This affects new dispatches. In-flight
              runs are not cancelled. Current human approval remains{" "}
              {intent?.humanApproval ? "Required" : "Auto-execute"}. Worker/provider readiness:
              unknown.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="break-words text-sm">Reason: {reason}</p>
          {problem && (
            <p role="alert" className="text-sm">
              {problem}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep current policy</AlertDialogCancel>
            <Button disabled={busy || !reasonValid} onClick={() => void apply()}>
              Confirm policy change
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
