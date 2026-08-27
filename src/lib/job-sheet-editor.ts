import type { QueryKey } from "@tanstack/react-query";

import { formatCurrencyAmount } from "@/lib/format";
import { toAmount } from "@/lib/money";
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

export type JobSheetPortionSavePayload = NewJobSheetPortion;

/**
 * Marks a draft row that has never been saved.
 *
 * `replaceJobSheetPortions` distinguishes an insert from an update by the presence of `id`:
 * a payload carrying an id it does not recognise is rejected with "Billing portion ID does
 * not belong to this job sheet". So a row added in the editor gets a client-only id for
 * React keys and draft bookkeeping, and that id is stripped out of the save payload.
 */
export const NEW_PORTION_DRAFT_PREFIX = "new-portion:";

let newPortionDraftCounter = 0;

export function isNewPortionDraft(id: string): boolean {
  return id.startsWith(NEW_PORTION_DRAFT_PREFIX);
}

export function createPortionDraft(input: { currency: string; sortOrder: number }): PortionDraft {
  newPortionDraftCounter += 1;
  return {
    id: `${NEW_PORTION_DRAFT_PREFIX}${newPortionDraftCounter}`,
    name: "",
    description: "",
    amount: "0",
    currency: input.currency,
    target_invoice_date: "",
    billing_type: "progress",
    status: "planned",
    sort_order: input.sortOrder,
    source_quote_line_item_ids: [],
  };
}

/**
 * Why a portion cannot be removed, or null when it can be.
 *
 * `replaceJobSheetPortions` refuses to drop a portion that carries any Xero data, and the
 * error it throws for that is a 500 the reviewer only sees after clicking Save. Checking it
 * here means the control is disabled with its reason instead.
 */
export function getPortionRemovalBlockedReason(
  portion: Pick<
    JobSheetPortion,
    "status" | "xero_invoice_number" | "xero_invoice_reference" | "xero_invoice_date" | "xero_notes"
  >,
): string | null {
  const hasXeroData =
    portion.status === "entered_in_xero" ||
    Boolean(
      portion.xero_invoice_number ||
      portion.xero_invoice_reference ||
      portion.xero_invoice_date ||
      portion.xero_notes,
    );

  return hasXeroData
    ? "This portion has Xero details saved against it and cannot be removed."
    : null;
}

export function buildPortionSavePayload(
  drafts: PortionDraft[],
  originals: JobSheetPortion[],
): JobSheetPortionSavePayload[] {
  const originalsById = new Map(originals.map((portion) => [portion.id, portion]));

  return drafts.map((draft, index) => ({
    ...(isNewPortionDraft(draft.id) ? {} : { id: draft.id }),
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
    totals.set(currency, (totals.get(currency) ?? 0) + toAmount(row.total_amount));
  }

  if (totals.size === 0) {
    return "None";
  }

  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, amount]) => formatCurrencyAmount(amount, currency))
    .join(" / ");
}

/**
 * Job-sheet status labels.
 *
 * They live here rather than inside `JobSheetStatusBadge` because the queue's status filter
 * needs the same words as the badge, and a second copy in the route file is how a filter
 * option and the badge beside it end up disagreeing. `src/lib/status-labels.ts` owns the
 * seven decided domains and job sheets is not one of them; adding an eighth there would
 * change `KNOWN_STATUS_VALUES`, which a test enumerates.
 */
export const JOB_SHEET_STATUS_LABELS: Record<JobSheetStatus, string> = {
  draft: "Draft",
  accounting_review: "Accounting review",
  accepted: "Accepted",
  change_required: "Change required",
  cancelled: "Cancelled",
};

export const JOB_SHEET_STATUS_VALUES = Object.keys(JOB_SHEET_STATUS_LABELS) as JobSheetStatus[];

export function getJobSheetStatusLabel(status: string | null | undefined): string {
  if (!status) return "Unknown";
  const labels: Record<string, string | undefined> = JOB_SHEET_STATUS_LABELS;
  return labels[status] ?? status.replace(/_/g, " ");
}

/**
 * How far through invoicing a job sheet is, as a sentence.
 *
 * Deliberately a sentence and not a bar. "2 of 3 portions invoiced" says which two and how
 * many are left; a 66%-filled bar says neither, and on a two-portion sheet a half-filled bar
 * is indistinguishable from a rounding artefact. `entered_in_xero` is the only status that
 * means an invoice exists — `cancelled` portions are counted out of the denominator, since a
 * cancelled portion is never going to be invoiced.
 */
export function describeBillingProgress(portions: Array<Pick<JobSheetPortion, "status">>): string {
  const billable = portions.filter((portion) => portion.status !== "cancelled");
  if (billable.length === 0) return "No billable portions planned yet";

  const invoiced = billable.filter((portion) => portion.status === "entered_in_xero").length;
  const cancelled = portions.length - billable.length;
  const cancelledSuffix = cancelled > 0 ? `, ${cancelled} cancelled` : "";

  return `${invoiced} of ${billable.length} portion${billable.length === 1 ? "" : "s"} invoiced in Xero${cancelledSuffix}`;
}

/** Portion status labels. Same reasoning as `JOB_SHEET_STATUS_LABELS` above. */
export const JOB_SHEET_PORTION_STATUS_LABELS: Record<JobSheetPortionStatus, string> = {
  planned: "Planned",
  entered_in_xero: "Entered in Xero",
  cancelled: "Cancelled",
};

export function getJobSheetPortionStatusLabel(status: string | null | undefined): string {
  if (!status) return "Unknown";
  const labels: Record<string, string | undefined> = JOB_SHEET_PORTION_STATUS_LABELS;
  return labels[status] ?? status.replace(/_/g, " ");
}
