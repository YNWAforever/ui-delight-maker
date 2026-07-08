import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrencyAmount, formatDateTime } from "@/lib/format";
import { canAcceptJobSheet, type NewJobSheetPortion } from "@/lib/quote-to-cash";
import type {
  JobSheetBillingType,
  JobSheetPortion,
  JobSheetPortionStatus,
  JobSheetStatus,
} from "@/lib/types";
import {
  acceptJobSheetForAccounting,
  getJobSheet,
  updateJobSheetPortions,
  updatePortionXeroReference,
} from "@/server-functions/job-sheets";

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

type PortionDraft = {
  id: string;
  name: string;
  description: string;
  amount: string;
  currency: string;
  target_invoice_date: string;
  billing_type: JobSheetBillingType;
  status: JobSheetPortionStatus;
  sort_order: number;
  source_quote_line_item_ids: string[];
};

type XeroDraft = {
  xero_invoice_number: string;
  xero_invoice_reference: string;
  xero_invoice_date: string;
  xero_notes: string;
};

type NormalizedXeroSavePayload = {
  xero_invoice_number: string | null;
  xero_invoice_reference: string | null;
  xero_invoice_date: string | null;
  xero_notes: string | null;
};

export const toPortionDrafts = (portions: JobSheetPortion[]): PortionDraft[] =>
  portions.map((portion) => ({
    id: portion.id,
    name: portion.name,
    description: portion.description ?? "",
    amount: String(portion.amount ?? 0),
    currency: portion.currency,
    target_invoice_date: portion.target_invoice_date ?? "",
    billing_type: portion.billing_type,
    status: portion.status,
    sort_order: portion.sort_order,
    source_quote_line_item_ids: portion.source_quote_line_item_ids,
  }));

export const toXeroDrafts = (portions: JobSheetPortion[]): Record<string, XeroDraft> =>
  Object.fromEntries(
    portions.map((portion) => [
      portion.id,
      {
        xero_invoice_number: portion.xero_invoice_number ?? "",
        xero_invoice_reference: portion.xero_invoice_reference ?? "",
        xero_invoice_date: portion.xero_invoice_date ?? "",
        xero_notes: portion.xero_notes ?? "",
      },
    ]),
  );

export const resetBillingDrafts = (portions: JobSheetPortion[]): PortionDraft[] => toPortionDrafts(portions);

export const resetXeroDrafts = (portions: JobSheetPortion[]): Record<string, XeroDraft> => toXeroDrafts(portions);

export const isJobSheetCommercialLocked = (
  status: JobSheetStatus,
  lockedAt: string | null | undefined,
) => status === "accepted" || Boolean(lockedAt);

const toNullableDateString = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const resolvePortionStatus = (
  draft: Pick<PortionDraft, "status">,
  original?: Pick<JobSheetPortion, "status">,
): JobSheetPortionStatus => (original?.status === "entered_in_xero" ? original.status : draft.status);

export function buildPreviewPortions(input: {
  jobSheetId: string;
  createdAt: string;
  updatedAt: string;
  originals: JobSheetPortion[];
  drafts: PortionDraft[];
}): JobSheetPortion[] {
  const originalsById = new Map(input.originals.map((portion) => [portion.id, portion]));

  return input.drafts.map((draft) => {
    const original = originalsById.get(draft.id);
    return {
      ...(original ?? {
        id: draft.id,
        job_sheet_id: input.jobSheetId,
        target_invoice_date: null,
        xero_invoice_number: null,
        xero_invoice_reference: null,
        xero_invoice_date: null,
        xero_notes: null,
        internal_note: null,
        created_at: input.createdAt,
        updated_at: input.updatedAt,
      }),
      name: draft.name,
      description: draft.description,
      amount: Number(draft.amount) || 0,
      currency: draft.currency,
      target_invoice_date: toNullableDateString(draft.target_invoice_date),
      billing_type: draft.billing_type,
      status: resolvePortionStatus(draft, original),
      sort_order: draft.sort_order,
      source_quote_line_item_ids: draft.source_quote_line_item_ids,
    };
  });
}

export function buildPortionSavePayload(
  drafts: PortionDraft[],
  originals: JobSheetPortion[],
): NewJobSheetPortion[] {
  const originalsById = new Map(originals.map((portion) => [portion.id, portion]));

  return drafts.map((draft, index) => ({
    name: draft.name.trim(),
    source_quote_line_item_ids: draft.source_quote_line_item_ids,
    description: draft.description.trim(),
    amount: Number(draft.amount) || 0,
    currency: draft.currency,
    target_invoice_date: toNullableDateString(draft.target_invoice_date),
    billing_type: draft.billing_type,
    status: resolvePortionStatus(draft, originalsById.get(draft.id)),
    sort_order: index,
  }));
}

export function hasUnsavedBillingDraftChanges(
  drafts: PortionDraft[],
  originals: JobSheetPortion[],
): boolean {
  const savedPayload = buildPortionSavePayload(drafts, originals);
  const currentPayload = buildPortionSavePayload(toPortionDrafts(originals), originals);
  return JSON.stringify(savedPayload) !== JSON.stringify(currentPayload);
}

const buildXeroSavePayload = (draft: XeroDraft): NormalizedXeroSavePayload => ({
  xero_invoice_number: draft.xero_invoice_number.trim() || null,
  xero_invoice_reference: draft.xero_invoice_reference.trim() || null,
  xero_invoice_date: draft.xero_invoice_date.trim() || null,
  xero_notes: draft.xero_notes.trim() || null,
});

const getPersistedXeroPayload = (portion: JobSheetPortion): NormalizedXeroSavePayload => ({
  xero_invoice_number: portion.xero_invoice_number ?? null,
  xero_invoice_reference: portion.xero_invoice_reference ?? null,
  xero_invoice_date: portion.xero_invoice_date ?? null,
  xero_notes: portion.xero_notes ?? null,
});

export function hasUnsavedXeroDraftChanges(
  drafts: Record<string, XeroDraft>,
  originals: JobSheetPortion[],
): boolean {
  return originals.some((portion) => {
    const draft = drafts[portion.id];
    if (!draft) return false;

    return JSON.stringify(buildXeroSavePayload(draft)) !== JSON.stringify(getPersistedXeroPayload(portion));
  });
}

export function canShowAcceptAndLockAction(
  status: JobSheetStatus,
  lockedAt: string | null | undefined,
): boolean {
  return !isJobSheetCommercialLocked(status, lockedAt) && status !== "accepted";
}

export function isAcceptAndLockDisabled(input: {
  accepting: boolean;
  savingPortions: boolean;
  hasUnsavedBillingChanges: boolean;
  hasUnsavedXeroChanges: boolean;
  acceptanceOk: boolean;
}): boolean {
  return (
    input.accepting ||
    input.savingPortions ||
    input.hasUnsavedBillingChanges ||
    input.hasUnsavedXeroChanges ||
    !input.acceptanceOk
  );
}

export function getAcceptBlockedReason(input: {
  commercialLocked: boolean;
  hasUnsavedBillingChanges: boolean;
  hasUnsavedXeroChanges: boolean;
}): string | null {
  if (input.commercialLocked) {
    return "Commercial fields are locked for this job sheet.";
  }

  if (input.hasUnsavedBillingChanges && input.hasUnsavedXeroChanges) {
    return "Save or discard one set of edits before continuing.";
  }

  if (input.hasUnsavedBillingChanges) {
    return "Save the billing plan before accepting.";
  }

  if (input.hasUnsavedXeroChanges) {
    return "Save Xero references before accepting.";
  }

  return null;
}

export function getAcceptanceGateAlertConfig(input: {
  commercialLocked: boolean;
  hasUnsavedBillingChanges: boolean;
  hasUnsavedXeroChanges: boolean;
  acceptanceOk: boolean;
  acceptanceReasons: string[];
}): {
  variant: "default" | "destructive";
  title: string;
  description: string;
} {
  if (input.commercialLocked) {
    return {
      variant: "default",
      title: "Commercial fields locked",
      description: "Accepted job sheet commercial fields are immutable.",
    };
  }

  if (input.hasUnsavedBillingChanges && input.hasUnsavedXeroChanges) {
    return {
      variant: "default",
      title: "Acceptance gate",
      description: "Save or discard one set of edits before continuing.",
    };
  }

  if (input.hasUnsavedXeroChanges) {
    return {
      variant: "destructive",
      title: "Acceptance gate",
      description: "Save Xero references before accepting.",
    };
  }

  if (input.hasUnsavedBillingChanges) {
    return {
      variant: "destructive",
      title: "Acceptance gate",
      description: "Save the billing plan before accepting.",
    };
  }

  if (input.acceptanceOk) {
    return {
      variant: "default",
      title: "Acceptance gate",
      description: "Billing plan reconciles and can be accepted by accounting.",
    };
  }

  return {
    variant: "destructive",
    title: "Acceptance gate",
    description: input.acceptanceReasons.join(" "),
  };
}

export const Route = createFileRoute("/job-sheets/$id")({
  loader: ({ params }) => getJobSheet({ data: { id: params.id } }),
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.jobSheet.number ?? "Job Sheet"} - Fimmick ClientOps` },
      {
        name: "description",
        content: "Accounting handoff detail with billing reconciliation and manual Xero references.",
      },
    ],
  }),
  component: JobSheetDetailPage,
});

function JobSheetDetailPage() {
  const router = useRouter();
  const { jobSheet, portions } = Route.useLoaderData();
  const [portionDrafts, setPortionDrafts] = useState(() => toPortionDrafts(portions));
  const [xeroDrafts, setXeroDrafts] = useState(() => toXeroDrafts(portions));
  const [savingPortions, setSavingPortions] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [savingXeroFor, setSavingXeroFor] = useState<string | null>(null);

  useEffect(() => {
    setPortionDrafts(resetBillingDrafts(portions));
    setXeroDrafts(resetXeroDrafts(portions));
  }, [portions]);

  const commercialLocked = isJobSheetCommercialLocked(jobSheet.status, jobSheet.locked_at);
  const hasUnsavedBillingChanges = useMemo(
    () => hasUnsavedBillingDraftChanges(portionDrafts, portions),
    [portionDrafts, portions],
  );
  const hasUnsavedXeroChanges = useMemo(
    () => hasUnsavedXeroDraftChanges(xeroDrafts, portions),
    [portions, xeroDrafts],
  );

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

  const updateDraft = <K extends keyof PortionDraft>(id: string, key: K, value: PortionDraft[K]) => {
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
      await updateJobSheetPortions({ data: { id: jobSheet.id, portions: payload } });
      toast.success("Billing plan saved");
      await router.invalidate();
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
      await router.invalidate();
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
      await updatePortionXeroReference({
        data: { portion_id: portionId, ...buildXeroSavePayload(draft) },
      });
      toast.success("Manual Xero reference saved");
      await router.invalidate();
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
              <Button variant="outline" size="sm" onClick={savePortions} disabled={savingPortions}>
                <Save className="mr-2 h-4 w-4" /> Save billing plan
              </Button>
            )}
            {canShowAcceptAndLockAction(jobSheet.status, jobSheet.locked_at) && (
              <Button
                size="sm"
                onClick={accept}
                disabled={
                  isAcceptAndLockDisabled({
                    accepting,
                    savingPortions,
                    hasUnsavedBillingChanges,
                    hasUnsavedXeroChanges,
                    acceptanceOk: acceptance.ok,
                  })
                }
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
                  disabled={commercialLocked || savingPortions}
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
                          disabled={commercialLocked}
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
                          onChange={(event) => updateDraft(portion.id, "amount", event.target.value)}
                          disabled={commercialLocked}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Billing type</Label>
                        <Select
                          value={portion.billing_type}
                          onValueChange={(value) =>
                            updateDraft(portion.id, "billing_type", value as JobSheetBillingType)
                          }
                          disabled={commercialLocked}
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
                            disabled={commercialLocked}
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
                        <Label htmlFor={`portion-target-date-${portion.id}`}>Target invoice date</Label>
                        <Input
                          id={`portion-target-date-${portion.id}`}
                          type="date"
                          value={portion.target_invoice_date}
                          onChange={(event) =>
                            updateDraft(portion.id, "target_invoice_date", event.target.value)
                          }
                          disabled={commercialLocked}
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
                          disabled={commercialLocked}
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
                  disabled={savingXeroFor !== null}
                >
                  <RotateCcw className="h-4 w-4" /> Discard Xero changes
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                ClientOps stores manual reference metadata only. Xero remains the official invoicing and accounting system.
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
                        disabled={savingXeroFor === portion.id}
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
                              [portion.id]: { ...draft, xero_invoice_reference: event.target.value },
                            }))
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
              <DetailRow label="Client order">{jobSheet.client_order_number ?? "Missing"}</DetailRow>
              <DetailRow label="Xero customer">{jobSheet.xero_customer_reference ?? "Not set"}</DetailRow>
              <DetailRow label="Accounting owner">{jobSheet.accounting_owner ?? "Unassigned"}</DetailRow>
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
