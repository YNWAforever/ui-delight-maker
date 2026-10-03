import { useMemo, useState } from "react";
import { agentQueueSearchSchema } from "@/lib/agent-queue-input";
import { QueueToolbar, type QueueSearch } from "@/components/agents/queue-toolbar";
import { DemoOriginLabel } from "@/components/agents/data-scope";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Bot, CheckCircle2, ClipboardCheck, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";

import {
  EmptyWorkspaceState,
  ErrorState,
  MetricStrip,
  RecordSummaryPanel,
  ResponsiveRecordList,
  SectionHeader,
  StaleDataIndicator,
  StatusBadge,
  WorkspaceHeader,
  type ColumnDef,
  type RecordSummarySection,
} from "@/components/sales";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useClientNow } from "@/hooks/use-client-now";
import { agentSlugForWorkflowType } from "@/lib/agents";
import { ROLE_GRANTS } from "@/lib/admin/policy";
import type { Capability } from "@/lib/admin/types";
import { approvalProposedAction, approvalTypeLabel } from "@/lib/approval-types";
import { toSafeErrorMessage } from "@/lib/errors";
import { formatDateTime, formatPercent, relativeTime } from "@/lib/format";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import { AdminError } from "@/lib/admin/errors";
import { getStatusLabel } from "@/lib/status-labels";
import { cn } from "@/lib/utils";
import type { AgentDirectoryRunSummary, AiReviewRead } from "@/server-functions/agent-runs";
import { getAiReviewRead } from "@/server-functions/agent-runs";
import { getLastReviewedAtFn } from "@/server-functions/approvals";
import { useApprovalReview } from "@/components/approvals/use-approval-review";

/**
 * The redacted shape `loadAiReviewRead` returns — `SerializableHumanApproval` plus
 * `subject_restricted`. Aliased from `AiReviewRead` rather than importing
 * `AiReviewApproval` directly so this route stays off the read-model module; the two types
 * are structurally identical.
 */
type Approval = AiReviewRead["approvals"][number];
type Decision = "approved" | "rejected" | "escalated";

const aiReviewQuery = (filters = agentQueueSearchSchema.parse({})) =>
  routeQueryOptions({
    queryKey: crmQueryKeys.aiReview.list({ view: "queue", ...filters }),
    queryFn: () => getAiReviewRead({ data: { ...filters, queue: "approvals" } }),
  });

/** A scoped aggregate, requested only for the empty queue. */
const approvalHistoryQuery = () =>
  routeQueryOptions({
    queryKey: [...crmQueryKeys.approvals.all(), "last-reviewed-at"],
    queryFn: () => getLastReviewedAtFn(),
  });

export const Route = createFileRoute("/ai-review")({
  validateSearch: agentQueueSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    try {
      return await context.queryClient.ensureQueryData(aiReviewQuery(deps));
    } catch (error) {
      // A trusted server denial is a data-free view, avoiding an errored query during hydration.
      // The BFF still enforces both capabilities and returns403; unrelated failures keep the boundary.
      if (
        error instanceof AdminError &&
        (error.code === "FORBIDDEN" || error.code === "OUTSIDE_SCOPE")
      )
        return { accessDenied: true as const };
      throw error;
    }
  },
  head: () => ({
    meta: [
      { title: "AI Review — Fimmick ClientOps" },
      { name: "description", content: "Human review queue for AI-generated sales work." },
    ],
  }),
  errorComponent: AiReviewErrorState,
  component: AiReviewRoute,
});

/**
 * The loader reaches raw SQL through `loadAiReviewRead`, and this route had no boundary of
 * its own — a capability denial or a Neon failure rendered its own text into the page body
 * through the root boundary.
 */
function AiReviewErrorState({ error }: { error: unknown }) {
  const router = useRouter();

  return (
    <div className="px-4 py-6 md:px-6">
      <ErrorState
        kind="server"
        error={error}
        title="The AI review queue did not load"
        onRetry={() => {
          void router.invalidate({ filter: (match) => match.routeId === "/ai-review" });
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Reading an approval's context                                              */
/* -------------------------------------------------------------------------- */

type ContextData = Record<string, unknown>;

function contextOf(approval: Approval): ContextData {
  const data = approval.context_data;
  return data && typeof data === "object" && !Array.isArray(data) ? (data as ContextData) : {};
}

function stringField(context: ContextData, key: string): string | null {
  const value = context[key];
  return typeof value === "string" && value.trim() ? value : null;
}

type LinkedRecord =
  | { kind: "quote"; id: string }
  | { kind: "lead"; id: string }
  | { kind: "engagement"; id: string };

/**
 * The record this decision is about.
 *
 * Quote first: a `quote_send` payload carries both `quote_id` and `lead_id`, and the quote is
 * the record under approval. There is no per-engagement route in the product, so an engagement
 * resolves to a labelled id and a link to the board that lists it rather than a link that
 * claims to open the record.
 */
function linkedRecord(approval: Approval): LinkedRecord | null {
  const context = contextOf(approval);
  const quoteId = stringField(context, "quote_id");
  if (quoteId) return { kind: "quote", id: quoteId };
  const leadId = stringField(context, "lead_id");
  if (leadId) return { kind: "lead", id: leadId };
  const engagementId = stringField(context, "engagement_id");
  if (engagementId) return { kind: "engagement", id: engagementId };
  return null;
}

function confidenceOf(approval: Approval, run: AgentDirectoryRunSummary | null): number | null {
  if (run?.confidence_score != null) return run.confidence_score;
  const raw = contextOf(approval).confidence_score;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

/**
 * The risk or reason the agent recorded, if it recorded one.
 *
 * `renewal_risk` is rendered through the `priority` vocabulary rather than as its stored
 * `high`/`medium`/`low`, so this screen spells severity the way every other screen does.
 */
function riskNoteOf(approval: Approval): string | null {
  const context = contextOf(approval);

  const notes = context.risk_notes;
  if (Array.isArray(notes)) {
    const listed = notes.filter(
      (note): note is string => typeof note === "string" && !!note.trim(),
    );
    if (listed.length > 0) return listed.join("; ");
  }

  const reasoning = stringField(context, "risk_reasoning");
  if (reasoning) return reasoning;

  const renewalRisk = stringField(context, "renewal_risk");
  if (renewalRisk) return `Renewal risk: ${getStatusLabel("priority", renewalRisk).label}`;

  return null;
}

function agentSlug(workflowType: string | null | undefined): string | null {
  if (!workflowType) return null;
  return agentSlugForWorkflowType(workflowType);
}

/* -------------------------------------------------------------------------- */

const DECIDE_DENIED_ID = "ai-review-decide-denied";

function AiReviewRoute() {
  const data = Route.useLoaderData();
  if ("accessDenied" in data) {
    return (
      <AiReviewErrorState error={new AdminError("FORBIDDEN", "You do not have this capability")} />
    );
  }
  return <AiReviewPage initialData={data} />;
}

function AiReviewPage({
  initialData,
}: {
  initialData: Awaited<ReturnType<typeof getAiReviewRead>>;
}) {
  const filters = agentQueueSearchSchema.parse(Route.useSearch?.() ?? {});
  const navigate = useNavigate({ from: Route.fullPath });
  const { profile } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const clientNow = useClientNow();
  const queueQuery = useQuery({
    ...aiReviewQuery(filters),
    initialData,
    refetchInterval: 45_000,
    refetchIntervalInBackground: false,
  });
  const data = queueQuery.data;
  const changeFilters = (next: QueueSearch) => {
    setSelectedId(null);
    setNotes("");
    void navigate({ search: next });
  };
  const visibleFlaggedRuns = data.humanReviewRuns;

  /**
   * Confirmed decisions decorate rows on the current server page until its next refresh.
   *
   * A refreshed open queue removes terminal rows. Session confirmations remain a separate
   * count; they must never be appended to another page or resurrect withdrawn content.
   */
  const review = useApprovalReview({ kind: "ai-review" });
  const decided = review.confirmed;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [confirm, setConfirm] = useState<null | {
    title: string;
    description: string;
    label: string;
    action: () => void;
  }>(null);

  const runsById = useMemo(
    () => new Map(data.humanReviewRuns.map((run) => [run.id, run])),
    [data.humanReviewRuns],
  );

  /**
   * Server ordering is oldest first with id ties, and sorting on the same key reproduces it — so a
   * locally decided row keeps its position instead of jumping to an end of the list.
   */
  const queue = useMemo(() => {
    const merged = new Map<string, Approval>();
    for (const approval of data.approvals) {
      const saved = decided.get(approval.id);
      const retained = saved && saved.row_version >= approval.row_version;
      // A read can withdraw content without erasing a confirmed decision from this session.
      merged.set(
        approval.id,
        retained
          ? approval.subject_restricted
            ? {
                ...approval,
                status: saved.status,
                row_version: saved.row_version,
                decided_at: saved.decided_at,
                context_data: null,
                context_summary: null,
                reviewer_notes: null,
              }
            : {
                ...approval,
                ...saved,
                context_data: saved.context_data ?? null,
                subject_restricted: saved.subject_restricted === true,
              }
          : approval,
      );
    }
    return [...merged.values()].sort(
      (left, right) =>
        left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id),
    );
  }, [data.approvals, decided]);

  const pendingQueue = useMemo(
    () => queue.filter((approval) => approval.status === "pending"),
    [queue],
  );

  const selected =
    queue.find((approval) => approval.id === selectedId) ?? pendingQueue[0] ?? queue[0] ?? null;

  const isSubmitting = review.busy;

  const roleGrants = profile?.role ? ROLE_GRANTS[profile.role] : null;
  /**
   * An advisory, not a gate — and it defaults to allowed.
   *
   * `permission_overrides` can grant an individual a capability their role's baseline lacks,
   * and the client cannot see those (BD-12), so a missing baseline disables the control and
   * says why rather than pretending the server already refused. When the profile is missing
   * entirely the control stays live and the server remains the only thing that decides.
   */
  const holds = (capability: Capability) => (roleGrants ? roleGrants.has(capability) : true);
  const decideDenied = holds("approvals.decide")
    ? null
    : "Deciding AI actions is not part of your role. Ask a manager or admin to review this queue.";

  const lastReviewedQuery = useQuery({
    ...approvalHistoryQuery(),
    enabled: queue.length === 0,
  });

  const lastReviewedAt = lastReviewedQuery.data ?? null;

  const selectApproval = (id: string) => {
    setSelectedId(id);
    setNotes("");
  };

  const [panelOpen, setPanelOpen] = useState(false);
  const openApprovalPanel = (id: string) => {
    selectApproval(id);
    setPanelOpen(true);
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      if (filters.cursor) changeFilters({ ...filters, cursor: undefined });
      await queryClient.invalidateQueries({ queryKey: crmQueryKeys.aiReview.all() });
    } catch (error) {
      toast.error(toSafeErrorMessage(error, "stale"));
    } finally {
      setRefreshing(false);
    }
  };

  const refreshBusy = refreshing || queueQuery.isFetching;

  const showDecision = (approval: Approval, decision: Decision, blockedReason: string | null) => {
    const preparation = review.prepare({
      record: approval,
      decision,
      notes,
      availability: { blockedReason },
    });
    if (preparation.kind === "blocked") {
      toast.error(preparation.reason);
      return;
    }
    const nextIndex = pendingQueue.findIndex((item) => item.id === approval.id);
    const nextPending =
      nextIndex === -1
        ? (pendingQueue.find((item) => item.id !== approval.id) ?? null)
        : (pendingQueue[nextIndex + 1] ?? pendingQueue[nextIndex - 1] ?? null);
    setConfirm({
      ...preparation,
      action: () => {
        void preparation
          .confirm()
          .then((outcome) => {
            if (outcome.kind === "busy") return;
            if (outcome.kind !== "recorded") {
              toast.error(outcome.message);
              return;
            }
            setSelectedId(nextPending?.id ?? approval.id);
            setNotes("");
            toast.success(
              decision === "approved"
                ? approval.approval_type === "quote_send"
                  ? "Quote approved. Issuance is a separate step."
                  : approval.approval_type === "message_send"
                    ? "Draft approved. Copy it in Approvals for manual sending; no delivery is confirmed."
                    : "Approved — recorded and the agent run released"
                : decision === "rejected"
                  ? "Rejected — recorded and the agent run released"
                  : "Changes requested",
            );
            if (outcome.refreshFailed)
              toast.message("Decision recorded. Refresh to see the latest queue.");
          })
          .catch((error) => toast.error(toSafeErrorMessage(error)));
      },
    });
  };

  const totals = useMemo(() => {
    const pending = pendingQueue.length;
    const scores = data.humanReviewRuns
      .map((run) => run.confidence_score)
      .filter((score): score is number => score != null);
    return {
      pending,
      flaggedRuns: data.humanReviewRuns.length,
      decidedHere: decided.size,
      avgConfidence: scores.length
        ? scores.reduce((sum, score) => sum + score, 0) / scores.length
        : null,
    };
  }, [pendingQueue.length, data.humanReviewRuns, decided.size]);

  const queueColumns: ColumnDef<Approval>[] = [
    {
      id: "request",
      header: "Request",
      priority: "primary",
      cell: (approval) => {
        const record = linkedRecord(approval);
        return (
          <button
            type="button"
            onClick={() => selectApproval(approval.id)}
            aria-current={selected?.id === approval.id ? "true" : undefined}
            className="block w-full rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="font-medium text-foreground">
              {approvalTypeLabel(approval.approval_type)}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {record ? RECORD_NOUN[record.kind] : "No linked record"}
            </span>
          </button>
        );
      },
    },
    {
      id: "status",
      header: "Status",
      priority: "primary",
      cell: (approval) => <StatusBadge domain="approvals" value={approval.status} />,
    },
    {
      id: "agent",
      header: "Agent",
      priority: "secondary",
      cell: (approval) => {
        const run = approval.agent_run_id ? (runsById.get(approval.agent_run_id) ?? null) : null;
        const name = run?.agent_name ?? approval.requested_by;
        return <span className="text-xs text-muted-foreground">{name ?? "—"}</span>;
      },
    },
    {
      id: "confidence",
      header: "Confidence",
      priority: "secondary",
      numeric: true,
      cell: (approval) => {
        const run = approval.agent_run_id ? (runsById.get(approval.agent_run_id) ?? null) : null;
        return (
          <span className="text-xs tabular-nums text-muted-foreground">
            {formatPercent(confidenceOf(approval, run))}
          </span>
        );
      },
    },
    {
      id: "age",
      header: "Waiting",
      priority: "secondary",
      cell: (approval) => (
        <span className="text-xs text-muted-foreground">
          {clientNow === null
            ? formatDateTime(approval.created_at)
            : relativeTime(approval.created_at, clientNow)}
        </span>
      ),
    },
    {
      id: "risk",
      header: "Risk / reason",
      priority: "tertiary",
      cell: (approval) => (
        <span className="line-clamp-2 text-xs text-muted-foreground">
          {riskNoteOf(approval) ?? "None recorded"}
        </span>
      ),
    },
  ];

  const renderQueueCard = (approval: Approval) => {
    const run = approval.agent_run_id ? (runsById.get(approval.agent_run_id) ?? null) : null;
    return (
      <button
        type="button"
        onClick={() => openApprovalPanel(approval.id)}
        className="block w-full rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{approvalTypeLabel(approval.approval_type)}</span>
          <StatusBadge domain="approvals" value={approval.status} />
        </span>
        <span className="mt-1 block line-clamp-2 text-xs text-muted-foreground">
          {approval.context_summary ?? "No summary provided"}
        </span>
        <span className="mt-1 block text-xs text-muted-foreground">
          {run?.agent_name ?? approval.requested_by ?? "Agent unknown"} ·{" "}
          {formatPercent(confidenceOf(approval, run))} ·{" "}
          {clientNow === null
            ? formatDateTime(approval.created_at)
            : relativeTime(approval.created_at, clientNow)}
        </span>
      </button>
    );
  };

  const detailSections = (
    approval: Approval,
    surface: "inline" | "panel",
  ): RecordSummarySection[] => {
    const run = approval.agent_run_id ? (runsById.get(approval.agent_run_id) ?? null) : null;
    const record = linkedRecord(approval);
    const risk = riskNoteOf(approval);
    const isPending = approval.status === "pending";
    const context = contextOf(approval);
    const draft = stringField(context, "draft_message");
    const suggestion = stringField(context, "suggested_next_action");

    return [
      {
        id: "proposed",
        title: "Proposed action",
        content: <p className="text-sm">{approvalProposedAction(approval.approval_type)}</p>,
      },
      {
        id: "agent-summary",
        title: "Agent summary",
        content: approval.subject_restricted ? (
          <p className="text-sm text-muted-foreground">
            Restricted. This approval is about a record you do not have permission to view.
          </p>
        ) : (
          <div className="space-y-2 text-sm">
            <p>{approval.context_summary ?? "No summary provided."}</p>
            {run?.output_summary && <p className="text-muted-foreground">{run.output_summary}</p>}
            {draft && (
              <p className="whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 text-sm">
                {draft}
              </p>
            )}
            {suggestion && <p className="text-muted-foreground">Suggested next: {suggestion}</p>}
          </div>
        ),
      },
      {
        id: "source",
        title: "Source context",
        content: (
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Agent</dt>
              <dd>{run?.agent_name ?? approval.requested_by ?? "Not recorded"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Confidence</dt>
              <dd className="tabular-nums">{formatPercent(confidenceOf(approval, run))}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Raised</dt>
              <dd>{formatDateTime(approval.created_at)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Trigger</dt>
              <dd>{run?.trigger_type ?? "Not recorded"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">Risk / reason</dt>
              <dd>{risk ?? "None recorded"}</dd>
            </div>
          </dl>
        ),
      },
      {
        id: "record",
        title: "Related record",
        content: record ? (
          <RelatedRecordLink record={record} />
        ) : (
          <p className="text-sm text-muted-foreground">
            This request carries no record reference, so there is nothing to open alongside it.
          </p>
        ),
      },
      {
        id: "notes",
        title: "Reviewer notes",
        content: isPending ? (
          <Textarea
            aria-label="Reviewer notes or decision reason"
            name={`ai-review-notes-${surface}`}
            placeholder="Reviewer notes / reason for decision"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            disabled={isSubmitting}
            className="h-20 text-sm"
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {approval.reviewer_notes?.trim() || "No reviewer notes were recorded."}
          </p>
        ),
      },
      {
        id: "advanced",
        title: "Advanced",
        content: (
          <details className="rounded-md border border-border">
            <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground">
              Raw agent payload
            </summary>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap border-t border-border p-3 text-xs text-muted-foreground">
              {approval.subject_restricted
                ? "Restricted. This approval is about a record you do not have permission to view."
                : approval.context_data
                  ? JSON.stringify(approval.context_data, null, 2)
                  : "No payload data"}
            </pre>
          </details>
        ),
      },
    ];
  };

  const decisionActions = (approval: Approval) => {
    if (approval.status !== "pending") {
      const nextPending = pendingQueue[0] ?? null;
      return (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <p className="mr-auto text-xs text-muted-foreground">
            Decided {formatDateTime(approval.decided_at)}. This decision cannot be undone from
            ClientOps.
          </p>
          {approval.approval_type === "message_send" && approval.status === "approved" && (
            <Link to="/approvals" className="text-xs text-primary underline">
              Open manual message handoff
            </Link>
          )}
          {nextPending && (
            <Button size="sm" onClick={() => selectApproval(nextPending.id)}>
              <ClipboardCheck className="mr-2 h-4 w-4" aria-hidden="true" /> Review next
            </Button>
          )}
        </div>
      );
    }

    const isQuoteSend = approval.approval_type === "quote_send";
    const approveBlocked =
      decideDenied ??
      (isQuoteSend && !holds("quotes.approve")
        ? "Approving quotes is not part of your role."
        : null);
    const rejectBlocked =
      decideDenied ??
      (isQuoteSend && !holds("quotes.approve")
        ? "Rejecting quotes is not part of your role."
        : null);
    const reasons = [...new Set([approveBlocked, rejectBlocked, decideDenied].filter(Boolean))];
    const busy = isSubmitting;

    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy || Boolean(decideDenied)}
            aria-describedby={decideDenied ? DECIDE_DENIED_ID : undefined}
            onClick={() => showDecision(approval, "escalated", decideDenied)}
          >
            <AlertTriangle className="mr-2 h-4 w-4" aria-hidden="true" /> Request changes
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy || Boolean(rejectBlocked)}
            aria-describedby={rejectBlocked ? DECIDE_DENIED_ID : undefined}
            onClick={() => showDecision(approval, "rejected", rejectBlocked)}
          >
            <XCircle className="mr-2 h-4 w-4" aria-hidden="true" /> Reject
          </Button>
          <Button
            size="sm"
            disabled={busy || Boolean(approveBlocked)}
            aria-describedby={approveBlocked ? DECIDE_DENIED_ID : undefined}
            onClick={() => showDecision(approval, "approved", approveBlocked)}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
            {busy && review.decidingIds.has(approval.id) ? "Recording…" : "Approve"}
          </Button>
        </div>
        {reasons.length > 0 && (
          <p id={DECIDE_DENIED_ID} className="text-right text-xs text-muted-foreground">
            {reasons.join(" ")}
          </p>
        )}
      </div>
    );
  };

  const hasQueue = queue.length > 0;

  return (
    <>
      <WorkspaceHeader
        context="Acquire"
        title="AI Review"
        description="Accessible AI requests, filtered and ordered on the server."
        status={
          <StaleDataIndicator
            updatedAt={new Date(queueQuery.dataUpdatedAt).toISOString()}
            isRefetching={queueQuery.isFetching}
          />
        }
        primaryAction={
          <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={refreshBusy}>
            <RefreshCw
              className={cn("mr-2 h-4 w-4", refreshBusy && "animate-spin")}
              aria-hidden="true"
            />
            {refreshBusy ? "Refreshing…" : "Refresh"}
          </Button>
        }
        secondaryActions={[
          <Button key="ai-ops" size="sm" variant="outline" asChild>
            <Link to="/agents">Open AI Ops</Link>
          </Button>,
        ]}
      />

      <div className="space-y-6 px-4 py-6 md:px-6">
        <QueueToolbar queue="approvals" value={filters} onChange={changeFilters} />
        <p className="text-sm">
          This page: {data.approvals.length} /{" "}
          {data.pagination?.totalMatching ?? data.approvals.length} matching requests. Open requests
          are ordered oldest first.
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={!filters.cursor || queueQuery.isFetching}
            onClick={() => changeFilters({ ...filters, cursor: undefined })}
          >
            First review page
          </Button>
          <Button
            variant="outline"
            disabled={!data.pagination?.nextCursor || queueQuery.isFetching}
            onClick={() =>
              changeFilters({ ...filters, cursor: data.pagination?.nextCursor ?? undefined })
            }
          >
            Next review page
          </Button>
        </div>
        <MetricStrip
          metrics={[
            {
              id: "pending",
              label: "Waiting approval",
              value: totals.pending,
              hint: "pending requests on this page",
              tone: totals.pending > 0 ? "warning" : "neutral",
            },
            {
              id: "flagged",
              label: "Flagged runs",
              value: totals.flaggedRuns,
              hint: "runs linked to this page",
            },
            {
              id: "confidence",
              label: "Avg confidence",
              value: formatPercent(totals.avgConfidence),
              hint: "across this page's linked runs",
            },
            {
              id: "decided-here",
              label: "Decided in this session",
              value: totals.decidedHere,
              hint: "confirmed in this session",
            },
          ]}
          columns={4}
        />

        {!hasQueue ? (
          <EmptyWorkspaceState
            icon={CheckCircle2}
            title="No matching requests on this page"
            description={
              filters.cursor
                ? "Queue states have changed. Refresh starts from the first page."
                : emptyStateDescription(lastReviewedQuery.isPending, lastReviewedAt)
            }
            action={
              <Button size="sm" variant="outline" asChild>
                <Link to="/agents">Open AI Ops</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="space-y-3 lg:col-span-2">
              <SectionHeader
                title="Review queue"
                description="Select a request to read what the agent proposes and decide."
              />
              <ResponsiveRecordList
                columns={queueColumns}
                rows={queue}
                rowKey={(approval) => approval.id}
                renderCard={renderQueueCard}
                breakpoint="lg"
                caption="AI-generated actions waiting on a human decision"
                selectedRowKey={selected?.id}
                allowHorizontalScroll
              />
            </div>

            {/* Below lg the same record opens in RecordSummaryPanel — see the panel below. */}
            <div className="hidden lg:col-span-3 lg:block">
              {selected ? (
                <Card>
                  <CardContent className="space-y-4 p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Bot className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <span className="text-sm font-semibold">
                        {approvalTypeLabel(selected.approval_type)}
                      </span>
                      <StatusBadge domain="approvals" value={selected.status} />
                      <DemoOriginLabel value={selected.is_demo} />
                      <span className="ml-auto text-xs text-muted-foreground">
                        {formatDateTime(selected.created_at)}
                      </span>
                    </div>
                    {detailSections(selected, "inline").map((section) => (
                      <div key={section.id}>
                        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {section.title}
                        </h3>
                        <div className="mt-2">{section.content}</div>
                      </div>
                    ))}
                    {decisionActions(selected)}
                  </CardContent>
                </Card>
              ) : (
                <EmptyWorkspaceState
                  title="Select a request"
                  description="Choose a request on the left to read its proposed action and decide."
                />
              )}
            </div>
          </div>
        )}

        {visibleFlaggedRuns.length > 0 && (
          <section className="space-y-3">
            <SectionHeader
              title="Agent runs linked to this page"
              description="Read-only summaries for this review page. A run is decided through its approval."
            />
            <Card>
              <ul className="divide-y divide-border">
                {visibleFlaggedRuns.map((run) => {
                  const slug = agentSlug(run.workflow_type);
                  return (
                    <li key={run.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                      <Bot className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="font-medium">
                        {slug ? (
                          <Link
                            to="/agents/$name"
                            params={{ name: slug }}
                            search={{ runId: run.id, page: 1 }}
                            className="hover:underline"
                          >
                            {run.agent_name}
                          </Link>
                        ) : (
                          run.agent_name
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {run.subject_restricted
                          ? "Summary restricted."
                          : (run.output_summary ?? "No output summary recorded")}
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {formatPercent(run.confidence_score)}
                      </span>
                      <StatusBadge domain="agentRuns" value={run.status} />
                      <DemoOriginLabel value={run.is_demo} />
                    </li>
                  );
                })}
              </ul>
            </Card>
          </section>
        )}
      </div>

      {selected && (
        <RecordSummaryPanel
          open={panelOpen}
          onOpenChange={setPanelOpen}
          title={approvalTypeLabel(selected.approval_type)}
          subtitle={`Raised ${formatDateTime(selected.created_at)}`}
          sections={[
            {
              id: "status",
              title: "Status",
              content: <StatusBadge domain="approvals" value={selected.status} />,
            },
            ...detailSections(selected, "panel"),
          ]}
          primaryAction={decisionActions(selected)}
        />
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                confirm?.action();
                setConfirm(null);
              }}
            >
              {confirm?.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

const RECORD_NOUN: Record<LinkedRecord["kind"], string> = {
  quote: "Quote",
  lead: "Lead",
  engagement: "Engagement",
};

function RelatedRecordLink({ record }: { record: LinkedRecord }) {
  if (record.kind === "quote") {
    return (
      <Button variant="outline" size="sm" asChild>
        <Link to="/quotes/$id" params={{ id: record.id }}>
          Open quote
        </Link>
      </Button>
    );
  }

  if (record.kind === "lead") {
    return (
      <Button variant="outline" size="sm" asChild>
        <Link to="/leads/$id" params={{ id: record.id }}>
          Open lead
        </Link>
      </Button>
    );
  }

  // There is no per-engagement route in the product, so this links to the board that lists
  // engagements rather than claiming to open the record itself.
  return (
    <div className="space-y-1">
      <Button variant="outline" size="sm" asChild>
        <Link to="/renewals">Open Renewals</Link>
      </Button>
      <p className="text-xs text-muted-foreground">
        Engagements have no detail page yet, so this opens the board that lists them.
      </p>
    </div>
  );
}

/**
 * "No work needs attention", plus when something was last reviewed.
 *
 * While the history read is in flight it says nothing about a last review rather than
 * guessing, and if it fails it stays silent — an empty queue is still true.
 */
function emptyStateDescription(historyPending: boolean, lastReviewedAt: string | null): string {
  const base = "Qualification reviews, quote sends and message approvals appear here.";
  if (historyPending) return `${base} Checking when something was last reviewed…`;
  if (lastReviewedAt) return `${base} Last reviewed ${formatDateTime(lastReviewedAt)}.`;
  return `${base} Nothing has been reviewed yet.`;
}
