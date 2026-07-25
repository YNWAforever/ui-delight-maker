import type { QueryKey } from "@tanstack/react-query";

import { formatCurrencyAmount } from "@/lib/format";
import { crmQueryKeys } from "@/lib/query-keys";
import type { NewJobSheetPortion } from "@/lib/quote-to-cash";
import type {
  JobSheet,
  JobSheetBillingType,
  JobSheetPortion,
  JobSheetPortionStatus,
  JobSheetStatus,
} from "@/lib/types";

export type PortionDraft = {
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

export type XeroDraft = {
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

export const resetBillingDrafts = (portions: JobSheetPortion[]): PortionDraft[] =>
  toPortionDrafts(portions);

export const resetXeroDrafts = (portions: JobSheetPortion[]): Record<string, XeroDraft> =>
  toXeroDrafts(portions);

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
): JobSheetPortionStatus =>
  original?.status === "entered_in_xero" ? original.status : draft.status;

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

export type JobSheetPortionSavePayload = NewJobSheetPortion & { id: string };

export function buildPortionSavePayload(
  drafts: PortionDraft[],
  originals: JobSheetPortion[],
): JobSheetPortionSavePayload[] {
  const originalsById = new Map(originals.map((portion) => [portion.id, portion]));

  return drafts.map((draft, index) => ({
    id: draft.id,
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

export const buildXeroSavePayload = (draft: XeroDraft): NormalizedXeroSavePayload => ({
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

    return (
      JSON.stringify(buildXeroSavePayload(draft)) !==
      JSON.stringify(getPersistedXeroPayload(portion))
    );
  });
}

export function rebaseBillingDrafts(
  drafts: PortionDraft[] | undefined,
  previousBaseline: JobSheetPortion[],
  nextBaseline: JobSheetPortion[],
): PortionDraft[] {
  if (drafts && hasUnsavedBillingDraftChanges(drafts, previousBaseline)) return drafts;
  return toPortionDrafts(nextBaseline);
}

export function rebaseXeroDrafts(
  drafts: Record<string, XeroDraft> | undefined,
  previousBaseline: JobSheetPortion[],
  nextBaseline: JobSheetPortion[],
): Record<string, XeroDraft> {
  if (drafts && hasUnsavedXeroDraftChanges(drafts, previousBaseline)) return drafts;
  return toXeroDrafts(nextBaseline);
}

export type JobSheetMutation = "billing" | "xero" | "accept";

export function getJobSheetMutationQueryKeys(
  jobSheet: Pick<JobSheet, "id" | "client_id" | "account_id">,
  mutation: JobSheetMutation,
): QueryKey[] {
  const queryKeys: QueryKey[] = [crmQueryKeys.jobSheets.detail(jobSheet.id)];

  if (mutation === "accept") queryKeys.push(crmQueryKeys.jobSheets.lists());
  if (jobSheet.client_id) {
    queryKeys.push(crmQueryKeys.clients.section(jobSheet.client_id, "job_sheets"));
    if (mutation === "accept") {
      queryKeys.push(crmQueryKeys.clients.section(jobSheet.client_id, "commercial"));
    }
  }
  if (mutation === "accept" && jobSheet.account_id) {
    queryKeys.push(
      crmQueryKeys.companyWorkspace.section(jobSheet.account_id, "delivery_finance"),
      crmQueryKeys.companyWorkspace.section(jobSheet.account_id, "commercial"),
    );
  }

  return queryKeys;
}
export function canShowAcceptAndLockAction(
  status: JobSheetStatus,
  lockedAt: string | null | undefined,
): boolean {
  return !isJobSheetCommercialLocked(status, lockedAt) && status !== "accepted";
}

export function isJobSheetEditorBusy(input: {
  accepting: boolean;
  savingPortions: boolean;
  savingXeroFor: string | null;
}): boolean {
  return input.accepting || input.savingPortions || input.savingXeroFor !== null;
}

export function isAcceptAndLockDisabled(input: {
  editorBusy: boolean;
  hasUnsavedBillingChanges: boolean;
  hasUnsavedXeroChanges: boolean;
  acceptanceOk: boolean;
}): boolean {
  return (
    input.editorBusy ||
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

export type AcceptedValueSummaryRow = Pick<JobSheet, "status" | "currency" | "total_amount">;

export function formatAcceptedValueSummary(rows: AcceptedValueSummaryRow[]): string {
  const totals = new Map<string, number>();

  for (const row of rows) {
    if (row.status !== "accepted") continue;
    const currency = row.currency || "HKD";
    totals.set(currency, (totals.get(currency) ?? 0) + row.total_amount);
  }

  if (totals.size === 0) {
    return "None";
  }

  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, amount]) => formatCurrencyAmount(amount, currency))
    .join(" / ");
}
