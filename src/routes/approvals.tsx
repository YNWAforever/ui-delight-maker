import { useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  FileText,
  RefreshCw,
  UserPlus,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { CommandHeader, MetricStrip, WorkSurfaceEmpty } from "@/components/sales";
import { StatusBadge } from "@/components/status-badge";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useClientNow } from "@/hooks/use-client-now";
import { slaChip } from "@/lib/approval-sla";
import { cn } from "@/lib/utils";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import { formatDateTime } from "@/lib/format";
import { getApprovals, decideApproval } from "@/server-functions/approvals";
import type { SerializableHumanApproval } from "@/lib/serializable";
import { approveAndIssueQuote, rejectQuote } from "@/server-functions/quotes";
import type { HumanApproval } from "@/lib/types";
import { APP_USERS, userById } from "@/lib/users";

type ApprovalStatus = "pending" | "approved" | "rejected" | "escalated";
type ApprovalRead = SerializableHumanApproval[];

const approvalDecisionLabel = (status: ApprovalStatus) =>
  status === "escalated" ? "changes requested" : status;

const approvalSearchSchema = z.object({
  type: z.string().default("all").catch("all"),
});

const approvalsQueryKey = crmQueryKeys.approvals.list({});

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
  component: ApprovalsInbox,
});

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
  const setTypeFilter = (type: string) =>
    navigate({ search: (current) => ({ ...current, type }), replace: true });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [bulk, setBulk] = useState<Set<string>>(new Set());
  const approvalMutationTokensRef = useRef(new Map<string, symbol>());

  const pending = useMemo(
    () =>
      allApprovals
        .filter((a) => a.status === "pending")
        .filter((a) => typeFilter === "all" || a.approval_type === typeFilter),
    [allApprovals, typeFilter],
  );
  const decided = allApprovals.filter((a) => a.status !== "pending");
  const pendingCount = pending.length;
  const pendingQuoteSends = pending.filter((a) => a.approval_type === "quote_send").length;
  const selected = pending.find((a) => a.id === selectedId) ?? pending[0];

  const updateApprovalDecision = async (
    ids: string[],
    status: "approved" | "rejected" | "escalated",
    notes: string | undefined,
    mutation: () => Promise<unknown>,
  ) => {
    await queryClient.cancelQueries({ queryKey: approvalsQueryKey, exact: true });
    const previousById = new Map(
      (queryClient.getQueryData<ApprovalRead>(approvalsQueryKey) ?? [])
        .filter((approval) => ids.includes(approval.id))
        .map((approval) => [approval.id, approval] as const),
    );
    const decidedAt = new Date().toISOString();
    const selectedIds = new Set(ids);
    const mutationToken = Symbol("approval-decision");
    ids.forEach((id) => approvalMutationTokensRef.current.set(id, mutationToken));
    queryClient.setQueryData<ApprovalRead>(approvalsQueryKey, (current) =>
      current?.map((approval) =>
        selectedIds.has(approval.id)
          ? {
              ...approval,
              status,
              reviewer_notes: notes ?? approval.reviewer_notes,
              decided_at: decidedAt,
            }
          : approval,
      ),
    );

    try {
      await mutation();
    } catch (error) {
      queryClient.setQueryData<ApprovalRead>(approvalsQueryKey, (current) =>
        current?.map((approval) => {
          const previous = previousById.get(approval.id);
          return previous && approvalMutationTokensRef.current.get(approval.id) === mutationToken
            ? previous
            : approval;
        }),
      );
      ids.forEach((id) => {
        if (approvalMutationTokensRef.current.get(id) === mutationToken) {
          approvalMutationTokensRef.current.delete(id);
        }
      });
      throw error;
    }

    ids.forEach((id) => {
      if (approvalMutationTokensRef.current.get(id) === mutationToken) {
        approvalMutationTokensRef.current.delete(id);
      }
    });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: approvalsQueryKey, exact: true }),
      queryClient.invalidateQueries({ queryKey: crmQueryKeys.aiReview.all() }),
    ]);
  };

  const decide = async (id: string, status: "approved" | "rejected" | "escalated", msg: string) => {
    const notes = reason || undefined;
    await updateApprovalDecision([id], status, notes, () =>
      decideApproval({ data: { id, decision: status, notes } }),
    );
    toast.success(msg);
    setReason("");
  };

  const getQuoteId = (approval: HumanApproval): string | null => {
    if (approval.approval_type !== "quote_send") return null;
    const data = approval.context_data as { quote_id?: string } | null;
    return data?.quote_id ?? null;
  };

  const approveApproval = async (approval: HumanApproval, notes?: string) => {
    if (approval.approval_type === "quote_send") {
      const quoteId = getQuoteId(approval);
      if (!quoteId) throw new Error("Quote approval is missing quote context");

      await approveAndIssueQuote({
        data: {
          id: quoteId,
          approvalId: approval.id,
          ...(notes ? { notes } : {}),
        },
      });
      return;
    }

    await decideApproval({ data: { id: approval.id, decision: "approved", notes } });
  };

  const approveQuoteSendAsIs = async (approval: HumanApproval) => {
    const notes = reason || undefined;
    await updateApprovalDecision([approval.id], "approved", notes, () =>
      approveApproval(approval, notes),
    );
    toast.success("Quote approved and issued");
    setReason("");
  };

  const rejectApproval = async (approval: HumanApproval, notes?: string) => {
    if (approval.approval_type === "quote_send") {
      const quoteId = getQuoteId(approval);
      if (!quoteId) throw new Error("Quote approval is missing quote context");

      await rejectQuote({
        data: {
          id: quoteId,
          approvalId: approval.id,
          ...(notes ? { notes } : {}),
        },
      });
      return;
    }

    await decideApproval({ data: { id: approval.id, decision: "rejected", notes } });
  };

  const rejectSelectedApproval = async (approval: HumanApproval) => {
    const notes = reason || undefined;
    await updateApprovalDecision([approval.id], "rejected", notes, () =>
      rejectApproval(approval, notes),
    );
    toast.success("Approval rejected");
    setReason("");
  };

  const [confirm, setConfirm] = useState<null | {
    title: string;
    description: string;
    label: string;
    destructive?: boolean;
    action: () => void;
  }>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignee, setAssignee] = useState(APP_USERS[1].id);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const bulkApprove = async () => {
    const n = bulk.size;
    const selectedApprovals = allApprovals.filter((approval) => bulk.has(approval.id));
    await updateApprovalDecision([...bulk], "approved", undefined, () =>
      Promise.all(selectedApprovals.map((approval) => approveApproval(approval))),
    );
    toast.success(`Approved ${n} request${n > 1 ? "s" : ""}`);
    setBulk(new Set());
  };

  const bulkReject = async () => {
    const n = bulk.size;
    const selectedApprovals = allApprovals.filter((approval) => bulk.has(approval.id));
    const notes = rejectReason || undefined;
    await updateApprovalDecision([...bulk], "rejected", notes, () =>
      Promise.all(selectedApprovals.map((approval) => rejectApproval(approval, notes))),
    );
    toast.success(
      `Rejected ${n} request${n > 1 ? "s" : ""}${rejectReason ? ` — "${rejectReason}"` : ""}`,
    );
    setBulk(new Set());
    setRejectReason("");
    setRejectOpen(false);
  };
  const bulkAssign = () => {
    const n = bulk.size;
    // assignment not yet backed by server function — show toast only
    toast.success(`Assigned ${n} request${n > 1 ? "s" : ""} to ${userById(assignee)?.name}`);
    setBulk(new Set());
    setAssignOpen(false);
  };

  const allVisibleSelected = pending.length > 0 && pending.every((a) => bulk.has(a.id));
  const toggleAll = (v: boolean) => setBulk(v ? new Set(pending.map((a) => a.id)) : new Set());

  return (
    <>
      <CommandHeader
        title="Approval Desk"
        status="Convert"
        description={`${pendingCount} pending approvals across quote sends, agent decisions, and escalation requests.`}
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              queryClient.invalidateQueries({ queryKey: approvalsQueryKey, exact: true })
            }
          >
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        }
      />

      <div className="space-y-4 px-6 py-6">
        <MetricStrip
          metrics={[
            { label: "Pending", value: pendingCount, hint: "awaiting human decision" },
            { label: "Quote sends", value: pendingQuoteSends, hint: "pending quote approvals" },
            { label: "Decided", value: decided.length, hint: "approved, rejected, or changed" },
          ]}
          columns={3}
        />

        <Card className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-9 w-[180px]" aria-label="Filter approvals by type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="quote_send">Quote send</SelectItem>
                <SelectItem value="message_send">Message send</SelectItem>
                <SelectItem value="discount">Discount</SelectItem>
                <SelectItem value="scope_change">Scope change</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>

        {bulk.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
            <span className="font-medium">{bulk.size} selected</span>
            <Button
              size="sm"
              onClick={() =>
                setConfirm({
                  title: `Approve ${bulk.size} request${bulk.size > 1 ? "s" : ""}?`,
                  description: "Agents will proceed immediately with the proposed action.",
                  label: "Approve all",
                  action: bulkApprove,
                })
              }
            >
              <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRejectOpen(true)}>
              <XCircle className="mr-2 h-4 w-4" /> Reject
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" /> Assign reviewer
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              onClick={() => setBulk(new Set())}
            >
              Clear
            </Button>
          </div>
        )}

        {allApprovals.length === 0 ? (
          <WorkSurfaceEmpty
            title="No approvals yet"
            description="Agent approval requests will appear here when quote sends, discounts, or qualification decisions need review."
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  queryClient.invalidateQueries({ queryKey: approvalsQueryKey, exact: true })
                }
              >
                <RefreshCw className="mr-2 h-4 w-4" /> Refresh
              </Button>
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <Card className="lg:col-span-2">
                {pending.length > 0 && (
                  <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground">
                    <Checkbox
                      checked={allVisibleSelected}
                      onCheckedChange={(v) => toggleAll(!!v)}
                    />
                    <span>Select all visible ({pending.length})</span>
                  </div>
                )}
                <ul className="divide-y divide-border">
                  {pending.map((a) => {
                    const sla = clientNow === null ? null : slaChip(a.created_at, clientNow);
                    return (
                      <li
                        key={a.id}
                        role="button"
                        tabIndex={0}
                        className={cn(
                          "flex cursor-pointer items-start gap-2 p-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                          selected?.id === a.id && "bg-muted/50",
                        )}
                        onClick={() => setSelectedId(a.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            if (e.key === " ") e.preventDefault();
                            setSelectedId(a.id);
                          }
                        }}
                      >
                        <Checkbox
                          checked={bulk.has(a.id)}
                          onCheckedChange={(v) => {
                            const next = new Set(bulk);
                            if (v) {
                              next.add(a.id);
                            } else {
                              next.delete(a.id);
                            }
                            setBulk(next);
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium">
                              {a.approval_type?.replace(/_/g, " ") ?? "Approval"}
                            </span>
                            {sla ? (
                              <span
                                className={cn(
                                  "rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                                  sla.className,
                                )}
                              >
                                {sla.text}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {a.context_summary}
                          </p>
                          <p className="mt-1 text-[10px] capitalize text-muted-foreground">
                            {a.approval_type?.replace(/_/g, " ") ?? "—"}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                  {pending.length === 0 && (
                    <li className="p-4">
                      <WorkSurfaceEmpty
                        title="No pending approvals"
                        description="New quote sends and agent decisions will appear here."
                      />
                    </li>
                  )}
                </ul>
              </Card>

              <div className="lg:col-span-3">
                {selected ? (
                  <Card>
                    <CardContent className="p-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <Bot className="h-4 w-4" />
                        </div>
                        <span className="text-sm font-semibold">
                          {selected.approval_type?.replace(/_/g, " ") ?? "Approval"}
                        </span>
                        <span className="rounded-md bg-secondary px-2 py-0.5 text-xs capitalize text-secondary-foreground">
                          {selected.approval_type?.replace(/_/g, " ") ?? "—"}
                        </span>
                        <StatusBadge
                          value={selected.status}
                          label={approvalDecisionLabel(selected.status as ApprovalStatus)}
                        />
                        <span className="ml-auto text-xs text-muted-foreground">
                          {formatDateTime(selected.created_at)}
                        </span>
                      </div>
                      <p className="mt-3 text-sm">{selected.context_summary}</p>
                      <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                        {selected.context_data
                          ? JSON.stringify(selected.context_data, null, 2)
                          : "No payload data"}
                      </pre>
                      <Textarea
                        aria-label="Reviewer notes or decision reason"
                        name="decision-reason"
                        placeholder="Reviewer notes / reason for decision"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="mt-3 h-20 text-sm"
                      />
                      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                        {selected.approval_type === "quote_send" &&
                          selected.status === "pending" &&
                          (() => {
                            const quoteId = getQuoteId(selected);
                            return (
                              <>
                                {quoteId && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      navigate({
                                        to: "/quotes/$id",
                                        params: { id: quoteId },
                                        search: { edit: true, approvalId: selected.id },
                                      })
                                    }
                                  >
                                    <FileText className="mr-2 h-4 w-4" /> Review & Edit
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    setConfirm({
                                      title: "Request changes?",
                                      description:
                                        "The approval will stay visible as a changes-requested item with your reviewer notes.",
                                      label: "Request changes",
                                      action: () =>
                                        decide(selected.id, "escalated", "Changes requested"),
                                    })
                                  }
                                >
                                  <AlertTriangle className="mr-2 h-4 w-4" /> Request changes
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => rejectSelectedApproval(selected)}
                                >
                                  <XCircle className="mr-2 h-4 w-4" /> Reject
                                </Button>
                                <Button size="sm" onClick={() => approveQuoteSendAsIs(selected)}>
                                  <CheckCircle2 className="mr-2 h-4 w-4" /> Approve as-is
                                </Button>
                              </>
                            );
                          })()}

                        {selected.approval_type !== "quote_send" && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setConfirm({
                                  title: "Request changes?",
                                  description:
                                    "The approval will stay visible as a changes-requested item with your reviewer notes.",
                                  label: "Request changes",
                                  action: () =>
                                    decide(selected.id, "escalated", "Changes requested"),
                                })
                              }
                            >
                              <AlertTriangle className="mr-2 h-4 w-4" /> Request changes
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => decide(selected.id, "rejected", "Approval rejected")}
                            >
                              <XCircle className="mr-2 h-4 w-4" /> Reject
                            </Button>
                            <Button
                              size="sm"
                              onClick={() =>
                                decide(selected.id, "approved", "Approved — agent will proceed")
                              }
                            >
                              <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
                            </Button>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="p-4">
                      <WorkSurfaceEmpty
                        title="Select an approval"
                        description="Choose a pending request on the left to review its payload and decision actions."
                      />
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>

            <div>
              <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Recently decided
              </h2>
              <Card>
                {decided.length === 0 ? (
                  <div className="p-4">
                    <WorkSurfaceEmpty
                      title="No decided approvals"
                      description="Approved, rejected, and changes-requested items will appear here."
                    />
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
                    {decided.map((a) => (
                      <li key={a.id} className="flex items-center gap-3 p-4 text-sm">
                        <Bot className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">
                          {a.approval_type?.replace(/_/g, " ") ?? "Approval"}
                        </span>
                        <span className="truncate text-muted-foreground">{a.context_summary}</span>
                        <StatusBadge
                          value={a.status}
                          label={approvalDecisionLabel(a.status as ApprovalStatus)}
                          className="ml-auto"
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </>
        )}
      </div>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Assign {bulk.size} request{bulk.size > 1 ? "s" : ""}
            </DialogTitle>
            <DialogDescription>Route these approvals to a specific reviewer.</DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="bulk-reviewer" className="text-xs">
              Reviewer
            </Label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger id="bulk-reviewer" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {APP_USERS.filter((u) => u.role === "admin" || u.role === "manager").map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} · <span className="capitalize text-muted-foreground">{u.role}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>
              Cancel
            </Button>
            <Button onClick={bulkAssign}>Assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Reject {bulk.size} request{bulk.size > 1 ? "s" : ""}?
            </DialogTitle>
            <DialogDescription>
              Agents will be notified and will not proceed. A reason is recommended.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            aria-label="Reason for rejection"
            name="reject-reason"
            placeholder="Reason for rejection (optional)"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="h-24 text-sm"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={bulkReject}>
              Reject all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
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
