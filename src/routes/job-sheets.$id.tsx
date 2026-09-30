import { useEffect, useMemo, useRef, useState, type ReactNode, type SetStateAction } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, Lock, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { BillingPortionsTable } from "@/components/job-sheets/billing-portions-table";
import { BulkActionBar } from "@/components/operations/bulk-action-bar";
import { BulkPreviewDialog } from "@/components/operations/bulk-preview-dialog";
import { remainingBulkSelection } from "@/components/operations/bulk-results";
import { useBulkOperation } from "@/components/operations/use-bulk-operation";
import { HandoffHeaderForm } from "@/components/job-sheets/handoff-header-form";
import { JobSheetStatusBadge } from "@/components/job-sheets/job-sheet-status-badge";
import { ErrorState, StickyActionBar, WorkspaceHeader } from "@/components/sales";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { toSafeErrorMessage } from "@/lib/errors";
import { formatCurrencyAmount, formatDateTime } from "@/lib/format";
import {
  buildPortionSavePayload,
  buildPreviewPortions,
  getXeroEvidenceState,
  canShowAcceptAndLockAction,
  createPortionDraft,
  describeBillingProgress,
  getAcceptBlockedReason,
  getAcceptanceGateAlertConfig,
  getJobSheetMutationQueryKeys,
  getPortionRemovalBlockedReason,
  hasUnsavedBillingDraftChanges,
  hasUnsavedXeroDraftChanges,
  isAcceptAndLockDisabled,
  isJobSheetCommercialLocked,
  isJobSheetEditorBusy,
  isNewPortionDraft,
  rebaseBillingDrafts,
  rebaseXeroDrafts,
  resetBillingDrafts,
  resetXeroDrafts,
  toPortionDrafts,
  toXeroDrafts,
  type JobSheetMutation,
  type PortionDraft,
  type XeroDraft,
} from "@/lib/job-sheet-editor";
import { crmQueryKeys } from "@/lib/query-keys";
import { canAcceptJobSheet } from "@/lib/quote-to-cash";
import type { JobSheetBillingType, JobSheetPortion, JobSheetPortionStatus } from "@/lib/types";
import {
  acceptJobSheetForAccounting,
  updateJobSheetHeader,
  updateJobSheetPortions,
  updateXeroNotes,
  confirmXeroEntry,
  correctXeroEntry,
} from "@/server-functions/job-sheets";
import { getJobSheetRead } from "@/server-functions/operations";

const BILLING_TYPE_OPTIONS: Array<{ value: JobSheetBillingType; label: string }> = [
  { value: "deposit", label: "Deposit" },
  { value: "progress", label: "Progress" },
  { value: "milestone", label: "Milestone" },
  { value: "monthly", label: "Monthly" },
  { value: "final", label: "Final" },
  { value: "other", label: "Other" },
];

const PORTION_STATUS_OPTIONS: Array<{ value: JobSheetPortionStatus; label: string }> = [
  { value: "planned", label: "Planned" },
  { value: "cancelled", label: "Cancelled" },
];

/**
 * Why the commercial fields of a portion already raised in Xero are read-only.
 *
 * The server silently discards edits to them — `replaceJobSheetPortions` wraps amount,
 * currency, target date and billing type in `case when status = 'entered_in_xero' then …`
 * — so the previous editor accepted the keystrokes, returned 200, toasted "Billing plan
 * saved" and then snapped the field back with no explanation. Worse, the reconciliation
 * preview counted the discarded number, so the acceptance gate could read "reconciles" for
 * a total the database was never going to hold.
 */
const XERO_LOCKED_REASON =
  "Recorded invoice entries lock the amount, billing type and target invoice date here. Xero itself is not changed by ClientOps.";

type ConfirmState = {
  title: string;
  description: string;
  label: string;
  action: () => void;
};

export const Route = createFileRoute("/job-sheets/$id")({
  loader: ({ params }) => getJobSheetRead({ data: { id: params.id } }),
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.jobSheet.number ?? "Job Sheet"} - Fimmick ClientOps` },
      {
        name: "description",
        content:
          "Accounting handoff detail with billing reconciliation and manual Xero references.",
      },
    ],
  }),
  errorComponent: JobSheetDetailErrorState,
  component: JobSheetDetailPage,
});

/**
 * `getJobSheetOperationsRead` throws "Job sheet not found" for an unknown id, and the root
 * boundary renders `{error.message}` straight into the page body — the same path a Neon
 * driver failure takes.
 */
function JobSheetDetailErrorState({ error }: { error: unknown }) {
  const router = useRouter();

  return (
    <div className="space-y-4 px-4 py-6 md:px-6">
      <ErrorState
        kind="server"
        error={error}
        title="This job sheet did not load"
        onRetry={() => {
          void router.invalidate({ filter: (match) => match.routeId === "/job-sheets/$id" });
        }}
      />
      <div className="flex justify-center">
        <Button variant="outline" size="sm" asChild>
          <Link to="/job-sheets">Back to all job sheets</Link>
        </Button>
      </div>
    </div>
  );
}

function JobSheetDetailPage() {
  const initialRead = Route.useLoaderData();
  const queryClient = useQueryClient();
  const router = useRouter();
  const jobSheetQuery = useQuery({
    queryKey: crmQueryKeys.jobSheets.detail(initialRead.jobSheet.id),
    queryFn: () => getJobSheetRead({ data: { id: initialRead.jobSheet.id } }),
    initialData: initialRead,
    staleTime: 30_000,
  });
  const { jobSheet, portions, quote, client, companyName, salesOwnerName, accountingOwnerName } =
    jobSheetQuery.data;
  const [billingDraftsByJobSheetId, setBillingDraftsByJobSheetId] = useState<
    Record<string, PortionDraft[]>
  >(() => ({ [jobSheet.id]: toPortionDrafts(portions) }));
  const [xeroDraftsByJobSheetId, setXeroDraftsByJobSheetId] = useState<
    Record<string, Record<string, XeroDraft>>
  >(() => ({ [jobSheet.id]: toXeroDrafts(portions) }));
  const serverPortionBaselinesByJobSheetId = useRef<Record<string, JobSheetPortion[]>>({
    [jobSheet.id]: portions,
  });
  const [savingPortions, setSavingPortions] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [savingXeroFor, setSavingXeroFor] = useState<string | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [portionErrors, setPortionErrors] = useState<Record<string, string>>({});
  const [xeroErrors, setXeroErrors] = useState<Record<string, string>>({});
  const [xeroCorrectionReasons, setXeroCorrectionReasons] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const portionDrafts = billingDraftsByJobSheetId[jobSheet.id] ?? toPortionDrafts(portions);
  const xeroDrafts = xeroDraftsByJobSheetId[jobSheet.id] ?? toXeroDrafts(portions);

  useEffect(() => {
    const previousBaseline = serverPortionBaselinesByJobSheetId.current[jobSheet.id] ?? portions;
    setBillingDraftsByJobSheetId((current) => ({
      ...current,
      [jobSheet.id]: rebaseBillingDrafts(current[jobSheet.id], previousBaseline, portions),
    }));
    setXeroDraftsByJobSheetId((current) => ({
      ...current,
      [jobSheet.id]: rebaseXeroDrafts(current[jobSheet.id], previousBaseline, portions),
    }));
    serverPortionBaselinesByJobSheetId.current = {
      ...serverPortionBaselinesByJobSheetId.current,
      [jobSheet.id]: portions,
    };
  }, [jobSheet.id, portions]);

  const setPortionDrafts = (nextState: SetStateAction<PortionDraft[]>) => {
    setBillingDraftsByJobSheetId((previousDrafts) => {
      const currentDrafts = previousDrafts[jobSheet.id] ?? toPortionDrafts(portions);
      const nextDrafts = typeof nextState === "function" ? nextState(currentDrafts) : nextState;
      return { ...previousDrafts, [jobSheet.id]: nextDrafts };
    });
  };

  const setXeroDrafts = (nextState: SetStateAction<Record<string, XeroDraft>>) => {
    setXeroDraftsByJobSheetId((previousDrafts) => {
      const currentDrafts = previousDrafts[jobSheet.id] ?? toXeroDrafts(portions);
      const nextDrafts = typeof nextState === "function" ? nextState(currentDrafts) : nextState;
      return { ...previousDrafts, [jobSheet.id]: nextDrafts };
    });
  };

  /**
   * Both halves, always.
   *
   * This route's loader is a direct `getJobSheetRead` call rather than `ensureQueryData`, so
   * `invalidateQueries` alone never re-runs it: the visible panel refreshed because the
   * component reads `jobSheetQuery.data`, but `Route.useLoaderData()` and the document title
   * built from it stayed on pre-mutation values. The scoped filter is required — a bare
   * `router.invalidate()` would re-run every loader in the tree.
   */
  const invalidateJobSheetReads = async (mutation: JobSheetMutation) => {
    await Promise.all(
      getJobSheetMutationQueryKeys(jobSheet, mutation).map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
    await router.invalidate({ filter: (match) => match.routeId === "/job-sheets/$id" });
  };

  const [bulkPortionSelected, setBulkPortionSelected] = useState<Set<string>>(() => new Set());
  const [bulkInvoiceDate, setBulkInvoiceDate] = useState("");
  const bulkPortionOperation = useBulkOperation(
    `clientops:bulk:job-sheet-portions:${jobSheet.id}`,
    async (result) => {
      setBulkPortionSelected(
        (current) => new Set(remainingBulkSelection(Array.from(current), result)),
      );
      await invalidateJobSheetReads("billing");
    },
  );

  const canEditPlan = jobSheetQuery.data.canUpdateHeader === true;
  const commercialLocked = isJobSheetCommercialLocked(jobSheet.status, jobSheet.locked_at);
  const hasUnsavedBillingChanges = useMemo(
    () => hasUnsavedBillingDraftChanges(portionDrafts, portions),
    [portionDrafts, portions],
  );
  const hasUnsavedXeroChanges = useMemo(
    () => hasUnsavedXeroDraftChanges(xeroDrafts, portions),
    [portions, xeroDrafts],
  );
  const editorBusy = isJobSheetEditorBusy({ accepting, savingPortions, savingXeroFor });

  const previewPortions = useMemo(
    () =>
      buildPreviewPortions({
        jobSheetId: jobSheet.id,
        createdAt: jobSheet.created_at,
        updatedAt: jobSheet.updated_at,
        originals: portions,
        drafts: portionDrafts,
      }),
    [jobSheet.created_at, jobSheet.id, jobSheet.updated_at, portionDrafts, portions],
  );

  const acceptance = useMemo(() => {
    const gate = canAcceptJobSheet({
      totalAmount: jobSheet.total_amount,
      portions: previewPortions,
      requirePoNumber: false,
      requirePoOrReason: true,
      poNumber: jobSheet.po_number,
      noPoReason: jobSheet.no_po_reason,
      clientOrderNumber: jobSheet.client_order_number,
      currency: jobSheet.currency,
    });
    return jobSheet.accounting_owner
      ? gate
      : {
          ok: false,
          reasons: [...gate.reasons, "Assign an active accounting owner before acceptance."],
        };
  }, [
    jobSheet.accounting_owner,
    jobSheet.client_order_number,
    jobSheet.currency,
    jobSheet.no_po_reason,
    jobSheet.po_number,
    jobSheet.total_amount,
    previewPortions,
  ]);

  const updateDraft = <K extends keyof PortionDraft>(
    id: string,
    key: K,
    value: PortionDraft[K],
  ) => {
    setPortionErrors((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
    setPortionDrafts((current) =>
      current.map((portion) => (portion.id === id ? { ...portion, [key]: value } : portion)),
    );
  };

  const addPortion = () => {
    setBillingError(null);
    setPortionDrafts((current) => [
      ...current,
      createPortionDraft({ currency: jobSheet.currency, sortOrder: current.length }),
    ]);
  };

  const removePortion = (id: string) => {
    setBillingError(null);
    setPortionErrors((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setPortionDrafts((current) => current.filter((portion) => portion.id !== id));
  };

  const savePortions = async () => {
    setBillingError(null);
    setPortionErrors({});

    if (!canEditPlan) {
      setBillingError("You do not have permission to edit this billing plan.");
      return;
    }

    if (commercialLocked) {
      setBillingError("Accepted job sheet commercial fields are immutable.");
      return;
    }

    if (hasUnsavedXeroChanges) {
      setBillingError("Save or discard the Xero references before saving the billing plan.");
      return;
    }

    // Field-level problems are anchored to the portion that caused them rather than thrown
    // at a corner toast that names no row.
    const fieldErrors: Record<string, string> = {};
    for (const portion of portionDrafts) {
      const amount = Number(portion.amount);
      if (!portion.name.trim()) {
        fieldErrors[portion.id] = "Give this portion a name before saving.";
      } else if (!Number.isFinite(amount)) {
        fieldErrors[portion.id] = "Amount must be a number.";
      } else if (amount < 0) {
        fieldErrors[portion.id] = "Amount cannot be negative.";
      }
    }
    if (Object.keys(fieldErrors).length > 0) {
      setPortionErrors(fieldErrors);
      return;
    }

    const payload = buildPortionSavePayload(portionDrafts, portions);

    setSavingPortions(true);
    try {
      const savedPortions = await updateJobSheetPortions({
        data: { id: jobSheet.id, portions: payload },
      });
      setPortionDrafts(toPortionDrafts(savedPortions));
      setXeroDrafts(toXeroDrafts(savedPortions));
      toast.success("Billing plan saved");
      await invalidateJobSheetReads("billing");
    } catch (error) {
      const message = toSafeErrorMessage(error);
      setBillingError(message);
      toast.error(message);
    } finally {
      setSavingPortions(false);
    }
  };

  const acceptNow = async () => {
    const acceptBlockedReason = getAcceptBlockedReason({
      commercialLocked,
      hasUnsavedBillingChanges,
      hasUnsavedXeroChanges,
    });
    if (acceptBlockedReason) {
      setBillingError(acceptBlockedReason);
      return;
    }

    if (!acceptance.ok) {
      setBillingError(acceptance.reasons.join(" "));
      return;
    }

    setAccepting(true);
    try {
      await acceptJobSheetForAccounting({ data: { id: jobSheet.id } });
      toast.success("Job sheet accepted and locked");
      await invalidateJobSheetReads("accept");
    } catch (error) {
      const message = toSafeErrorMessage(error);
      setBillingError(message);
      toast.error(message);
    } finally {
      setAccepting(false);
    }
  };

  const requestAccept = () =>
    setConfirm({
      title: `Accept and lock ${jobSheet.number}?`,
      description: `${formatCurrencyAmount(
        jobSheet.total_amount,
        jobSheet.currency,
      )} is locked against this handoff and every commercial field on it — portion amounts, billing types and target invoice dates — stops being editable. ClientOps has no unlock or reopen action; a change after this needs a new job sheet.`,
      label: "Accept & lock",
      action: () => {
        void acceptNow();
      },
    });

  const runXeroMutation = async (
    portionId: string,
    action: () => Promise<JobSheetPortion>,
    successMessage: string,
    noteOnly = false,
  ) => {
    setXeroErrors((current) => {
      const next = { ...current };
      delete next[portionId];
      return next;
    });
    if (hasUnsavedBillingChanges) {
      setXeroErrors((current) => ({
        ...current,
        [portionId]: "Save the billing plan before recording Xero information.",
      }));
      return false;
    }
    setSavingXeroFor(portionId);
    try {
      const saved = await action();
      setXeroDrafts((current) => ({
        ...current,
        [portionId]: noteOnly
          ? { ...current[portionId], xero_notes: saved.xero_notes ?? "" }
          : toXeroDrafts([saved])[portionId],
      }));
      toast.success(successMessage);
      await invalidateJobSheetReads("xero");
      return true;
    } catch (error) {
      const message = toSafeErrorMessage(error);
      setXeroErrors((current) => ({ ...current, [portionId]: message }));
      toast.error(message);
      return false;
    } finally {
      setSavingXeroFor(null);
    }
  };

  const saveXeroNote = (portionId: string) => {
    const persisted = portions.find((portion) => portion.id === portionId);
    const draft = xeroDrafts[portionId];
    if (!persisted || !draft) return;
    const idempotencyKey = crypto.randomUUID();
    void runXeroMutation(
      portionId,
      () =>
        updateXeroNotes({
          data: {
            portionId,
            notes: draft.xero_notes,
            expectedVersion: persisted.row_version,
            idempotencyKey,
          },
        }),
      "Accounting note saved",
      true,
    );
  };

  const requestConfirmXeroEntry = (portionId: string) => {
    const persisted = portions.find((portion) => portion.id === portionId);
    const draft = xeroDrafts[portionId];
    if (!persisted || !draft || persisted.status !== "planned") return;
    const invoiceNumber = draft.xero_invoice_number.trim();
    const reference = draft.xero_invoice_reference.trim();
    if ((!invoiceNumber && !reference) || !draft.xero_invoice_date) {
      setXeroErrors((current) => ({
        ...current,
        [portionId]: "Enter an invoice number or reference and its invoice date.",
      }));
      return;
    }
    const idempotencyKey = crypto.randomUUID();
    setConfirm({
      title: "Record this manual Xero entry?",
      description:
        "ClientOps will record the invoice identity and date you entered. This action does not contact Xero or verify delivery there.",
      label: "Record manual entry",
      action: () => {
        void runXeroMutation(
          portionId,
          () =>
            confirmXeroEntry({
              data: {
                portionId,
                invoiceNumber,
                reference,
                invoiceDate: draft.xero_invoice_date,
                expectedVersion: persisted.row_version,
                idempotencyKey,
              },
            }),
          "Manual invoice entry recorded",
        );
      },
    });
  };

  const requestCorrectXeroEntry = (
    portionId: string,
    nextStatus: "planned" | "entered_in_xero",
  ) => {
    const persisted = portions.find((portion) => portion.id === portionId);
    const draft = xeroDrafts[portionId];
    const reason = xeroCorrectionReasons[portionId]?.trim() ?? "";
    if (!persisted || !draft || persisted.status !== "entered_in_xero") return;
    if (!reason) {
      setXeroErrors((current) => ({
        ...current,
        [portionId]: "Enter a correction reason before changing recorded invoice evidence.",
      }));
      return;
    }
    const idempotencyKey = crypto.randomUUID();
    setConfirm({
      title: nextStatus === "planned" ? "Reopen this invoice entry?" : "Correct invoice evidence?",
      description:
        nextStatus === "planned"
          ? "This records a reasoned correction and returns the portion to Planned. It does not void anything in Xero."
          : "This changes the manually recorded invoice identity in ClientOps. It does not change Xero.",
      label: nextStatus === "planned" ? "Reopen with reason" : "Save correction",
      action: () => {
        void runXeroMutation(
          portionId,
          () =>
            correctXeroEntry({
              data: {
                portionId,
                expectedVersion: persisted.row_version,
                idempotencyKey,
                reason,
                patch: {
                  status: nextStatus,
                  ...(nextStatus === "entered_in_xero"
                    ? {
                        invoiceNumber: draft.xero_invoice_number,
                        reference: draft.xero_invoice_reference,
                        invoiceDate: draft.xero_invoice_date,
                      }
                    : {}),
                },
              },
            }),
          "Manual invoice evidence corrected",
        ).then((saved) => {
          if (saved) setXeroCorrectionReasons((current) => ({ ...current, [portionId]: "" }));
        });
      },
    });
  };

  const acceptanceGateAlert = getAcceptanceGateAlertConfig({
    commercialLocked,
    hasUnsavedBillingChanges,
    hasUnsavedXeroChanges,
    acceptanceOk: acceptance.ok,
    acceptanceReasons: acceptance.reasons,
  });

  const acceptDisabled = isAcceptAndLockDisabled({
    editorBusy,
    hasUnsavedBillingChanges,
    hasUnsavedXeroChanges,
    acceptanceOk: acceptance.ok,
  });

  /**
   * The reason lives with the button, not two cards below it.
   *
   * `editorBusy` is included because it was the one gate that disabled the control while
   * producing no message at all.
   */
  const acceptDisabledReason = editorBusy
    ? "Waiting for the save in progress to finish."
    : (getAcceptBlockedReason({
        commercialLocked,
        hasUnsavedBillingChanges,
        hasUnsavedXeroChanges,
      }) ?? (acceptance.ok ? null : acceptance.reasons.join(" ")));

  const showAcceptAction =
    jobSheetQuery.data.canAcceptJobSheet &&
    canShowAcceptAndLockAction(jobSheet.status, jobSheet.locked_at);
  const savedPortionIds = useMemo(() => new Set(portions.map((portion) => portion.id)), [portions]);

  return (
    <>
      <WorkspaceHeader
        context="Deliver"
        title={jobSheet.number}
        backHref={{ to: "/job-sheets", label: "All job sheets" }}
        description={`Accepted quote total ${formatCurrencyAmount(jobSheet.total_amount, jobSheet.currency)}. ${describeBillingProgress(portions)}.`}
        status={<JobSheetStatusBadge status={jobSheet.status} />}
        primaryAction={
          showAcceptAction ? (
            <div className="flex flex-col items-start gap-1 md:items-end">
              <Button size="sm" onClick={requestAccept} disabled={acceptDisabled}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Accept &amp; lock
              </Button>
              {acceptDisabled && acceptDisabledReason && (
                <p className="max-w-xs text-xs text-muted-foreground md:text-right">
                  {acceptDisabledReason}
                </p>
              )}
            </div>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-6 px-4 py-6 md:px-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle className="text-base">Billing portions</CardTitle>
              {!commercialLocked && canEditPlan && (
                <Button variant="outline" size="sm" onClick={addPortion} disabled={editorBusy}>
                  <Plus className="mr-2 h-4 w-4" /> Add portion
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {!canEditPlan && (
                <p className="text-sm text-muted-foreground">
                  You do not have permission to edit this billing plan.
                </p>
              )}
              <BillingPortionsTable
                totalAmount={jobSheet.total_amount}
                currency={jobSheet.currency}
                portions={previewPortions}
              />

              {jobSheetQuery.data.canUpdateHeader &&
                (bulkPortionSelected.size > 0 || bulkPortionOperation.result) && (
                  <BulkActionBar
                    selectedCount={bulkPortionSelected.size}
                    busy={bulkPortionOperation.busy}
                    result={bulkPortionOperation.result}
                    onResume={() => void bulkPortionOperation.resume()}
                    onClear={() => {
                      setBulkPortionSelected(new Set());
                      bulkPortionOperation.dismiss();
                    }}
                  >
                    {bulkPortionSelected.size > 0 && (
                      <>
                        <Label className="flex items-center gap-2 text-xs">
                          Target invoice date
                          <Input
                            type="date"
                            value={bulkInvoiceDate}
                            onChange={(event) => setBulkInvoiceDate(event.target.value)}
                            className="w-40"
                          />
                        </Label>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={
                            bulkPortionOperation.busy ||
                            editorBusy ||
                            hasUnsavedBillingChanges ||
                            hasUnsavedXeroChanges
                          }
                          onClick={() =>
                            void bulkPortionOperation.prepare(
                              {
                                type: "job_sheet.invoice_date",
                                targetInvoiceDate: bulkInvoiceDate || null,
                              },
                              Array.from(bulkPortionSelected),
                            )
                          }
                        >
                          Set invoice date
                        </Button>
                      </>
                    )}
                  </BulkActionBar>
                )}
              <BulkPreviewDialog
                preview={bulkPortionOperation.preview}
                busy={bulkPortionOperation.busy}
                onCancel={bulkPortionOperation.cancelPreview}
                onCommit={() => void bulkPortionOperation.commit()}
              />

              <Alert variant={acceptanceGateAlert.variant}>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>{acceptanceGateAlert.title}</AlertTitle>
                <AlertDescription>{acceptanceGateAlert.description}</AlertDescription>
              </Alert>

              {billingError && (
                <Alert variant="destructive" role="alert">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Billing plan not saved</AlertTitle>
                  <AlertDescription>{billingError}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-3">
                {portionDrafts.map((portion, index) => {
                  const persisted = portions.find((row) => row.id === portion.id) ?? null;
                  const enteredInXero = portion.status === "entered_in_xero";
                  const legacyEvidenceReview =
                    persisted && getXeroEvidenceState(persisted) === "needs_review";
                  const commercialFieldsDisabled =
                    !canEditPlan || commercialLocked || editorBusy || enteredInXero;
                  const removalBlockedReason = persisted
                    ? getPortionRemovalBlockedReason(persisted)
                    : null;
                  const cancelledWithAmount =
                    portion.status === "cancelled" && (Number(portion.amount) || 0) !== 0;
                  const fieldError = portionErrors[portion.id];

                  return (
                    <div key={portion.id} className="rounded-md border border-border p-4">
                      {persisted && jobSheetQuery.data.canUpdateHeader && (
                        <Label className="mb-3 flex items-center gap-2 text-xs">
                          <Checkbox
                            checked={bulkPortionSelected.has(persisted.id)}
                            onCheckedChange={(checked) => {
                              setBulkPortionSelected((current) => {
                                const next = new Set(current);
                                if (checked === true) next.add(persisted.id);
                                else next.delete(persisted.id);
                                if (next.size > 100) {
                                  toast.error("Select at most 100 portions per bulk operation.");
                                  return current;
                                }
                                return next;
                              });
                            }}
                            aria-label={`Select portion ${portion.name} for bulk date change`}
                          />
                          Select for bulk invoice date
                        </Label>
                      )}
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div className="space-y-1.5 xl:col-span-2">
                          <Label htmlFor={`portion-name-${portion.id}`}>
                            Portion {index + 1}
                            {isNewPortionDraft(portion.id) && (
                              <span className="ml-2 text-xs font-normal text-muted-foreground">
                                Not saved yet
                              </span>
                            )}
                          </Label>
                          <Input
                            id={`portion-name-${portion.id}`}
                            value={portion.name}
                            onChange={(event) =>
                              updateDraft(portion.id, "name", event.target.value)
                            }
                            disabled={!canEditPlan || commercialLocked || editorBusy}
                            aria-invalid={fieldError ? true : undefined}
                            aria-describedby={
                              fieldError ? `portion-error-${portion.id}` : undefined
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`portion-amount-${portion.id}`}>Amount</Label>
                          <Input
                            id={`portion-amount-${portion.id}`}
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="0.01"
                            value={portion.amount}
                            onChange={(event) =>
                              updateDraft(portion.id, "amount", event.target.value)
                            }
                            disabled={commercialFieldsDisabled}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Billing type</Label>
                          <Select
                            value={portion.billing_type}
                            onValueChange={(value) =>
                              updateDraft(portion.id, "billing_type", value as JobSheetBillingType)
                            }
                            disabled={commercialFieldsDisabled}
                          >
                            <SelectTrigger aria-label={`Billing type for ${portion.name}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {BILLING_TYPE_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Status</Label>
                          {enteredInXero ? (
                            <div className="flex h-10 items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">
                              {legacyEvidenceReview
                                ? "Needs invoice evidence review"
                                : "Manual entry recorded"}
                            </div>
                          ) : (
                            <Select
                              value={portion.status}
                              onValueChange={(value) =>
                                updateDraft(portion.id, "status", value as JobSheetPortionStatus)
                              }
                              disabled={!canEditPlan || commercialLocked || editorBusy}
                            >
                              <SelectTrigger aria-label={`Status for ${portion.name}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {PORTION_STATUS_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`portion-target-date-${portion.id}`}>
                            Target invoice date
                          </Label>
                          <Input
                            id={`portion-target-date-${portion.id}`}
                            type="date"
                            value={portion.target_invoice_date}
                            onChange={(event) =>
                              updateDraft(portion.id, "target_invoice_date", event.target.value)
                            }
                            disabled={commercialFieldsDisabled}
                          />
                        </div>
                        <div className="space-y-1.5 md:col-span-2 xl:col-span-4">
                          <Label htmlFor={`portion-description-${portion.id}`}>Billing note</Label>
                          <Textarea
                            id={`portion-description-${portion.id}`}
                            value={portion.description}
                            onChange={(event) =>
                              updateDraft(portion.id, "description", event.target.value)
                            }
                            disabled={!canEditPlan || commercialLocked || editorBusy}
                            className="min-h-[88px]"
                          />
                        </div>
                      </div>

                      {enteredInXero && (
                        <p className="mt-3 text-xs text-muted-foreground">{XERO_LOCKED_REASON}</p>
                      )}

                      {/*
                        `getPortionReconciliation` sums every portion regardless of status, so a
                        cancelled portion keeps its amount in "Planned billing" and the acceptance
                        gate keeps failing. Until that is fixed in the reconciliation itself, say
                        so where the user made the choice.
                      */}
                      {cancelledWithAmount && (
                        <p className="mt-3 text-xs text-warning-foreground">
                          Cancelled portions still count toward planned billing. Set this amount to
                          0 for the plan to reconcile.
                        </p>
                      )}

                      {fieldError && (
                        <p
                          id={`portion-error-${portion.id}`}
                          role="alert"
                          className="mt-3 text-xs text-destructive"
                        >
                          {fieldError}
                        </p>
                      )}

                      {!commercialLocked && canEditPlan && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removePortion(portion.id)}
                            disabled={editorBusy || removalBlockedReason !== null}
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Remove portion
                          </Button>
                          {removalBlockedReason && (
                            <span className="text-xs text-muted-foreground">
                              {removalBlockedReason}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {portionDrafts.length === 0 && (
                  <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                    No billing portions yet. Add one so the plan can reconcile with the accepted
                    quote total.
                  </p>
                )}
              </div>

              {!commercialLocked && canEditPlan && (
                <StickyActionBar>
                  {hasUnsavedBillingChanges && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setPortionErrors({});
                        setBillingError(null);
                        setPortionDrafts(resetBillingDrafts(portions));
                      }}
                      disabled={editorBusy}
                    >
                      <RotateCcw className="mr-2 h-4 w-4" /> Discard billing changes
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => void savePortions()}
                    disabled={editorBusy || !hasUnsavedBillingChanges}
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {savingPortions ? "Saving…" : "Save billing plan"}
                  </Button>
                </StickyActionBar>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle className="text-base">Manual invoice evidence</CardTitle>
              {hasUnsavedXeroChanges && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setXeroErrors({});
                    setXeroDrafts(resetXeroDrafts(portions));
                  }}
                  disabled={editorBusy}
                >
                  <RotateCcw className="mr-2 h-4 w-4" /> Discard Xero changes
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                ClientOps records what accounting staff enter here. It does not sync, send, or
                verify an invoice in Xero; Xero remains the official accounting system.
              </p>
              {hasUnsavedBillingChanges && (
                <p className="text-sm text-destructive">
                  Save the billing plan before saving Xero references.
                </p>
              )}
              {previewPortions
                .filter((portion) => savedPortionIds.has(portion.id))
                .map((portion) => {
                  const canEditInvoice =
                    jobSheetQuery.data.canUpdateInvoiceByPortion?.[portion.id] === true;
                  const draft = xeroDrafts[portion.id] ?? {
                    xero_invoice_number: "",
                    xero_invoice_reference: "",
                    xero_invoice_date: "",
                    xero_notes: "",
                  };
                  const rowError = xeroErrors[portion.id];
                  const persisted = portions.find((row) => row.id === portion.id);
                  const persistedDraft = persisted ? toXeroDrafts([persisted])[portion.id] : null;
                  const noteDirty =
                    persistedDraft !== null && draft.xero_notes !== persistedDraft.xero_notes;
                  const evidenceDirty =
                    persistedDraft !== null &&
                    (draft.xero_invoice_number !== persistedDraft.xero_invoice_number ||
                      draft.xero_invoice_reference !== persistedDraft.xero_invoice_reference ||
                      draft.xero_invoice_date !== persistedDraft.xero_invoice_date);
                  const needsReview =
                    persisted && getXeroEvidenceState(persisted) === "needs_review";

                  return (
                    <div key={portion.id} className="rounded-md border border-border p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-medium">{portion.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatCurrencyAmount(portion.amount, portion.currency)}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => saveXeroNote(portion.id)}
                            disabled={
                              !canEditInvoice ||
                              editorBusy ||
                              hasUnsavedBillingChanges ||
                              !noteDirty
                            }
                          >
                            <Save className="mr-2 h-4 w-4" /> Save note
                          </Button>
                          {persisted?.status === "planned" && (
                            <Button
                              size="sm"
                              onClick={() => requestConfirmXeroEntry(portion.id)}
                              disabled={!canEditInvoice || editorBusy || hasUnsavedBillingChanges}
                            >
                              Record manual entry
                            </Button>
                          )}
                          {persisted?.status === "entered_in_xero" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  requestCorrectXeroEntry(portion.id, "entered_in_xero")
                                }
                                disabled={
                                  !canEditInvoice ||
                                  editorBusy ||
                                  hasUnsavedBillingChanges ||
                                  !evidenceDirty
                                }
                              >
                                Correct invoice details
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => requestCorrectXeroEntry(portion.id, "planned")}
                                disabled={!canEditInvoice || editorBusy || hasUnsavedBillingChanges}
                              >
                                Reopen after void
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                      {!canEditInvoice && (
                        <p className="mt-3 text-sm text-muted-foreground">
                          You do not have permission to change this portion's invoice records.
                        </p>
                      )}
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor={`xero-number-${portion.id}`}>Invoice number</Label>
                          <Input
                            id={`xero-number-${portion.id}`}
                            value={draft.xero_invoice_number}
                            onChange={(event) =>
                              setXeroDrafts((current) => ({
                                ...current,
                                [portion.id]: { ...draft, xero_invoice_number: event.target.value },
                              }))
                            }
                            disabled={
                              !canEditInvoice || editorBusy || persisted?.status === "cancelled"
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`xero-reference-${portion.id}`}>Reference</Label>
                          <Input
                            id={`xero-reference-${portion.id}`}
                            value={draft.xero_invoice_reference}
                            onChange={(event) =>
                              setXeroDrafts((current) => ({
                                ...current,
                                [portion.id]: {
                                  ...draft,
                                  xero_invoice_reference: event.target.value,
                                },
                              }))
                            }
                            disabled={
                              !canEditInvoice || editorBusy || persisted?.status === "cancelled"
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`xero-date-${portion.id}`}>Invoice date</Label>
                          <Input
                            id={`xero-date-${portion.id}`}
                            type="date"
                            value={draft.xero_invoice_date}
                            onChange={(event) =>
                              setXeroDrafts((current) => ({
                                ...current,
                                [portion.id]: { ...draft, xero_invoice_date: event.target.value },
                              }))
                            }
                            disabled={
                              !canEditInvoice || editorBusy || persisted?.status === "cancelled"
                            }
                          />
                        </div>
                        <div className="space-y-1.5 md:col-span-2">
                          <Label htmlFor={`xero-notes-${portion.id}`}>Accounting notes</Label>
                          <Textarea
                            id={`xero-notes-${portion.id}`}
                            value={draft.xero_notes}
                            onChange={(event) =>
                              setXeroDrafts((current) => ({
                                ...current,
                                [portion.id]: { ...draft, xero_notes: event.target.value },
                              }))
                            }
                            disabled={!canEditInvoice || editorBusy}
                            className="min-h-[80px]"
                          />
                        </div>
                      </div>
                      {needsReview && (
                        <p className="mt-3 text-xs text-warning-foreground">
                          Legacy entry needs invoice evidence review. No Xero confirmation is
                          inferred.
                        </p>
                      )}
                      {persisted?.status === "entered_in_xero" && (
                        <div className="mt-3 space-y-1.5">
                          <Label htmlFor={`xero-correction-reason-${portion.id}`}>
                            Correction or void reason
                          </Label>
                          <Textarea
                            id={`xero-correction-reason-${portion.id}`}
                            value={xeroCorrectionReasons[portion.id] ?? ""}
                            onChange={(event) =>
                              setXeroCorrectionReasons((current) => ({
                                ...current,
                                [portion.id]: event.target.value,
                              }))
                            }
                            disabled={!canEditInvoice || editorBusy}
                            className="min-h-[64px]"
                          />
                        </div>
                      )}
                      {rowError && (
                        <p role="alert" className="mt-3 text-xs text-destructive">
                          {rowError}
                        </p>
                      )}
                    </div>
                  );
                })}

              {portionDrafts.some((portion) => isNewPortionDraft(portion.id)) && (
                <p className="text-xs text-muted-foreground">
                  A newly added portion gets its Xero fields once the billing plan is saved.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <HandoffHeaderForm
            jobSheet={jobSheet}
            editable={jobSheetQuery.data.canUpdateHeader}
            onSave={async (input) => {
              await updateJobSheetHeader({ data: { id: jobSheet.id, ...input } });
              await invalidateJobSheetReads("header");
              toast.success("Handoff header saved");
            }}
          />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Handoff details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <DetailRow label="Status">
                <JobSheetStatusBadge status={jobSheet.status} />
              </DetailRow>
              <DetailRow label="Quote">
                {quote ? (
                  <Link
                    to="/quotes/$id"
                    params={{ id: quote.id }}
                    className="rounded-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {quote.number ?? "Open quote"}
                    {quote.versionNumber ? ` · version ${quote.versionNumber}` : ""}
                  </Link>
                ) : (
                  "Not available with your access"
                )}
              </DetailRow>
              <DetailRow label="Company">{companyName ?? "Not linked"}</DetailRow>
              <DetailRow label="Client">
                {client
                  ? client.company_name
                  : jobSheet.client_id
                    ? "Not available with your access"
                    : "Not linked"}
              </DetailRow>
              <DetailRow label="PO number">{jobSheet.po_number ?? "Not supplied"}</DetailRow>
              <DetailRow label="No PO reason">{jobSheet.no_po_reason ?? "Not supplied"}</DetailRow>
              <DetailRow label="Client order">
                {jobSheet.client_order_number ?? "Not supplied"}
              </DetailRow>
              <DetailRow label="Xero customer">
                {jobSheet.xero_customer_reference ?? "Not set"}
              </DetailRow>
              <DetailRow label="Sales owner">
                {jobSheet.sales_owner ? (salesOwnerName ?? "Name unavailable") : "Unassigned"}
              </DetailRow>
              <DetailRow label="Accounting owner">
                {jobSheet.accounting_owner
                  ? (accountingOwnerName ?? "Name unavailable")
                  : "Unassigned"}
              </DetailRow>
              <DetailRow label="Next action">
                {!jobSheet.accounting_owner
                  ? "Assign an active accounting owner"
                  : !jobSheet.po_number && !jobSheet.no_po_reason
                    ? "Record a PO or no-PO reason"
                    : jobSheet.status === "accounting_review"
                      ? "Reconcile portions, then accept"
                      : jobSheet.status === "accepted"
                        ? "Record manual Xero evidence"
                        : "Review status"}
              </DetailRow>
              <Separator />
              <DetailRow label="Created">{formatDateTime(jobSheet.created_at)}</DetailRow>
              <DetailRow label="Accepted">{formatDateTime(jobSheet.accepted_at)}</DetailRow>
              <DetailRow label="Locked">{formatDateTime(jobSheet.locked_at)}</DetailRow>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Accounting controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Accepted job sheet commercial fields are immutable.</p>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Job sheet totals must reconcile before accounting acceptance.</p>
              </div>
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>No invoice creation, payment sync, or ledger balance logic is handled here.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

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

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
