import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
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
import { agentSlugForDisplayName } from "@/lib/agents";
import { ROLE_GRANTS } from "@/lib/admin/policy";
import type { Capability } from "@/lib/admin/types";
import {
  approvalProposedAction,
  approvalRejectionEffect,
  approvalTypeLabel,
} from "@/lib/approval-types";
import { toSafeErrorMessage } from "@/lib/errors";
import { formatDateTime, formatPercent, relativeTime } from "@/lib/format";
import { getOperationalMutationKeys } from "@/lib/operational-invalidation";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import type { SerializableHumanApproval } from "@/lib/serializable";
import { getStatusLabel } from "@/lib/status-labels";
import { cn } from "@/lib/utils";
import type { AgentDirectoryRunSummary } from "@/server-functions/agent-runs";
import { getAiReviewRead } from "@/server-functions/agent-runs";
import { decideApproval, getApprovals } from "@/server-functions/approvals";
import { approveAndIssueQuote, rejectQuote } from "@/server-functions/quotes";

type Approval = SerializableHumanApproval;
type Decision = "approved" | "rejected" | "escalated";

const aiReviewQueryKey = crmQueryKeys.aiReview.list({ view: "queue" });

const aiReviewQuery = () =>
  routeQueryOptions({
    queryKey: aiReviewQueryKey,
    queryFn: () => getAiReviewRead(),
  });

/**
 * The decided-approval history, read only when the queue is empty.
 *
 * `loadAiReviewRead` selects `where status = 'pending'`, so it can never answer "when was the
 * last thing reviewed?" — the empty state needs a decided row, which by definition is not in
 * that result. `getApprovals` returns every approval and requires `approvals.view`, which this
 * route already holds, so this is the same authorization, not a wider one. It is gated on the
 * queue actually being empty so the common case pays nothing for it.
 */
const approvalHistoryQuery = () =>
  routeQueryOptions({
    queryKey: crmQueryKeys.approvals.list({}),
    queryFn: () => getApprovals({}),
  });

export const Route = createFileRoute("/ai-review")({
  loader: ({ context }) => context.queryClient.ensureQueryData(aiReviewQuery()),
  head: () => ({
    meta: [
      { title: "AI Review — Fimmick ClientOps" },
      { name: "description", content: "Human review queue for AI-generated sales work." },
    ],
  }),
  errorComponent: AiReviewErrorState,
  component: AiReviewPage,
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
 * the thing being issued. There is no per-engagement route in the product, so an engagement
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

function agentSlug(displayName: string | null | undefined): string | null {
  if (!displayName) return null;
  return agentSlugForDisplayName(displayName);
}

/* -------------------------------------------------------------------------- */

const DECIDE_DENIED_ID = "ai-review-decide-denied";

function AiReviewPage() {
  const initialData = Route.useLoaderData();
  const { profile } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const clientNow = useClientNow();
  const queueQuery = useQuery({ ...aiReviewQuery(), initialData });
  const data = queueQuery.data;

  /**
   * Approvals decided in this session, kept so the row stays where it was with its new status.
   *
   * The read is `where status = 'pending'`, so a decided approval disappears from the server's
   * answer entirely. Without this the row a reviewer just acted on vanished mid-click, which
   * reads as "did that work?" rather than as "done". The record is written here only after the
   * server confirms, so nothing on screen is ever a status the database did not take.
   */
  const [decided, setDecided] = useState<ReadonlyMap<string, Approval>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [submittingId, setSubmittingId] = useState<string | null>(null);
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
   * Server ordering is `created_at desc`, and re-sorting on the same key reproduces it — so a
   * locally decided row keeps its position instead of jumping to an end of the list.
   */
  const queue = useMemo(() => {
    const merged = new Map<string, Approval>();
    for (const approval of data.approvals) {
      merged.set(approval.id, decided.get(approval.id) ?? approval);
    }
    for (const [id, approval] of decided) {
      if (!merged.has(id)) merged.set(id, approval);
    }
    return [...merged.values()].sort((left, right) =>
      right.created_at.localeCompare(left.created_at),
    );
  }, [data.approvals, decided]);

  const pendingQueue = useMemo(
    () => queue.filter((approval) => approval.status === "pending"),
    [queue],
  );

  const selected =
    queue.find((approval) => approval.id === selectedId) ?? pendingQueue[0] ?? queue[0] ?? null;

  const isSubmitting = submittingId !== null;

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

  const lastReviewedAt = useMemo(() => {
    const history = lastReviewedQuery.data;
    if (!history) return null;
    return history.reduce<string | null>((latest, approval) => {
      if (!approval.decided_at) return latest;
      return latest === null || approval.decided_at > latest ? approval.decided_at : latest;
    }, null);
  }, [lastReviewedQuery.data]);

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
      await queryClient.invalidateQueries({ queryKey: aiReviewQueryKey, exact: true });
    } catch (error) {
      toast.error(toSafeErrorMessage(error, "stale"));
    } finally {
      setRefreshing(false);
    }
  };

  const refreshBusy = refreshing || queueQuery.isFetching;

  /**
   * The write, routed the same way `/approvals` routes it.
   *
   * A `quote_send` approval decided through bare `decideApproval` closes the approval and
   * leaves the quote in `pending_approval` — approved on one screen and unissued on the other.
   * `approveAndIssueQuote` and `rejectQuote` are the paths that move both, and they are the
   * paths the sibling screen already uses.
   */
  const runDecision = async (approval: Approval, decision: Decision) => {
    const trimmed = notes.trim() || undefined;
    const quoteId = approval.approval_type === "quote_send" ? linkedRecord(approval) : null;

    if (approval.approval_type === "quote_send" && quoteId?.kind !== "quote") {
      throw new Error("This quote-send approval is missing its quote reference.");
    }

    if (approval.approval_type === "quote_send" && quoteId?.kind === "quote") {
      if (decision === "approved") {
        await approveAndIssueQuote({
          data: { id: quoteId.id, approvalId: approval.id, ...(trimmed ? { notes: trimmed } : {}) },
        });
        return;
      }
      if (decision === "rejected") {
        await rejectQuote({
          data: { id: quoteId.id, approvalId: approval.id, ...(trimmed ? { notes: trimmed } : {}) },
        });
        return;
      }
    }

    await decideApproval({ data: { id: approval.id, decision, notes: trimmed } });
  };

  const decide = (approval: Approval, decision: Decision) => {
    // The in-flight lock is checked before anything else, so a second click while the first
    // write is open cannot re-enter — and every action is disabled for the duration anyway.
    if (submittingId) return;
    setSubmittingId(approval.id);

    const nextIndex = pendingQueue.findIndex((item) => item.id === approval.id);
    const nextPending =
      nextIndex === -1
        ? (pendingQueue.find((item) => item.id !== approval.id) ?? null)
        : (pendingQueue[nextIndex + 1] ?? pendingQueue[nextIndex - 1] ?? null);

    void (async () => {
      try {
        await runDecision(approval, decision);

        setDecided((current) => {
          const next = new Map(current);
          next.set(approval.id, {
            ...approval,
            status: decision,
            reviewer_notes: notes.trim() || null,
            decided_at: new Date().toISOString(),
          });
          return next;
        });
        setSelectedId(nextPending?.id ?? approval.id);
        setNotes("");

        await Promise.all(
          [
            ...getOperationalMutationKeys({ type: "approval-decision", id: approval.id }),
            // `decideApproval` also completes the agent run that was parked on this approval
            // (`update agent_runs set status='completed'`), so every agent surface is stale
            // until this key is invalidated too. Only `/approvals` did this before.
            crmQueryKeys.agents.all(),
          ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
        );

        toast.success(
          decision === "approved"
            ? approval.approval_type === "quote_send"
              ? "Quote approved and issued"
              : "Approved — recorded and the agent run released"
            : decision === "rejected"
              ? "Rejected — recorded and the agent run released"
              : "Changes requested",
        );
      } catch (error) {
        toast.error(toSafeErrorMessage(error));
      } finally {
        setSubmittingId(null);
      }
    })();
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
        content: (
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
              {approval.context_data
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
      (isQuoteSend && !holds("quotes.issue") ? "Issuing quotes is not part of your role." : null);
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
            onClick={() =>
              setConfirm({
                title: "Request changes on this request?",
                description:
                  "The request is marked Needs attention with your reviewer notes, and the agent run stays parked until a new approval is raised from the record itself.",
                label: "Request changes",
                action: () => decide(approval, "escalated"),
              })
            }
          >
            <AlertTriangle className="mr-2 h-4 w-4" aria-hidden="true" /> Request changes
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy || Boolean(rejectBlocked)}
            aria-describedby={rejectBlocked ? DECIDE_DENIED_ID : undefined}
            onClick={() =>
              setConfirm({
                title: isQuoteSend ? "Reject this quote send?" : "Reject this request?",
                description: approvalRejectionEffect(approval.approval_type),
                label: "Reject",
                action: () => decide(approval, "rejected"),
              })
            }
          >
            <XCircle className="mr-2 h-4 w-4" aria-hidden="true" /> Reject
          </Button>
          <Button
            size="sm"
            disabled={busy || Boolean(approveBlocked)}
            aria-describedby={approveBlocked ? DECIDE_DENIED_ID : undefined}
            onClick={() =>
              setConfirm({
                title: isQuoteSend ? "Approve and issue this quote?" : "Approve this request?",
                description: approvalProposedAction(approval.approval_type),
                label: isQuoteSend ? "Approve and issue" : "Approve",
                action: () => decide(approval, "approved"),
              })
            }
          >
            <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
            {busy && submittingId === approval.id ? "Recording…" : "Approve"}
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
        description={`${totals.pending} AI-generated action${totals.pending === 1 ? "" : "s"} waiting on a human decision.`}
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
        <MetricStrip
          metrics={[
            {
              id: "pending",
              label: "Waiting approval",
              value: totals.pending,
              hint: "AI actions in this queue",
              tone: totals.pending > 0 ? "warning" : "neutral",
            },
            {
              id: "flagged",
              label: "Flagged runs",
              value: totals.flaggedRuns,
              hint: "agent outputs marked for review",
            },
            {
              id: "confidence",
              label: "Avg confidence",
              value: formatPercent(totals.avgConfidence),
              hint: "across flagged runs",
            },
            {
              id: "decided-here",
              label: "Decided in this session",
              value: totals.decidedHere,
              hint: "still listed below",
            },
          ]}
          columns={4}
        />

        {!hasQueue ? (
          <EmptyWorkspaceState
            icon={CheckCircle2}
            title="No work needs attention"
            description={emptyStateDescription(lastReviewedQuery.isPending, lastReviewedAt)}
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

        {data.humanReviewRuns.length > 0 && (
          <section className="space-y-3">
            <SectionHeader
              title="Flagged agent runs"
              description="Runs the agents marked for human review. Read-only — a run is decided through the approval it raised."
            />
            <Card>
              <ul className="divide-y divide-border">
                {data.humanReviewRuns.slice(0, FLAGGED_RUN_LIMIT).map((run) => {
                  const slug = agentSlug(run.agent_name);
                  return (
                    <li key={run.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                      <Bot className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="font-medium">
                        {slug ? (
                          <Link
                            to="/agents/$name"
                            params={{ name: slug }}
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
                    </li>
                  );
                })}
              </ul>
            </Card>
            {data.humanReviewRuns.length > FLAGGED_RUN_LIMIT && (
              <p className="text-xs text-muted-foreground">
                Showing {FLAGGED_RUN_LIMIT} of {data.humanReviewRuns.length} flagged runs. The full
                history for one agent is on its page in AI Ops.
              </p>
            )}
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

const FLAGGED_RUN_LIMIT = 8;

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
