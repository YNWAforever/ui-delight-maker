import { useEffect, useMemo, useRef, useState, type ReactNode, type SetStateAction } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, Lock, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { BillingPortionsTable } from "@/components/job-sheets/billing-portions-table";
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
  buildXeroSavePayload,
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
  updateJobSheetPortions,
  updatePortionXeroReference,
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
  "Entered in Xero. Amount, billing type and target invoice date are settled in Xero and are not editable here.";

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
  const { jobSheet, portions, quote, client } = jobSheetQuery.data;
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

  const acceptance = useMemo(
    () =>
      canAcceptJobSheet({
        totalAmount: jobSheet.total_amount,
        portions: previewPortions,
        requirePoNumber: false,
        poNumber: jobSheet.po_number,
        clientOrderNumber: jobSheet.client_order_number,
        currency: jobSheet.currency,
      }),
    [
      jobSheet.client_order_number,
      jobSheet.currency,
      jobSheet.po_number,
      jobSheet.total_amount,
      previewPortions,
    ],
  );

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

  const saveXeroReference = async (portionId: string) => {
    const draft = xeroDrafts[portionId];
    if (!draft) return;

    setXeroErrors((current) => {
      const next = { ...current };
      delete next[portionId];
      return next;
    });

    if (hasUnsavedBillingChanges) {
      setXeroErrors((current) => ({
        ...current,
        [portionId]: "Save the billing plan before saving Xero references.",
      }));
      return;
    }

    setSavingXeroFor(portionId);
    try {
      const savedPortion = await updatePortionXeroReference({
        data: { portion_id: portionId, ...buildXeroSavePayload(draft) },
      });
      setXeroDrafts((current) => ({
        ...current,
        [portionId]: toXeroDrafts([savedPortion])[portionId],
      }));
      toast.success("Manual Xero reference saved");
      await invalidateJobSheetReads("xero");
    } catch (error) {
      const message = toSafeErrorMessage(error);
      setXeroErrors((current) => ({ ...current, [portionId]: message }));
      toast.error(message);
    } finally {
      setSavingXeroFor(null);
    }
  };

  /**
   * Clearing all four Xero fields is not a save, it is an unlock.
   *
   * `updateJobSheetXeroReference` flips the portion from `entered_in_xero` back to `planned`
   * when every field lands null, which also removes the guard that was protecting that
   * portion's amount — on an accepted, locked job sheet, with nothing on screen saying so.
   */
  const requestSaveXero = (portionId: string) => {
    const draft = xeroDrafts[portionId];
    if (!draft) return;

    const payload = buildXeroSavePayload(draft);
    const clearsEverything = Object.values(payload).every((value) => value === null);
    const persisted = portions.find((portion) => portion.id === portionId);

    if (clearsEverything && persisted?.status === "entered_in_xero") {
      setConfirm({
        title: "Remove every Xero reference from this portion?",
        description: `"${persisted.name}" returns to Planned. ClientOps stops recording that an invoice exists for it in Xero, and its amount, currency, billing type and target invoice date become editable again${
          commercialLocked ? " even though this job sheet is accepted and locked" : ""
        }.`,
        label: "Remove references",
        action: () => {
          void saveXeroReference(portionId);
        },
      });
      return;
    }

    void saveXeroReference(portionId);
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

  const showAcceptAction = canShowAcceptAndLockAction(jobSheet.status, jobSheet.locked_at);
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
              {!commercialLocked && (
                <Button variant="outline" size="sm" onClick={addPortion} disabled={editorBusy}>
                  <Plus className="mr-2 h-4 w-4" /> Add portion
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <BillingPortionsTable
                totalAmount={jobSheet.total_amount}
                currency={jobSheet.currency}
                portions={previewPortions}
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
                  const commercialFieldsDisabled = commercialLocked || editorBusy || enteredInXero;
                  const removalBlockedReason = persisted
                    ? getPortionRemovalBlockedReason(persisted)
                    : null;
                  const cancelledWithAmount =
                    portion.status === "cancelled" && (Number(portion.amount) || 0) !== 0;
                  const fieldError = portionErrors[portion.id];

                  return (
                    <div key={portion.id} className="rounded-md border border-border p-4">
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
                            disabled={commercialLocked || editorBusy}
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
                              Entered in Xero
                            </div>
                          ) : (
                            <Select
                              value={portion.status}
                              onValueChange={(value) =>
                                updateDraft(portion.id, "status", value as JobSheetPortionStatus)
                              }
                              disabled={commercialLocked || editorBusy}
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
                            disabled={commercialLocked || editorBusy}
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

                      {!commercialLocked && (
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

              {!commercialLocked && (
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
              <CardTitle className="text-base">Manual Xero references</CardTitle>
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
                ClientOps stores manual reference metadata only. Xero remains the official invoicing
                and accounting system.
              </p>
              {hasUnsavedBillingChanges && (
                <p className="text-sm text-destructive">
                  Save the billing plan before saving Xero references.
                </p>
              )}
              {previewPortions
                .filter((portion) => savedPortionIds.has(portion.id))
                .map((portion) => {
                  const draft = xeroDrafts[portion.id] ?? {
                    xero_invoice_number: "",
                    xero_invoice_reference: "",
                    xero_invoice_date: "",
                    xero_notes: "",
                  };
                  const rowError = xeroErrors[portion.id];
                  const persistedDraft = toXeroDrafts(
                    portions.filter((row) => row.id === portion.id),
                  )[portion.id];
                  const rowDirty =
                    persistedDraft !== undefined &&
                    JSON.stringify(buildXeroSavePayload(draft)) !==
                      JSON.stringify(buildXeroSavePayload(persistedDraft));

                  return (
                    <div key={portion.id} className="rounded-md border border-border p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-medium">{portion.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatCurrencyAmount(portion.amount, portion.currency)}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => requestSaveXero(portion.id)}
                          disabled={editorBusy || hasUnsavedBillingChanges || !rowDirty}
                        >
                          <Save className="mr-2 h-4 w-4" />
                          {savingXeroFor === portion.id ? "Saving…" : "Save Xero reference"}
                        </Button>
                      </div>
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
                            disabled={editorBusy}
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
                            disabled={editorBusy}
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
                            disabled={editorBusy}
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
                            disabled={editorBusy}
                            className="min-h-[80px]"
                          />
                        </div>
                      </div>
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
                  </Link>
                ) : (
                  "Not available with your access"
                )}
              </DetailRow>
              <DetailRow label="Client">
                {client
                  ? client.company_name
                  : jobSheet.client_id
                    ? "Not available with your access"
                    : "Not linked"}
              </DetailRow>
              <DetailRow label="PO number">{jobSheet.po_number ?? "Not supplied"}</DetailRow>
              <DetailRow label="Client order">
                {jobSheet.client_order_number ?? "Not supplied"}
              </DetailRow>
              <DetailRow label="Xero customer">
                {jobSheet.xero_customer_reference ?? "Not set"}
              </DetailRow>
              <DetailRow label="Accounting owner">
                {jobSheet.accounting_owner ?? "Unassigned"}
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
