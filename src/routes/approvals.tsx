import { useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  RefreshCw,
  UserPlus,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import {
  EmptyWorkspaceState,
  ErrorState,
  FilterToolbar,
  FilteredEmptyState,
  MetricStrip,
  RecordSummaryPanel,
  ResponsiveRecordList,
  SectionHeader,
  StaleDataIndicator,
  StatusBadge,
  WorkspaceHeader,
  type ColumnDef,
  type FilterOption,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useClientNow } from "@/hooks/use-client-now";
import { slaChip } from "@/lib/approval-sla";
import { toSafeErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import { formatDateTime } from "@/lib/format";
import { getApprovals, decideApproval } from "@/server-functions/approvals";
import type { SerializableHumanApproval } from "@/lib/serializable";
import { approveAndIssueQuote, rejectQuote } from "@/server-functions/quotes";
import type { ApprovalType } from "@/lib/types";

type ApprovalRead = SerializableHumanApproval[];
type Approval = SerializableHumanApproval;
type ApprovalDecision = "approved" | "rejected" | "escalated";

/**
 * Type labels, keyed by the seven values `human_approvals.approval_type` can actually hold.
 *
 * The filter this replaces offered `scope_change`, which exists only in `src/lib/mock-data.ts`
 * and in no migration — picking it emptied the queue and read as "nothing to approve".
 * Keying on `ApprovalType` makes a new approval type a compile error here rather than a
 * silently unlabelled row.
 */
const APPROVAL_TYPE_LABELS: Record<ApprovalType, string> = {
  quote_send: "Quote send",
  message_send: "Message send",
  discount: "Discount",
  qualification_review: "Qualification review",
  campaign_send: "Campaign send",
  forecast_review: "Forecast review",
  cs_risk_review: "Risk review",
};

const APPROVAL_TYPE_FILTER_VALUES = [
  "all",
  "quote_send",
  "message_send",
  "discount",
  "qualification_review",
  "campaign_send",
  "forecast_review",
  "cs_risk_review",
] as const;

type ApprovalTypeFilter = (typeof APPROVAL_TYPE_FILTER_VALUES)[number];

function isApprovalTypeFilter(value: string): value is ApprovalTypeFilter {
  return (APPROVAL_TYPE_FILTER_VALUES as readonly string[]).includes(value);
}

function approvalTypeLabel(type: string | null | undefined): string {
  if (!type) return "Approval";
  const labels: Record<string, string | undefined> = APPROVAL_TYPE_LABELS;
  return labels[type] ?? type.replace(/_/g, " ");
}

const approvalSearchSchema = z.object({
  type: z.enum(APPROVAL_TYPE_FILTER_VALUES).default("all").catch("all"),
});

const approvalsQueryKey = crmQueryKeys.approvals.list({});

/** How many decided approvals the history list shows. `listApprovals` returns every one. */
const DECIDED_HISTORY_LIMIT = 10;

/**
 * Whether this approval can still be decided from this screen.
 *
 * `escalated` is not terminal — `decideApproval` re-decides it — but a quote-send approval
 * cannot be: `assertPendingQuoteSendApproval` (src/server-functions/quotes.ts) rejects
 * anything that is not `pending`, so an approve or reject button on an escalated quote send
 * is a control that can only ever produce an error. Its return path is the quote itself.
 */
function isDecidable(approval: Approval): boolean {
  if (approval.status === "pending") return true;
  return approval.status === "escalated" && approval.approval_type !== "quote_send";
}

function getQuoteId(approval: Approval): string | null {
  if (approval.approval_type !== "quote_send") return null;
  const data = approval.context_data as { quote_id?: string } | null;
  return data?.quote_id ?? null;
}

export const Route = createFileRoute("/approvals")({
  validateSearch: approvalSearchSchema,
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(
      routeQueryOptions({
        queryKey: approvalsQueryKey,
        queryFn: () => getApprovals({}),
      }),
    ),
  head: () => ({
    meta: [
      { title: "Approvals — Fimmick ClientOps" },
      { name: "description", content: "Pending agent actions awaiting human approval." },
    ],
  }),
  errorComponent: ApprovalsErrorState,
  component: ApprovalsInbox,
});

/**
 * Loader failures used to fall through to the root boundary, which renders `{error.message}`
 * into the page body — a Neon driver string printed as page content.
 */
function ApprovalsErrorState({ error }: { error: unknown }) {
  const router = useRouter();

  return (
    <div className="px-4 py-6 md:px-6">
      <ErrorState
        kind="server"
        error={error}
        title="Approvals did not load"
        onRetry={() => {
          void router.invalidate({ filter: (match) => match.routeId === "/approvals" });
        }}
      />
    </div>
  );
}

function ApprovalsInbox() {
  const clientNow = useClientNow();
  const loadedApprovals = Route.useLoaderData() as ApprovalRead;
  const queryClient = useQueryClient();
  const approvalsQuery = useQuery({
    ...routeQueryOptions({
      queryKey: approvalsQueryKey,
      queryFn: () => getApprovals({}),
    }),
    initialData: loadedApprovals,
    refetchInterval: 12_000,
  });
  const allApprovals = approvalsQuery.data;
  const { type: typeFilter } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const setTypeFilter = (value: string) => {
    // FilterToolbar hands back a plain string; the search schema only accepts the eight
    // real values, so anything else falls back rather than writing an unparseable URL.
    const type: ApprovalTypeFilter = isApprovalTypeFilter(value) ? value : "all";
    navigate({ search: (current) => ({ ...current, type }), replace: true });
  };
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [bulk, setBulk] = useState<Set<string>>(new Set());
  const [decidingIds, setDecidingIds] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [refreshing, setRefreshing] = useState(false);
  const approvalMutationTokensRef = useRef(new Map<string, symbol>());

  /** Workspace-wide counts. Never the type-filtered subset — the strip reads as a total. */
  const totals = useMemo(() => {
    let pending = 0;
    let escalated = 0;
    let quoteSends = 0;
    let decided = 0;
    for (const approval of allApprovals) {
      if (approval.status === "pending") {
        pending += 1;
        if (approval.approval_type === "quote_send") quoteSends += 1;
      } else if (approval.status === "escalated") {
        escalated += 1;
      } else {
        decided += 1;
      }
    }
    return { pending, escalated, quoteSends, decided };
  }, [allApprovals]);

  const pending = useMemo(
    () =>
      allApprovals.filter(
        (approval) =>
          approval.status === "pending" &&
          (typeFilter === "all" || approval.approval_type === typeFilter),
      ),
    [allApprovals, typeFilter],
  );
  const escalated = useMemo(
    () =>
      allApprovals.filter(
        (approval) =>
          approval.status === "escalated" &&
          (typeFilter === "all" || approval.approval_type === typeFilter),
      ),
    [allApprovals, typeFilter],
  );
  const decided = useMemo(
    () =>
      allApprovals.filter(
        (approval) =>
          (approval.status === "approved" || approval.status === "rejected") &&
          (typeFilter === "all" || approval.approval_type === typeFilter),
      ),
    [allApprovals, typeFilter],
  );

  /**
   * Resolved from the whole list, not from `pending`.
   *
   * That is what keeps a just-decided approval on screen carrying its new status, instead of
   * vanishing the instant the optimistic write lands — which read as "did that work?".
   */
  const selected =
    allApprovals.find((approval) => approval.id === selectedId) ?? pending[0] ?? null;
  const nextPendingId = pending.find((approval) => approval.id !== selected?.id)?.id ?? null;

  /**
   * Selecting is separate from opening the sheet on purpose.
   *
   * ResponsiveRecordList keeps both surfaces in the DOM and hides one with a media query, so
   * a single handler that opened the panel would spring a focus trap and a scroll lock on a
   * desktop reader who only clicked a table row. The table selects; the card, which is the
   * only surface visible below `lg`, also opens the panel.
   */
  const selectApproval = (id: string) => {
    setSelectedId(id);
    setReason("");
  };
  const openApprovalPanel = (id: string) => {
    selectApproval(id);
    setDetailOpen(true);
  };

  const isBusy = decidingIds.size > 0;

  const markDeciding = (ids: string[], deciding: boolean) => {
    setDecidingIds((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (deciding) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  type DecisionTarget = { id: string; run: () => Promise<unknown> };
  type DecisionOutcome = { succeeded: string[]; failed: Array<{ id: string; error: unknown }> };

  /**
   * Applies one or many decisions optimistically and settles them independently.
   *
   * The previous version ran `Promise.all` and rolled **every** optimistic row back on the
   * first rejection, then rethrew before invalidating — so a bulk approve where four of five
   * writes committed re-rendered all five as pending and refetched nothing for twelve
   * seconds. Here each target settles on its own, only the failures roll back, and the
   * invalidation runs on both paths.
   */
  const applyDecisions = async (
    targets: DecisionTarget[],
    status: ApprovalDecision,
    notes: string | undefined,
  ): Promise<DecisionOutcome> => {
    const ids = targets.map((target) => target.id);
    markDeciding(ids, true);
    await queryClient.cancelQueries({ queryKey: approvalsQueryKey, exact: true });

    const previousById = new Map(
      (queryClient.getQueryData<ApprovalRead>(approvalsQueryKey) ?? [])
        .filter((approval) => ids.includes(approval.id))
        .map((approval) => [approval.id, approval] as const),
    );
    const decidedAt = new Date().toISOString();
    const targetIds = new Set(ids);
    const mutationToken = Symbol("approval-decision");
    ids.forEach((id) => approvalMutationTokensRef.current.set(id, mutationToken));

    queryClient.setQueryData<ApprovalRead>(approvalsQueryKey, (current) =>
      current?.map((approval) =>
        targetIds.has(approval.id)
          ? {
              ...approval,
              status,
              // `decideApproval` writes `reviewer_notes = $3` unconditionally, so deciding
              // without a note clears whatever was stored. Showing the old note preserved was
              // an optimistic row that contradicted the write it stood in for.
              reviewer_notes: notes ?? null,
              decided_at: decidedAt,
            }
          : approval,
      ),
    );

    const settled = await Promise.allSettled(targets.map((target) => target.run()));
    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: unknown }> = [];
    settled.forEach((result, index) => {
      const id = ids[index];
      if (result.status === "fulfilled") succeeded.push(id);
      else failed.push({ id, error: result.reason });
    });

    if (failed.length > 0) {
      const failedIds = new Set(failed.map((entry) => entry.id));
      queryClient.setQueryData<ApprovalRead>(approvalsQueryKey, (current) =>
        current?.map((approval) => {
          const previous = previousById.get(approval.id);
          return previous &&
            failedIds.has(approval.id) &&
            approvalMutationTokensRef.current.get(approval.id) === mutationToken
            ? previous
            : approval;
        }),
      );
    }

    ids.forEach((id) => {
      if (approvalMutationTokensRef.current.get(id) === mutationToken) {
        approvalMutationTokensRef.current.delete(id);
      }
    });
    markDeciding(ids, false);

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: approvalsQueryKey, exact: true }),
      queryClient.invalidateQueries({ queryKey: crmQueryKeys.aiReview.all() }),
    ]);

    return { succeeded, failed };
  };

  const reportOutcome = (outcome: DecisionOutcome, successMessage: string) => {
    if (outcome.failed.length === 0) {
      toast.success(successMessage);
      return;
    }

    const message = toSafeErrorMessage(outcome.failed[0].error);
    if (outcome.succeeded.length === 0) {
      toast.error(message);
      return;
    }

    toast.error(
      `${outcome.succeeded.length} recorded, ${outcome.failed.length} could not be: ${message}`,
    );
  };

  const approveApproval = async (approval: Approval, notes?: string) => {
    if (approval.approval_type === "quote_send") {
      const quoteId = getQuoteId(approval);
      if (!quoteId) throw new Error("Quote approval is missing quote context");

      await approveAndIssueQuote({
        data: { id: quoteId, approvalId: approval.id, ...(notes ? { notes } : {}) },
      });
      return;
    }

    await decideApproval({ data: { id: approval.id, decision: "approved", notes } });
  };

  const rejectApproval = async (approval: Approval, notes?: string) => {
    if (approval.approval_type === "quote_send") {
      const quoteId = getQuoteId(approval);
      if (!quoteId) throw new Error("Quote approval is missing quote context");

      await rejectQuote({
        data: { id: quoteId, approvalId: approval.id, ...(notes ? { notes } : {}) },
      });
      return;
    }

    await decideApproval({ data: { id: approval.id, decision: "rejected", notes } });
  };

  const decideOne = async (approval: Approval, decision: ApprovalDecision) => {
    const notes = reason.trim() || undefined;
    const run =
      decision === "approved"
        ? () => approveApproval(approval, notes)
        : decision === "rejected"
          ? () => rejectApproval(approval, notes)
          : () => decideApproval({ data: { id: approval.id, decision, notes } });

    const outcome = await applyDecisions([{ id: approval.id, run }], decision, notes);
    reportOutcome(
      outcome,
      decision === "approved"
        ? approval.approval_type === "quote_send"
          ? "Quote approved and issued"
          : "Approved — the agent will proceed"
        : decision === "rejected"
          ? "Approval rejected"
          : "Changes requested",
    );
    if (outcome.failed.length === 0) setReason("");
  };

  const runDecision = (work: () => Promise<void>) => {
    void work().catch((error: unknown) => {
      toast.error(toSafeErrorMessage(error));
    });
  };

  const [confirm, setConfirm] = useState<null | {
    title: string;
    description: string;
    label: string;
    action: () => void;
  }>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const selectedForBulk = () =>
    allApprovals.filter((approval) => bulk.has(approval.id) && approval.status === "pending");

  const bulkApprove = async () => {
    const targets = selectedForBulk().map((approval) => ({
      id: approval.id,
      run: () => approveApproval(approval),
    }));
    if (targets.length === 0) return;

    const outcome = await applyDecisions(targets, "approved", undefined);
    reportOutcome(
      outcome,
      `Approved ${outcome.succeeded.length} request${outcome.succeeded.length === 1 ? "" : "s"}`,
    );
    setBulk(new Set());
  };

  const bulkReject = async () => {
    const notes = rejectReason.trim() || undefined;
    const targets = selectedForBulk().map((approval) => ({
      id: approval.id,
      run: () => rejectApproval(approval, notes),
    }));
    if (targets.length === 0) return;

    const outcome = await applyDecisions(targets, "rejected", notes);
    reportOutcome(
      outcome,
      `Rejected ${outcome.succeeded.length} request${outcome.succeeded.length === 1 ? "" : "s"}`,
    );
    setBulk(new Set());
    setRejectReason("");
    setRejectOpen(false);
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: approvalsQueryKey, exact: true });
    } catch (error) {
      toast.error(toSafeErrorMessage(error, "stale"));
    } finally {
      setRefreshing(false);
    }
  };

  const refreshBusy = refreshing || approvalsQuery.isFetching;

  const typeOptions: FilterOption[] = useMemo(() => {
    const present = new Set<string>();
    for (const approval of allApprovals) {
      if (approval.approval_type) present.add(approval.approval_type);
    }
    // The active filter stays listed even when nothing matches it, otherwise the Select
    // renders blank against a URL the reader can still see.
    if (typeFilter !== "all") present.add(typeFilter);
    return [
      { value: "all", label: "All types" },
      ...[...present]
        .sort((left, right) => approvalTypeLabel(left).localeCompare(approvalTypeLabel(right)))
        .map((value) => ({ value, label: approvalTypeLabel(value) })),
    ];
  }, [allApprovals, typeFilter]);

  const queueColumns: ColumnDef<Approval>[] = [
    {
      id: "request",
      header: "Request",
      priority: "primary",
      cell: (approval) => (
        <button
          type="button"
          onClick={() => selectApproval(approval.id)}
          aria-current={selected?.id === approval.id ? "true" : undefined}
          className="block w-full rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="font-medium text-foreground">
            {approvalTypeLabel(approval.approval_type)}
          </span>
          <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">
            {approval.context_summary ?? "No summary provided"}
          </span>
        </button>
      ),
    },
    {
      id: "status",
      header: "Status",
      priority: "primary",
      cell: (approval) => <StatusBadge domain="approvals" value={approval.status} />,
    },
    {
      id: "waiting",
      header: "Waiting",
      priority: "secondary",
      cell: (approval) => {
        const sla = clientNow === null ? null : slaChip(approval.created_at, clientNow);
        return sla ? (
          <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-medium", sla.className)}>
            {sla.text}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            {formatDateTime(approval.created_at)}
          </span>
        );
      },
    },
    {
      id: "raised",
      header: "Raised",
      priority: "tertiary",
      cell: (approval) => (
        <span className="text-xs text-muted-foreground">{formatDateTime(approval.created_at)}</span>
      ),
    },
  ];

  const renderQueueCard = (approval: Approval) => {
    const sla = clientNow === null ? null : slaChip(approval.created_at, clientNow);
    return (
      <button
        type="button"
        onClick={() => openApprovalPanel(approval.id)}
        className="block w-full rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{approvalTypeLabel(approval.approval_type)}</span>
          <StatusBadge domain="approvals" value={approval.status} />
          {sla && (
            <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-medium", sla.className)}>
              {sla.text}
            </span>
          )}
        </span>
        <span className="mt-1 block line-clamp-2 text-xs text-muted-foreground">
          {approval.context_summary ?? "No summary provided"}
        </span>
        <span className="mt-1 block text-xs text-muted-foreground">
          Raised {formatDateTime(approval.created_at)}
        </span>
      </button>
    );
  };

  const decidedNote = (approval: Approval): string | null => {
    if (approval.status === "escalated" && approval.approval_type === "quote_send") {
      return "Changes were requested on this quote send. It cannot be approved from here — open the quote, revise it, and request approval again.";
    }
    if (approval.status === "approved" || approval.status === "rejected") {
      return `Decided ${formatDateTime(approval.decided_at)}. This decision cannot be undone from ClientOps.`;
    }
    return null;
  };

  const decisionActions = (approval: Approval) => {
    const quoteId = getQuoteId(approval);

    if (!isDecidable(approval)) {
      return (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {quoteId && (
            <Button variant="outline" size="sm" asChild>
              <Link to="/quotes/$id" params={{ id: quoteId }} search={{ edit: true }}>
                <FileText className="mr-2 h-4 w-4" /> Open quote
              </Link>
            </Button>
          )}
          {nextPendingId && (
            <Button size="sm" onClick={() => selectApproval(nextPendingId)}>
              <ClipboardCheck className="mr-2 h-4 w-4" /> Review next pending
            </Button>
          )}
        </div>
      );
    }

    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        {quoteId && (
          <Button variant="outline" size="sm" asChild>
            <Link
              to="/quotes/$id"
              params={{ id: quoteId }}
              search={{ edit: true, approvalId: approval.id }}
            >
              <FileText className="mr-2 h-4 w-4" /> Review & edit
            </Link>
          </Button>
        )}
        {approval.status === "pending" && (
          <Button
            size="sm"
            variant="outline"
            disabled={isBusy}
            onClick={() =>
              setConfirm({
                title: "Request changes on this approval?",
                description:
                  "The request is marked Needs attention with your reviewer notes, and the agent run stays parked until a new approval is raised from the record itself.",
                label: "Request changes",
                action: () => runDecision(() => decideOne(approval, "escalated")),
              })
            }
          >
            <AlertTriangle className="mr-2 h-4 w-4" /> Request changes
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={isBusy}
          onClick={() =>
            setConfirm({
              title:
                approval.approval_type === "quote_send"
                  ? "Reject this quote send?"
                  : "Reject this request?",
              description:
                approval.approval_type === "quote_send"
                  ? "The quote is marked rejected and this approval closes. There is no reopen action — the quote has to be revised and submitted for approval again."
                  : "The agent stops and this approval closes. There is no undo.",
              label: "Reject",
              action: () => runDecision(() => decideOne(approval, "rejected")),
            })
          }
        >
          <XCircle className="mr-2 h-4 w-4" /> Reject
        </Button>
        <Button
          size="sm"
          disabled={isBusy}
          onClick={() =>
            setConfirm({
              title:
                approval.approval_type === "quote_send"
                  ? "Approve and issue this quote?"
                  : "Approve this request?",
              description:
                approval.approval_type === "quote_send"
                  ? "Approving issues a quote version immediately and closes this approval. There is no un-issue action — a change after this needs a new revision."
                  : "The agent proceeds immediately with the proposed action. There is no undo.",
              label: approval.approval_type === "quote_send" ? "Approve and issue" : "Approve",
              action: () => runDecision(() => decideOne(approval, "approved")),
            })
          }
        >
          <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
        </Button>
      </div>
    );
  };

  const detailSections = (approval: Approval, surface: "inline" | "panel") => {
    const sections: RecordSummarySection[] = [
      {
        id: "summary",
        title: "What the agent proposes",
        content: <p className="text-sm">{approval.context_summary ?? "No summary provided"}</p>,
      },
      {
        id: "payload",
        title: "Payload",
        content: (
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            {approval.context_data
              ? JSON.stringify(approval.context_data, null, 2)
              : "No payload data"}
          </pre>
        ),
      },
      {
        id: "notes",
        title: "Reviewer notes",
        content: isDecidable(approval) ? (
          <Textarea
            aria-label="Reviewer notes or decision reason"
            name={`decision-reason-${surface}`}
            placeholder="Reviewer notes / reason for decision"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={isBusy}
            className="h-20 text-sm"
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {approval.reviewer_notes?.trim() || "No reviewer notes were recorded."}
          </p>
        ),
      },
    ];
    return sections;
  };

  const hasAnyApproval = allApprovals.length > 0;
  const queueHiddenByFilter = typeFilter !== "all" && totals.pending + totals.escalated > 0;

  return (
    <>
      <WorkspaceHeader
        context="Convert"
        title="Approval Desk"
        description={`${totals.pending} waiting on a human decision, ${totals.escalated} with changes requested.`}
        status={
          clientNow === null ? undefined : (
            <StaleDataIndicator
              updatedAt={new Date(approvalsQuery.dataUpdatedAt).toISOString()}
              isRefetching={approvalsQuery.isFetching}
            />
          )
        }
        primaryAction={
          <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={refreshBusy}>
            <RefreshCw className={cn("mr-2 h-4 w-4", refreshBusy && "animate-spin")} />
            {refreshBusy ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      <div className="space-y-6 px-4 py-6 md:px-6">
        <MetricStrip
          metrics={[
            {
              id: "pending",
              label: "Waiting approval",
              value: totals.pending,
              hint: "across every type",
              tone: totals.pending > 0 ? "warning" : "neutral",
            },
            {
              id: "escalated",
              label: "Needs attention",
              value: totals.escalated,
              hint: "changes requested",
              tone: totals.escalated > 0 ? "destructive" : "neutral",
            },
            {
              id: "quote-sends",
              label: "Quote sends",
              value: totals.quoteSends,
              hint: "waiting, issued on approval",
            },
            {
              id: "decided",
              label: "Decided",
              value: totals.decided,
              hint: "approved or rejected",
            },
          ]}
          columns={4}
        />

        {!hasAnyApproval ? (
          <EmptyWorkspaceState
            title="No approvals yet"
            description="Agent approval requests appear here when quote sends, discounts or qualification decisions need a human."
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() => void refresh()}
                disabled={refreshBusy}
              >
                <RefreshCw className="mr-2 h-4 w-4" /> Refresh
              </Button>
            }
          />
        ) : (
          <>
            <FilterToolbar
              filters={[
                {
                  id: "type",
                  label: "Approval type",
                  options: typeOptions,
                  value: typeFilter,
                  onChange: setTypeFilter,
                },
              ]}
              onClear={() => setTypeFilter("all")}
              resultCount={pending.length + escalated.length}
            />

            {bulk.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                <span className="font-medium">{bulk.size} selected</span>
                <Button
                  size="sm"
                  disabled={isBusy}
                  onClick={() =>
                    setConfirm({
                      title: `Approve ${bulk.size} request${bulk.size > 1 ? "s" : ""}?`,
                      description:
                        "Each agent proceeds immediately, and every quote send in the selection is issued. There is no undo.",
                      label: "Approve all",
                      action: () => runDecision(bulkApprove),
                    })
                  }
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isBusy}
                  onClick={() => setRejectOpen(true)}
                >
                  <XCircle className="mr-2 h-4 w-4" /> Reject
                </Button>
                {/*
                  `human_approvals.assigned_to` exists and is indexed, but no server function
                  writes it — src/server-functions/approvals.ts exports only `getApprovals` and
                  `decideApproval`. The control that stood here toasted a success for a write
                  that never happened, against a hardcoded roster of five fixture users. It
                  stays visible and disabled with its reason rather than silently disappearing,
                  because the column and the ownership hook behind it are real.
                */}
                <span className="inline-flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" disabled>
                    <UserPlus className="mr-2 h-4 w-4" /> Assign reviewer
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Not available yet — approvals are decided by whoever opens them.
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => setBulk(new Set())}
                >
                  Clear selection
                </Button>
              </div>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
              <div className="space-y-6 lg:col-span-2">
                <div className="space-y-3">
                  <SectionHeader
                    title="Waiting approval"
                    description="Select a request to read its payload and decide."
                  />
                  {pending.length === 0 ? (
                    queueHiddenByFilter ? (
                      <FilteredEmptyState
                        onClear={() => setTypeFilter("all")}
                        filterSummary={`Type: ${approvalTypeLabel(typeFilter)}`}
                      />
                    ) : (
                      <EmptyWorkspaceState
                        icon={CheckCircle2}
                        title="Nothing waiting"
                        description="New quote sends and agent decisions will appear here."
                      />
                    )
                  ) : (
                    <ResponsiveRecordList
                      columns={queueColumns}
                      rows={pending}
                      rowKey={(approval) => approval.id}
                      renderCard={renderQueueCard}
                      breakpoint="lg"
                      caption="Approvals waiting on a human decision"
                      selectedRowKey={selected?.id}
                      selection={{ selected: bulk, onChange: setBulk }}
                    />
                  )}
                </div>

                {escalated.length > 0 && (
                  <div className="space-y-3">
                    <SectionHeader
                      title="Needs attention"
                      description="Changes were requested. They stay here until they are decided or re-raised."
                    />
                    <ResponsiveRecordList
                      columns={queueColumns}
                      rows={escalated}
                      rowKey={(approval) => approval.id}
                      renderCard={renderQueueCard}
                      breakpoint="lg"
                      caption="Approvals with changes requested"
                      selectedRowKey={selected?.id}
                    />
                  </div>
                )}
              </div>

              {/* Below lg the same record opens in RecordSummaryPanel — see the Sheet below. */}
              <div className="hidden lg:col-span-3 lg:block">
                {selected ? (
                  <Card>
                    <CardContent className="space-y-4 p-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <Bot className="h-4 w-4" />
                        </div>
                        <span className="text-sm font-semibold">
                          {approvalTypeLabel(selected.approval_type)}
                        </span>
                        <StatusBadge domain="approvals" value={selected.status} />
                        <span className="ml-auto text-xs text-muted-foreground">
                          {formatDateTime(selected.created_at)}
                        </span>
                      </div>
                      {decidedNote(selected) && (
                        <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                          {decidedNote(selected)}
                        </p>
                      )}
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
                    title="Select an approval"
                    description="Choose a request on the left to review its payload and decision actions."
                  />
                )}
              </div>
            </div>

            <section className="space-y-3">
              <SectionHeader
                title="Recently decided"
                description={
                  decided.length > DECIDED_HISTORY_LIMIT
                    ? `Last ${DECIDED_HISTORY_LIMIT} of ${decided.length} decided requests.`
                    : `${decided.length} decided request${decided.length === 1 ? "" : "s"}.`
                }
              />
              <Card>
                {decided.length === 0 ? (
                  <div className="p-4">
                    <EmptyWorkspaceState
                      title="No decided approvals"
                      description="Approved and rejected requests appear here."
                    />
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
                    {decided.slice(0, DECIDED_HISTORY_LIMIT).map((approval) => (
                      <li
                        key={approval.id}
                        className="flex flex-wrap items-center gap-3 p-4 text-sm"
                      >
                        <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="font-medium">
                          {approvalTypeLabel(approval.approval_type)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-muted-foreground">
                          {approval.context_summary ?? "No summary provided"}
                        </span>
                        <StatusBadge domain="approvals" value={approval.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </section>
          </>
        )}
      </div>

      {selected && (
        <RecordSummaryPanel
          open={detailOpen}
          onOpenChange={setDetailOpen}
          title={approvalTypeLabel(selected.approval_type)}
          subtitle={`Raised ${formatDateTime(selected.created_at)}`}
          sections={[
            {
              id: "status",
              title: "Status",
              content: (
                <div className="space-y-2">
                  <StatusBadge domain="approvals" value={selected.status} />
                  {decidedNote(selected) && (
                    <p className="text-xs text-muted-foreground">{decidedNote(selected)}</p>
                  )}
                </div>
              ),
            },
            ...detailSections(selected, "panel"),
          ]}
          primaryAction={decisionActions(selected)}
        />
      )}

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Reject {bulk.size} request{bulk.size > 1 ? "s" : ""}?
            </DialogTitle>
            <DialogDescription>
              Each agent stops and every selected approval closes. Quote sends in the selection are
              marked rejected on the quote itself. There is no undo.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            aria-label="Reason for rejection"
            name="reject-reason"
            placeholder="Reason for rejection (optional)"
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            className="h-24 text-sm"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={isBusy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => runDecision(bulkReject)} disabled={isBusy}>
              {isBusy ? "Rejecting…" : "Reject all"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
