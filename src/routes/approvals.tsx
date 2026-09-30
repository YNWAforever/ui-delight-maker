import { useEffect, useMemo, useRef, useState } from "react";
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
import { BulkActionBar } from "@/components/operations/bulk-action-bar";
import { remainingBulkSelection } from "@/components/operations/bulk-results";
import { BulkPreviewDialog } from "@/components/operations/bulk-preview-dialog";
import { useBulkOperation } from "@/components/operations/use-bulk-operation";
import { ProfileSearchCombobox } from "@/components/people/profile-search-combobox";
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
import { approvalProposedAction } from "@/lib/approval-types";
import { toSafeErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import { formatDateTime } from "@/lib/format";
import {
  assignApprovalFn,
  claimApprovalFn,
  decideApproval,
  getApprovalsPage,
  getApprovalDetailFn,
  getMessageHandoffFn,
  recordManualMessageSentFn,
} from "@/server-functions/approvals";
import type { SerializableHumanApproval } from "@/lib/serializable";
import { approveQuote, rejectQuote } from "@/server-functions/quotes";
import type { ApprovalType } from "@/lib/types";

type Approval = Omit<SerializableHumanApproval, "context_data"> & {
  context_data?: SerializableHumanApproval["context_data"];
  quote_id: string | null;
  /** Missing legacy metadata fails closed. */
  can_decide?: boolean;
  can_request_changes?: boolean;
  can_assign?: boolean;
  can_claim?: boolean;
};
type ApprovalRead = Approval[];
type ApprovalPage = {
  items: ApprovalRead;
  nextCursor: string | null;
  total: number;
  counts: { pending: number; escalated: number; quoteSends: number };
};
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

const approvalPageKey = (group: "pending" | "history", type: ApprovalTypeFilter) =>
  crmQueryKeys.approvals.list({ group, type });
/** Kept off `approvals.list` so decisions invalidating the queue do not refetch the roster. */

/**
 * The value the reviewer Select uses for "nobody".
 *
 * Radix `SelectItem` rejects an empty string value, so unassigning needs a sentinel. It is
 * mapped back to a real `null` before the write — `assignApproval` treats null as unassign,
 * which is a deliberate action rather than an error.
 */
const UNASSIGNED_VALUE = "__unassigned__";

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
  return approval.quote_id ?? data?.quote_id ?? null;
}

export const Route = createFileRoute("/approvals")({
  // Keep the authorized page loader on the server; render the interactive queue
  // in the browser without duplicating its records as document markup.
  ssr: "data-only",
  pendingMinMs: 0,
  pendingComponent: ApprovalsPendingState,
  validateSearch: approvalSearchSchema,
  loaderDeps: ({ search }) => ({ type: search.type }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(
      routeQueryOptions({
        queryKey: approvalPageKey("pending", deps.type),
        queryFn: () =>
          getApprovalsPage({
            data: {
              group: "pending",
              type: deps.type === "all" ? undefined : deps.type,
              limit: 50,
            },
          }),
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

function ApprovalsPendingState() {
  return (
    <div role="status" className="px-4 py-6 text-sm text-muted-foreground md:px-6">
      Loading approvals…
    </div>
  );
}

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
  const loadedApprovals = Route.useLoaderData() as ApprovalPage;
  const queryClient = useQueryClient();
  const { type: typeFilter } = Route.useSearch();
  const approvalsQueryKey = approvalPageKey("pending", typeFilter);
  const historyQueryKey = approvalPageKey("history", typeFilter);
  const pageInput = (group: "pending" | "history", cursor?: string) => ({
    group,
    type: typeFilter === "all" ? undefined : typeFilter,
    cursor,
    limit: 50,
  });
  const approvalsQuery = useQuery({
    ...routeQueryOptions({
      queryKey: approvalsQueryKey,
      queryFn: (): Promise<ApprovalPage> => getApprovalsPage({ data: pageInput("pending") }),
    }),
    initialData: loadedApprovals,
    refetchInterval: () =>
      typeof document !== "undefined" && document.visibilityState === "visible" ? 30_000 : false,
    refetchIntervalInBackground: false,
  });
  const historyQuery = useQuery({
    ...routeQueryOptions({
      queryKey: historyQueryKey,
      queryFn: (): Promise<ApprovalPage> => getApprovalsPage({ data: pageInput("history") }),
    }),
  });
  const [loadingMore, setLoadingMore] = useState<"pending" | "history" | null>(null);
  const loadMore = async (group: "pending" | "history") => {
    const key = group === "pending" ? approvalsQueryKey : historyQueryKey;
    const current = queryClient.getQueryData<ApprovalPage>(key);
    if (!current?.nextCursor || loadingMore) return;
    setLoadingMore(group);
    try {
      const next = await getApprovalsPage({ data: pageInput(group, current.nextCursor) });
      queryClient.setQueryData<ApprovalPage>(key, (existing) =>
        existing ? { ...next, items: [...existing.items, ...next.items] } : next,
      );
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
    } finally {
      setLoadingMore(null);
    }
  };
  const [recentDecisions, setRecentDecisions] = useState<ApprovalRead>([]);
  useEffect(() => {
    const confirmed = new Set(historyQuery.data?.items.map((item) => item.id) ?? []);
    if (confirmed.size === 0) return;
    setRecentDecisions((current) => current.filter((item) => !confirmed.has(item.id)));
  }, [historyQuery.data?.items]);
  const allApprovals = useMemo(() => {
    const merged = new Map<string, Approval>();
    for (const item of approvalsQuery.data.items) merged.set(item.id, item);
    for (const item of historyQuery.data?.items ?? []) merged.set(item.id, item);
    for (const item of recentDecisions) merged.set(item.id, item);
    return [...merged.values()];
  }, [approvalsQuery.data.items, historyQuery.data?.items, recentDecisions]);
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
  const [manualReference, setManualReference] = useState("");
  const [bulk, setBulk] = useState<Set<string>>(new Set());
  const bulkOperation = useBulkOperation("clientops:bulk:approvals", async (result) => {
    setBulk((current) => new Set(remainingBulkSelection(Array.from(current), result)));
    await queryClient.invalidateQueries({ queryKey: crmQueryKeys.approvals.all() });
  });
  const [decidingIds, setDecidingIds] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [refreshing, setRefreshing] = useState(false);
  const approvalMutationTokensRef = useRef(new Map<string, symbol>());
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const assignReviewer = async (approval: Approval, value: string) => {
    const assignedTo = value === UNASSIGNED_VALUE ? null : value;
    if ((approval.assigned_to ?? null) === assignedTo) return;

    setAssigningId(approval.id);
    try {
      const updated = await assignApprovalFn({
        data: { id: approval.id, assignedTo, expectedVersion: approval.row_version },
      });
      queryClient.setQueryData<ApprovalPage>(approvalsQueryKey, (current) =>
        current
          ? {
              ...current,
              items: current.items.map((entry) =>
                entry.id === updated.id
                  ? { ...entry, assigned_to: updated.assigned_to, row_version: updated.row_version }
                  : entry,
              ),
            }
          : current,
      );
      toast.success(assignedTo ? "Reviewer assigned" : "Reviewer cleared");
      await queryClient.invalidateQueries({ queryKey: approvalsQueryKey, exact: true });
    } catch (error) {
      // The row is written from the server response, so a failure leaves the cache as it was.
      toast.error(toSafeErrorMessage(error));
    } finally {
      setAssigningId(null);
    }
  };

  const claimForReview = async (approval: Approval) => {
    setAssigningId(approval.id);
    try {
      const updated = await claimApprovalFn({
        data: {
          id: approval.id,
          expectedVersion: approval.row_version,
          idempotencyKey: crypto.randomUUID(),
        },
      });
      queryClient.setQueryData<ApprovalPage>(approvalsQueryKey, (current) =>
        current
          ? {
              ...current,
              items: current.items.map((entry) =>
                entry.id === updated.id
                  ? { ...entry, assigned_to: updated.assigned_to, row_version: updated.row_version }
                  : entry,
              ),
            }
          : current,
      );
      toast.success("Claimed for review");
      await queryClient.invalidateQueries({ queryKey: approvalsQueryKey, exact: true });
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
    } finally {
      setAssigningId(null);
    }
  };

  const totals = {
    pending: approvalsQuery.data.counts.pending,
    escalated: approvalsQuery.data.counts.escalated,
    quoteSends: approvalsQuery.data.counts.quoteSends,
    decided: historyQuery.data?.total ?? 0,
  };

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
          (approval.status === "approved" ||
            approval.status === "rejected" ||
            approval.status === "superseded") &&
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
    allApprovals.find((approval) => approval.id === selectedId) ??
    pending[0] ??
    escalated[0] ??
    decided[0] ??
    null;
  const nextPendingId = pending.find((approval) => approval.id !== selected?.id)?.id ?? null;
  const detailQuery = useQuery({
    ...routeQueryOptions({
      queryKey: [...crmQueryKeys.approvals.all(), "detail", selected?.id],
      queryFn: () => getApprovalDetailFn({ data: { id: selected!.id } }),
    }),
    enabled: Boolean(selected),
  });
  // Detail refresh updates affordances/payload, never revives an optimistic terminal row.
  const detailFlags = detailQuery.isError ? null : (detailQuery.data ?? selected);
  const detailApproval = selected
    ? {
        ...selected,
        can_decide: detailFlags?.can_decide === true,
        can_assign: detailFlags?.can_assign === true,
        can_claim: detailFlags?.can_claim === true,
        can_request_changes: detailFlags?.can_request_changes === true,
        context_data: detailQuery.data?.context_data,
      }
    : null;

  const messageHandoffQuery = useQuery({
    ...routeQueryOptions({
      queryKey: [...crmQueryKeys.approvals.all(), "message-handoff", selected?.id],
      queryFn: () => getMessageHandoffFn({ data: { id: selected!.id } }),
    }),
    enabled: selected?.approval_type === "message_send" && selected.status === "approved",
  });

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
    setManualReference("");
  };
  const openApprovalPanel = (id: string) => {
    selectApproval(id);
    setDetailOpen(true);
  };

  const copyApprovedDraft = async () => {
    const draft = messageHandoffQuery.data?.draftMessage;
    if (!draft) {
      toast.error("Approved draft text is unavailable");
      return;
    }
    try {
      await navigator.clipboard.writeText(draft);
      toast.success("Approved draft copied");
    } catch {
      toast.error("Could not copy the approved draft");
    }
  };

  const recordManualSend = async () => {
    if (!selected || selected.approval_type !== "message_send") return;
    try {
      await recordManualMessageSentFn({
        data: {
          approvalId: selected.id,
          reference: manualReference.trim(),
          idempotencyKey: crypto.randomUUID(),
        },
      });
      await queryClient.invalidateQueries({
        queryKey: [...crmQueryKeys.approvals.all(), "message-handoff", selected.id],
      });
      setManualReference("");
      toast.success("Manual send statement recorded; delivery is not verified by ClientOps");
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
    }
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
      (queryClient.getQueryData<ApprovalPage>(approvalsQueryKey)?.items ?? [])
        .filter((approval) => ids.includes(approval.id))
        .map((approval) => [approval.id, approval] as const),
    );
    const decidedAt = new Date().toISOString();
    const targetIds = new Set(ids);
    const mutationToken = Symbol("approval-decision");
    ids.forEach((id) => approvalMutationTokensRef.current.set(id, mutationToken));

    queryClient.setQueryData<ApprovalPage>(approvalsQueryKey, (current) =>
      current
        ? {
            ...current,
            items: current.items.map((approval) =>
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
          }
        : current,
    );

    const settled = await Promise.allSettled(targets.map((target) => target.run()));
    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: unknown }> = [];
    settled.forEach((result, index) => {
      const id = ids[index];
      if (result.status === "fulfilled") succeeded.push(id);
      else failed.push({ id, error: result.reason });
    });

    if (succeeded.length > 0) {
      const succeededRows = succeeded.flatMap((id) => {
        const previous = previousById.get(id);
        return previous
          ? [
              {
                ...previous,
                status,
                reviewer_notes: notes ?? null,
                decided_at: decidedAt,
              },
            ]
          : [];
      });
      setRecentDecisions((current) => {
        const byId = new Map(current.map((entry) => [entry.id, entry]));
        for (const entry of succeededRows) byId.set(entry.id, entry);
        return [...byId.values()];
      });
    }

    if (failed.length > 0) {
      const failedIds = new Set(failed.map((entry) => entry.id));
      queryClient.setQueryData<ApprovalPage>(approvalsQueryKey, (current) =>
        current
          ? {
              ...current,
              items: current.items.map((approval) => {
                const previous = previousById.get(approval.id);
                return previous &&
                  failedIds.has(approval.id) &&
                  approvalMutationTokensRef.current.get(approval.id) === mutationToken
                  ? previous
                  : approval;
              }),
            }
          : current,
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
      queryClient.invalidateQueries({ queryKey: historyQueryKey, exact: true }),
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

      await approveQuote({
        data: {
          id: quoteId,
          approvalId: approval.id,
          expectedVersion: approval.row_version,
          idempotencyKey: crypto.randomUUID(),
          ...(notes ? { notes } : {}),
        },
      });
      return;
    }

    await decideApproval({
      data: {
        id: approval.id,
        decision: "approved",
        notes,
        expectedVersion: approval.row_version,
        idempotencyKey: crypto.randomUUID(),
      },
    });
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

    await decideApproval({
      data: {
        id: approval.id,
        decision: "rejected",
        notes,
        expectedVersion: approval.row_version,
        idempotencyKey: crypto.randomUUID(),
      },
    });
  };

  const decideOne = async (approval: Approval, decision: ApprovalDecision) => {
    const notes = reason.trim() || undefined;
    const run =
      decision === "approved"
        ? () => approveApproval(approval, notes)
        : decision === "rejected"
          ? () => rejectApproval(approval, notes)
          : () =>
              decideApproval({
                data: {
                  id: approval.id,
                  decision,
                  notes,
                  expectedVersion: approval.row_version,
                  idempotencyKey: crypto.randomUUID(),
                },
              });

    const outcome = await applyDecisions([{ id: approval.id, run }], decision, notes);
    reportOutcome(
      outcome,
      decision === "approved"
        ? approval.approval_type === "quote_send"
          ? "Quote approved. Issuance is a separate step."
          : approval.approval_type === "message_send"
            ? "Draft approved; awaiting manual send"
            : "Approval recorded"
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
    const ids = selectedForBulk().map((approval) => approval.id);
    if (ids.length === 0) return;
    await bulkOperation.prepare({ type: "approval.decide", decision: "approved" }, ids);
  };

  const bulkReject = async () => {
    const ids = selectedForBulk().map((approval) => approval.id);
    if (ids.length === 0) return;
    const prepared = await bulkOperation.prepare(
      { type: "approval.decide", decision: "rejected", notes: rejectReason.trim() || undefined },
      ids,
    );
    if (prepared) {
      setRejectReason("");
      setRejectOpen(false);
    }
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

  const typeOptions: FilterOption[] = [
    { value: "all", label: "All types" },
    ...APPROVAL_TYPE_FILTER_VALUES.filter((value) => value !== "all").map((value) => ({
      value,
      label: approvalTypeLabel(value),
    })),
  ];

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
    if (
      approval.recovery_outcome_code === "expired" ||
      approval.recovery_outcome_code === "cancelled"
    ) {
      return `Agent run ${approval.recovery_outcome_code} by an operator. Reason: ${approval.recovery_reason ?? "not recorded"}. No customer message was sent by ClientOps.`;
    }
    if (approval.status === "superseded") {
      return "Superseded by a newer approval. This record cannot be decided.";
    }
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

    if (
      !isDecidable(approval) ||
      (approval.can_decide !== true && approval.can_request_changes !== true)
    ) {
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
            <Link to="/quotes/$id" params={{ id: quoteId }} search={{ approvalId: approval.id }}>
              <FileText className="mr-2 h-4 w-4" /> Review quote
            </Link>
          </Button>
        )}
        {approval.can_request_changes === true && approval.status === "pending" && (
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
        {approval.can_decide === true && (
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
        )}
        {approval.can_decide === true && (
          <Button
            size="sm"
            disabled={isBusy}
            onClick={() =>
              setConfirm({
                title:
                  approval.approval_type === "quote_send"
                    ? "Approve this quote?"
                    : "Approve this request?",
                description:
                  approval.approval_type === "quote_send"
                    ? "Approving closes this request and marks the quote approved. Issuing its version is a separate action for an authorized issuer."
                    : approval.approval_type === "message_send"
                      ? "The draft will be approved and await manual send. ClientOps does not send it."
                      : approvalProposedAction(approval.approval_type) + " There is no undo.",
                label: "Approve",
                action: () => runDecision(() => decideOne(approval, "approved")),
              })
            }
          >
            <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
          </Button>
        )}
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
      /**
       * Only a pending approval carries this control.
       *
       * `assignApproval` refuses to reassign anything that is not pending, so on a decided
       * approval routing is not merely unavailable — it is not meaningful, and changing the
       * reviewer on a closed decision would misrepresent who made it. A disabled control with
       * a reason would imply it might come back. It does not.
       */
      ...((approval.status === "pending" || approval.status === "escalated") &&
      (approval.can_assign === true || approval.can_claim === true)
        ? [
            {
              id: "reviewer",
              title: "Reviewer",
              content: (
                <div className="space-y-2">
                  {!approval.assigned_to && approval.can_claim === true && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isBusy || assigningId === approval.id}
                      onClick={() => void claimForReview(approval)}
                    >
                      Claim for review
                    </Button>
                  )}
                  {approval.can_assign === true && (
                    <ProfileSearchCombobox
                      purpose="approval_reviewer"
                      label={`Assign reviewer (${surface})`}
                      resourceId={approval.id}
                      value={approval.assigned_to ?? ""}
                      onChange={(value) => void assignReviewer(approval, value || UNASSIGNED_VALUE)}
                    />
                  )}
                  <p className="text-xs text-muted-foreground">
                    <UserPlus className="mr-1 inline h-3 w-3" />
                    {approval.assigned_to
                      ? "Routed to a reviewer. Decisions remain subject to each reviewer's record permissions."
                      : "Unassigned. Eligible reviewers can claim it when the linked subject is in scope."}
                  </p>
                </div>
              ),
            } satisfies RecordSummarySection,
          ]
        : []),
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
      ...(approval.approval_type === "message_send" && approval.status === "approved"
        ? [
            {
              id: "manual-handoff",
              title: "Manual send handoff",
              content: (
                <div className="space-y-3 text-sm">
                  <p>
                    The draft is approved and awaits a person to send it. ClientOps has no platform
                    delivery receipt.
                  </p>
                  {messageHandoffQuery.isPending ? (
                    <p className="text-muted-foreground">Loading approved draft…</p>
                  ) : messageHandoffQuery.isError ? (
                    <p className="text-destructive">The approved draft could not be loaded.</p>
                  ) : (
                    <>
                      <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-3">
                        {messageHandoffQuery.data?.draftMessage ??
                          "Approved draft text is unavailable."}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!messageHandoffQuery.data?.draftMessage}
                        onClick={() => void copyApprovedDraft()}
                      >
                        Copy approved draft
                      </Button>
                      {messageHandoffQuery.data?.handoff.handoff_status ===
                      "manual_send_recorded" ? (
                        <p className="text-muted-foreground">
                          Manual send recorded: {messageHandoffQuery.data.handoff.sent_reference}.
                          This is an operator statement, not a delivery receipt.
                        </p>
                      ) : messageHandoffQuery.data?.can_record_manual_send === true ? (
                        <div className="space-y-2">
                          <input
                            aria-label="Manual send reference"
                            className="w-full rounded-md border border-input bg-background px-3 py-2"
                            value={manualReference}
                            onChange={(event) => setManualReference(event.target.value)}
                            placeholder="Channel and message reference"
                          />
                          <Button
                            size="sm"
                            disabled={manualReference.trim().length < 3}
                            onClick={() => void recordManualSend()}
                          >
                            Record manual send
                          </Button>
                          <p className="text-xs text-muted-foreground">
                            Recording confirms your statement only; it does not send or verify
                            delivery.
                          </p>
                        </div>
                      ) : (
                        <p className="text-muted-foreground">
                          Awaiting a manual send statement from an authorized reviewer.
                        </p>
                      )}
                    </>
                  )}
                </div>
              ),
            } satisfies RecordSummarySection,
          ]
        : []),
      {
        id: "notes",
        title: "Reviewer notes",
        content:
          isDecidable(approval) &&
          (approval.can_decide === true || approval.can_request_changes === true) ? (
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

  const hasAnyApproval =
    typeFilter !== "all" || approvalsQuery.data.total + (historyQuery.data?.total ?? 0) > 0;
  const queueHiddenByFilter = typeFilter !== "all";

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
              hint: "matching filter",
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
              hint: "waiting for approval; issuance is separate",
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
              resultCount={approvalsQuery.data.total}
            />

            {(bulk.size > 0 || bulkOperation.result) && (
              <BulkActionBar
                selectedCount={bulk.size}
                busy={bulkOperation.busy}
                result={bulkOperation.result}
                onResume={() => void bulkOperation.resume()}
                onClear={() => {
                  setBulk(new Set());
                  bulkOperation.dismiss();
                }}
              >
                <Button
                  size="sm"
                  disabled={isBusy || bulkOperation.busy || bulk.size === 0}
                  onClick={() =>
                    setConfirm({
                      title: `Approve ${bulk.size} request${bulk.size > 1 ? "s" : ""}?`,
                      description:
                        "Each request records its own approval. Quote approval does not issue a version; message drafts await manual sending. There is no undo.",
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
                  disabled={isBusy || bulkOperation.busy || bulk.size === 0}
                  onClick={() => setRejectOpen(true)}
                >
                  <XCircle className="mr-2 h-4 w-4" /> Reject
                </Button>
              </BulkActionBar>
            )}
            <BulkPreviewDialog
              preview={bulkOperation.preview}
              busy={bulkOperation.busy}
              onCancel={bulkOperation.cancelPreview}
              onCommit={() => void bulkOperation.commit()}
            />

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
                      selection={
                        pending.some((approval) => approval.can_decide === true)
                          ? {
                              selected: bulk,
                              isRowSelectable: (approval) => approval.can_decide === true,
                              onChange: (next) => {
                                if (next.size > 100) {
                                  toast.error("Select at most 100 approvals per bulk operation.");
                                  return;
                                }
                                setBulk(
                                  new Set(
                                    [...next].filter((id) =>
                                      pending.some(
                                        (approval) =>
                                          approval.id === id && approval.can_decide === true,
                                      ),
                                    ),
                                  ),
                                );
                              },
                            }
                          : undefined
                      }
                    />
                  )}
                  {approvalsQuery.data.nextCursor && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={Boolean(loadingMore)}
                      onClick={() => void loadMore("pending")}
                    >
                      Load more pending
                    </Button>
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
                      {detailQuery.isLoading && <p className="text-sm">Loading request details…</p>}
                      {detailSections(detailApproval ?? selected, "inline").map((section) => (
                        <div key={section.id}>
                          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {section.title}
                          </h3>
                          <div className="mt-2">{section.content}</div>
                        </div>
                      ))}
                      {decisionActions(detailApproval ?? selected)}
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
                description={`${historyQuery.data?.total ?? 0} decided requests.`}
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
                    {decided.map((approval) => (
                      <li key={approval.id}>
                        <button
                          type="button"
                          className="flex w-full flex-wrap items-center gap-3 p-4 text-left text-sm"
                          onClick={() => openApprovalPanel(approval.id)}
                        >
                          <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="font-medium">
                            {approvalTypeLabel(approval.approval_type)}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-muted-foreground">
                            {approval.context_summary ?? "No summary provided"}
                          </span>
                          <StatusBadge domain="approvals" value={approval.status} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              {historyQuery.data?.nextCursor && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={Boolean(loadingMore)}
                  onClick={() => void loadMore("history")}
                >
                  Load more history
                </Button>
              )}
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
            ...detailSections(detailApproval ?? selected, "panel"),
          ]}
          primaryAction={decisionActions(detailApproval ?? selected)}
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
