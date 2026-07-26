import { useEffect, useMemo, useRef, useState, type ReactNode, type SetStateAction } from "react";
import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertCircle, ArrowLeft, CheckCircle2, Lock, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";

import { BillingPortionsTable } from "@/components/job-sheets/billing-portions-table";
import { JobSheetStatusBadge } from "@/components/job-sheets/job-sheet-status-badge";
import { CommandHeader } from "@/components/sales";
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
import { formatCurrencyAmount, formatDateTime } from "@/lib/format";
import {
  buildPortionSavePayload,
  buildPreviewPortions,
  buildXeroSavePayload,
  canShowAcceptAndLockAction,
  getAcceptanceGateAlertConfig,
  getAcceptBlockedReason,
  getJobSheetMutationQueryKeys,
  hasUnsavedBillingDraftChanges,
  hasUnsavedXeroDraftChanges,
  isAcceptAndLockDisabled,
  isJobSheetCommercialLocked,
  isJobSheetEditorBusy,
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
import type {
  JobSheet,
  JobSheetBillingType,
  JobSheetPortion,
  JobSheetPortionStatus,
  JobSheetStatus,
} from "@/lib/types";
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
  component: JobSheetDetailPage,
});

function JobSheetDetailPage() {
  const initialRead = Route.useLoaderData();
  const queryClient = useQueryClient();
  const jobSheetQuery = useQuery({
    queryKey: crmQueryKeys.jobSheets.detail(initialRead.jobSheet.id),
    queryFn: () => getJobSheetRead({ data: { id: initialRead.jobSheet.id } }),
    initialData: initialRead,
    staleTime: 30_000,
  });
  const { jobSheet, portions } = jobSheetQuery.data;
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

  const invalidateJobSheetReads = async (mutation: JobSheetMutation) => {
    await Promise.all(
      getJobSheetMutationQueryKeys(jobSheet, mutation).map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
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
      }),
    [jobSheet.client_order_number, jobSheet.po_number, jobSheet.total_amount, previewPortions],
  );

  const updateDraft = <K extends keyof PortionDraft>(
    id: string,
    key: K,
    value: PortionDraft[K],
  ) => {
    setPortionDrafts((current) =>
      current.map((portion) => (portion.id === id ? { ...portion, [key]: value } : portion)),
    );
  };

  const savePortions = async () => {
    if (commercialLocked) {
      toast.error("Accepted job sheet commercial fields are immutable");
      return;
    }

    if (hasUnsavedXeroChanges) {
      toast.error("Save Xero references before saving the billing plan.");
      return;
    }

    const hasMissingName = portionDrafts.some((portion) => !portion.name.trim());
    if (hasMissingName) {
      toast.error("Each billing portion needs a name.");
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
      toast.error(error instanceof Error ? error.message : "Failed to save billing plan");
    } finally {
      setSavingPortions(false);
    }
  };

  const accept = async () => {
    const acceptBlockedReason = getAcceptBlockedReason({
      commercialLocked,
      hasUnsavedBillingChanges,
      hasUnsavedXeroChanges,
    });
    if (acceptBlockedReason) {
      toast.error(acceptBlockedReason);
      return;
    }

    if (!acceptance.ok) {
      toast.error(acceptance.reasons.join(" "));
      return;
    }

    setAccepting(true);
    try {
      await acceptJobSheetForAccounting({ data: { id: jobSheet.id } });
      toast.success("Job sheet accepted and locked");
      await invalidateJobSheetReads("accept");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to accept job sheet");
    } finally {
      setAccepting(false);
    }
  };

  const saveXeroReference = async (portionId: string) => {
    const draft = xeroDrafts[portionId];
    if (!draft) return;

    if (hasUnsavedBillingChanges) {
      toast.error("Save the billing plan before saving Xero references.");
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
      toast.error(error instanceof Error ? error.message : "Failed to save Xero reference");
    } finally {
      setSavingXeroFor(null);
    }
  };

  const acceptanceGateAlert = getAcceptanceGateAlertConfig({
    commercialLocked,
    hasUnsavedBillingChanges,
    hasUnsavedXeroChanges,
    acceptanceOk: acceptance.ok,
    acceptanceReasons: acceptance.reasons,
  });

  return (
    <>
      <CommandHeader
        title={jobSheet.number}
        status="Accounting handoff"
        description={`Accepted quote total ${formatCurrencyAmount(jobSheet.total_amount, jobSheet.currency)}.`}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/job-sheets">
                <ArrowLeft className="mr-2 h-4 w-4" /> All job sheets
              </Link>
            </Button>
            {!commercialLocked && (
              <Button variant="outline" size="sm" onClick={savePortions} disabled={editorBusy}>
                <Save className="mr-2 h-4 w-4" /> Save billing plan
              </Button>
            )}
            {canShowAcceptAndLockAction(jobSheet.status, jobSheet.locked_at) && (
              <Button
                size="sm"
                onClick={accept}
                disabled={isAcceptAndLockDisabled({
                  editorBusy,
                  hasUnsavedBillingChanges,
                  hasUnsavedXeroChanges,
                  acceptanceOk: acceptance.ok,
                })}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" /> Accept & lock
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle className="text-base">Billing portions</CardTitle>
              {hasUnsavedBillingChanges && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPortionDrafts(resetBillingDrafts(portions))}
                  disabled={commercialLocked || editorBusy}
                >
                  <RotateCcw className="h-4 w-4" /> Discard billing changes
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

              <div className="space-y-3">
                {portionDrafts.map((portion, index) => (
                  <div key={portion.id} className="rounded-md border border-border p-4">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="space-y-1.5 xl:col-span-2">
                        <Label htmlFor={`portion-name-${portion.id}`}>Portion {index + 1}</Label>
                        <Input
                          id={`portion-name-${portion.id}`}
                          value={portion.name}
                          onChange={(event) => updateDraft(portion.id, "name", event.target.value)}
                          disabled={commercialLocked || editorBusy}
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
                          disabled={commercialLocked || editorBusy}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Billing type</Label>
                        <Select
                          value={portion.billing_type}
                          onValueChange={(value) =>
                            updateDraft(portion.id, "billing_type", value as JobSheetBillingType)
                          }
                          disabled={commercialLocked || editorBusy}
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
                        {portion.status === "entered_in_xero" ? (
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
                          disabled={commercialLocked || editorBusy}
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
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle className="text-base">Manual Xero references</CardTitle>
              {hasUnsavedXeroChanges && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setXeroDrafts(resetXeroDrafts(portions))}
                  disabled={editorBusy}
                >
                  <RotateCcw className="h-4 w-4" /> Discard Xero changes
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
              {previewPortions.map((portion) => {
                const draft = xeroDrafts[portion.id] ?? {
                  xero_invoice_number: "",
                  xero_invoice_reference: "",
                  xero_invoice_date: "",
                  xero_notes: "",
                };

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
                        onClick={() => saveXeroReference(portion.id)}
                        disabled={editorBusy}
                      >
                        <Save className="mr-2 h-4 w-4" /> Save Xero reference
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
                  </div>
                );
              })}
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
              <DetailRow label="Quote">{jobSheet.quote_id}</DetailRow>
              <DetailRow label="PO number">{jobSheet.po_number ?? "Missing"}</DetailRow>
              <DetailRow label="Client order">
                {jobSheet.client_order_number ?? "Missing"}
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
