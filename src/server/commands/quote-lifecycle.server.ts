import type { HumanApproval, Quote, QuoteVersion } from "@/lib/types";
import { readQuotePdfSnapshot } from "@/lib/quote-pdf-source";
import { toJsonValue } from "@/lib/serializable";
import { createQuoteVersion } from "@/server/repositories/quote-versions";
import { claimCommandReceipt, completeCommandReceipt } from "./receipts.server";
import { OperationError } from "@/lib/operations/errors";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import { transaction, type Queryable } from "@/server/db/neon.server";
import {
  createApproval,
  decideApprovalInTransaction,
  findPendingApprovalForQuote,
} from "@/server/repositories/approvals";
import { createJobSheetFromAcceptedQuote } from "@/server/repositories/job-sheets";
import type { JobSheet } from "@/lib/types";
import { updateQuoteLifecycle } from "@/server/repositories/quotes";
import { lockQuoteAndAuthorize } from "./quote-revision.server";

export type RequestQuoteApprovalInput = {
  id: string;
  assignedTo?: string | null;
};

/** Quote row, open approval, notifications and lifecycle state commit together. */
export async function requestQuoteApprovalInTransaction(
  db: Queryable,
  context: RequestAuthorization,
  input: RequestQuoteApprovalInput,
): Promise<HumanApproval> {
  const quote = await lockQuoteAndAuthorize(db, context, input.id, ["quotes.request_approval"]);
  const existing = await findPendingApprovalForQuote(input.id, db);
  if (existing) {
    if (quote.status !== "pending_approval") {
      throw new OperationError("INVALID_STATE", "Open approval and quote state disagree");
    }
    return existing;
  }
  if (quote.status !== "draft" && quote.status !== "revised") {
    throw new OperationError("INVALID_STATE", "Quote is not ready for approval request");
  }

  if (input.assignedTo) {
    const assignee = (
      await db.query<{ id: string }>("select id from profiles where id=$1 and status='active'", [
        input.assignedTo,
      ])
    ).rows[0];
    if (!assignee) throw new OperationError("INVALID_INPUT", "Approval assignee is unavailable");
  }
  const approval = await createApproval(
    {
      approval_type: "quote_send",
      requested_by: context.actor.profileId,
      assigned_to: input.assignedTo ?? null,
      context_summary: `Quote ${quote.number ?? quote.id} for approval`,
      context_data: {
        quote_id: quote.id,
        quote_number: quote.number,
        total_value: quote.total_value,
        currency: quote.currency,
      },
    },
    db,
  );
  await updateQuoteLifecycle(quote.id, { status: "pending_approval" }, db);
  return approval;
}

export async function requestQuoteApprovalCommand(
  context: RequestAuthorization,
  input: RequestQuoteApprovalInput,
): Promise<HumanApproval> {
  return transaction((db) => requestQuoteApprovalInTransaction(db, context, input));
}

function quoteIdFromApproval(approval: HumanApproval): string {
  const context = approval.context_data;
  const id =
    context && typeof context === "object" && !Array.isArray(context)
      ? (context as Record<string, unknown>).quote_id
      : null;
  if (approval.approval_type !== "quote_send" || typeof id !== "string") {
    throw new OperationError("INVALID_STATE", "Approval does not identify a quote");
  }
  return id;
}

/** Called after the approval transition, in the same transaction, by every decision entry point. */
export async function syncQuoteApprovalDecisionInTransaction(
  db: Queryable,
  context: RequestAuthorization,
  approval: HumanApproval,
): Promise<Quote | null> {
  if (approval.approval_type !== "quote_send" || approval.status === "escalated") return null;
  const quoteId = quoteIdFromApproval(approval);
  const quote = await lockQuoteAndAuthorize(db, context, quoteId, ["quotes.approve"]);
  if (quote.status !== "pending_approval") {
    throw new OperationError("INVALID_STATE", "Quote is no longer pending this approval");
  }
  const submitted = approval.context_data as Record<string, unknown>;
  if (
    submitted.quote_number !== quote.number ||
    Number(submitted.total_value) !== Number(quote.total_value) ||
    submitted.currency !== quote.currency
  ) {
    throw new OperationError("INVALID_STATE", "Quote differs from submitted approval");
  }
  if (approval.status === "approved") {
    return updateQuoteLifecycle(
      quote.id,
      { status: "approved", approved_by: context.actor.profileId },
      db,
    );
  }
  if (approval.status === "rejected") {
    return updateQuoteLifecycle(quote.id, { status: "rejected" }, db);
  }
  throw new OperationError("INVALID_STATE", "Unsupported quote approval decision");
}

export type IssueQuoteInput = {
  id: string;
  pdfTemplateId?: string | null;
  idempotencyKey?: string;
};
export type IssueQuoteResult = { quote: Quote; version: QuoteVersion };

async function currentIssuedVersion(db: Queryable, quote: Quote): Promise<QuoteVersion> {
  if (!quote.issued_version_id) {
    throw new OperationError("INVALID_STATE", "Issued quote version needs reconciliation");
  }
  const version = (
    await db.query<QuoteVersion>(
      "select * from quote_versions where id=$1 and quote_id=$2 and reason='issued'",
      [quote.issued_version_id, quote.id],
    )
  ).rows[0];
  if (
    !version ||
    !version.snapshot ||
    typeof version.snapshot !== "object" ||
    Array.isArray(version.snapshot) ||
    version.snapshot.id !== quote.id ||
    !readQuotePdfSnapshot(version.snapshot)
  ) {
    throw new OperationError("INVALID_STATE", "Issued quote snapshot needs reconciliation");
  }
  return version;
}

/** Caller owns the transaction; quote lock serializes issue/retry with acceptance. */
export async function issueQuoteInTransaction(
  db: Queryable,
  context: RequestAuthorization,
  input: IssueQuoteInput,
): Promise<IssueQuoteResult> {
  const quote = await lockQuoteAndAuthorize(db, context, input.id, ["quotes.issue"]);
  const claim = input.idempotencyKey
    ? await claimCommandReceipt<IssueQuoteResult>(db, {
        scope: "quote.issue",
        actorId: context.actor.profileId,
        idempotencyKey: input.idempotencyKey,
        payload: { id: input.id, pdfTemplateId: input.pdfTemplateId ?? null },
      })
    : null;
  if (claim?.kind === "replay") return claim.result;

  let result: IssueQuoteResult;
  if (quote.status === "sent" || quote.status === "viewed" || quote.status === "accepted") {
    result = { quote, version: await currentIssuedVersion(db, quote) };
  } else {
    if (quote.status !== "approved" || quote.issued_version_id) {
      throw new OperationError("INVALID_STATE", "Only an approved, unissued quote can be issued");
    }
    const approvals = (
      await db.query<{ id: string }>(
        `select id from human_approvals
         where approval_type='quote_send' and status='approved'
           and context_data->>'quote_id'=$1 limit 2`,
        [quote.id],
      )
    ).rows;
    if (approvals.length !== 1) {
      throw new OperationError("INVALID_STATE", "Approved quote history needs reconciliation");
    }
    const priorIssued = (
      await db.query<{ id: string }>(
        "select id from quote_versions where quote_id=$1 and reason='issued' limit 1",
        [quote.id],
      )
    ).rows[0];
    if (priorIssued) {
      throw new OperationError("INVALID_STATE", "Orphaned issued version needs reconciliation");
    }
    const total = Number(quote.total_value);
    if (quote.total_value === null || !Number.isFinite(total) || total < 0) {
      throw new OperationError("INVALID_STATE", "Quote total is unavailable");
    }
    const snapshot = toJsonValue({ ...quote, total_value: total, line_items: quote.line_items });
    if (!readQuotePdfSnapshot(snapshot)) {
      throw new OperationError("INVALID_STATE", "Quote commercial snapshot is malformed");
    }
    const version = await createQuoteVersion(
      {
        quote_id: quote.id,
        reason: "issued",
        snapshot,
        pdf_template_id: input.pdfTemplateId ?? null,
        pdf_url: `/quotes/${quote.id}/pdf`,
        created_by: context.actor.profileId,
      },
      db,
    );
    const updated = await updateQuoteLifecycle(
      quote.id,
      {
        status: "sent",
        issued_version_id: version.id,
        pdf_url: version.pdf_url,
      },
      db,
    );
    result = { quote: updated, version };
  }
  if (claim?.kind === "new") await completeCommandReceipt(db, claim.id, result);
  return result;
}

export async function issueQuoteCommand(
  context: RequestAuthorization,
  input: IssueQuoteInput,
): Promise<IssueQuoteResult> {
  return transaction((db) => issueQuoteInTransaction(db, context, input));
}

export type QuoteApprovalDecisionInput = {
  id: string;
  approvalId?: string;
  decision: "approved" | "rejected";
  notes?: string;
  expectedVersion?: number;
  idempotencyKey?: string;
};

export async function decideQuoteSendInTransaction(
  db: Queryable,
  context: RequestAuthorization,
  input: QuoteApprovalDecisionInput,
): Promise<{ quote: Quote; approval: HumanApproval }> {
  const open = input.approvalId
    ? (
        await db.query<HumanApproval>("select * from human_approvals where id=$1", [
          input.approvalId,
        ])
      ).rows[0]
    : await findPendingApprovalForQuote(input.id, db);
  if (!open || open.approval_type !== "quote_send" || quoteIdFromApproval(open) !== input.id) {
    throw new OperationError("CONFLICT", "Open quote approval is unavailable");
  }
  const decided = await decideApprovalInTransaction(db, context, {
    id: open.id,
    decision: input.decision,
    notes: input.notes,
    expectedVersion: input.expectedVersion,
  });
  const quote = await syncQuoteApprovalDecisionInTransaction(db, context, decided);
  if (!quote) throw new OperationError("INVALID_STATE", "Quote decision was not applied");
  return { quote, approval: decided };
}

export async function decideQuoteSendCommand(
  context: RequestAuthorization,
  input: QuoteApprovalDecisionInput,
): Promise<{ quote: Quote; approval: HumanApproval }> {
  return transaction(async (db) => {
    const claim = input.idempotencyKey
      ? await claimCommandReceipt<{ quote: Quote; approval: HumanApproval }>(db, {
          scope: "quote.decision",
          actorId: context.actor.profileId,
          idempotencyKey: input.idempotencyKey,
          payload: {
            id: input.id,
            approvalId: input.approvalId ?? null,
            decision: input.decision,
            notes: input.notes ?? null,
            expectedVersion: input.expectedVersion ?? null,
          },
        })
      : null;
    if (claim?.kind === "replay") return claim.result;
    const result = await decideQuoteSendInTransaction(db, context, input);
    if (claim?.kind === "new") await completeCommandReceipt(db, claim.id, result);
    return result;
  });
}

export async function approveAndIssueQuoteCommand(
  context: RequestAuthorization,
  input: QuoteApprovalDecisionInput & IssueQuoteInput,
): Promise<IssueQuoteResult> {
  return transaction(async (db) => {
    const claim = input.idempotencyKey
      ? await claimCommandReceipt<IssueQuoteResult>(db, {
          scope: "quote.approve_issue",
          actorId: context.actor.profileId,
          idempotencyKey: input.idempotencyKey,
          payload: {
            id: input.id,
            approvalId: input.approvalId ?? null,
            notes: input.notes ?? null,
            pdfTemplateId: input.pdfTemplateId ?? null,
          },
        })
      : null;
    if (claim?.kind === "replay") return claim.result;
    await decideQuoteSendInTransaction(db, context, { ...input, decision: "approved" });
    // Issue authorization is checked after the approval write. A denial rolls
    // the approval and quote update back in this same transaction.
    const result = await issueQuoteInTransaction(db, context, {
      id: input.id,
      pdfTemplateId: input.pdfTemplateId,
    });
    if (claim?.kind === "new") await completeCommandReceipt(db, claim.id, result);
    return result;
  });
}

export type AcceptanceEvidence = { reference: string; note?: string };
export type AcceptQuoteInput = {
  id: string;
  issuedVersionId?: string;
  acceptanceEvidence: AcceptanceEvidence;
  idempotencyKey?: string;
};
export type AcceptQuoteResult = { quote: Quote; jobSheet: JobSheet };

function snapshotId(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** The accepted version and Job Sheet use only the immutable issued snapshot. */
export async function acceptQuoteInTransaction(
  db: Queryable,
  context: RequestAuthorization,
  input: AcceptQuoteInput,
): Promise<AcceptQuoteResult> {
  const quote = await lockQuoteAndAuthorize(db, context, input.id, ["job_sheets.accept"]);
  const reference = input.acceptanceEvidence.reference.trim();
  if (!reference) throw new OperationError("INVALID_INPUT", "Acceptance reference is required");
  const claim = input.idempotencyKey
    ? await claimCommandReceipt<AcceptQuoteResult>(db, {
        scope: "quote.accept",
        actorId: context.actor.profileId,
        idempotencyKey: input.idempotencyKey,
        payload: {
          id: input.id,
          issuedVersionId: input.issuedVersionId ?? null,
          acceptanceEvidence: { reference, note: input.acceptanceEvidence.note ?? null },
        },
      })
    : null;
  if (claim?.kind === "replay") return claim.result;
  const issuedId = input.issuedVersionId ?? quote.issued_version_id;
  if (!issuedId || issuedId !== quote.issued_version_id) {
    throw new OperationError("CONFLICT", "Current issued version must be accepted");
  }
  const issued = await currentIssuedVersion(db, quote);
  let result: AcceptQuoteResult;
  if (quote.status === "accepted") {
    const accepted = (
      await db.query<QuoteVersion>(
        "select * from quote_versions where id=$1 and quote_id=$2 and reason='accepted'",
        [quote.accepted_version_id, quote.id],
      )
    ).rows[0];
    const raw = accepted?.snapshot;
    const recorded =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>).acceptance_evidence
        : null;
    if (
      !recorded ||
      typeof recorded !== "object" ||
      Array.isArray(recorded) ||
      (recorded as Record<string, unknown>).reference !== reference ||
      (raw as Record<string, unknown>).issued_version_id !== issued.id
    ) {
      throw new OperationError("CONFLICT", "Quote was accepted with different evidence");
    }
    const jobSheet = (
      await db.query<JobSheet>("select * from job_sheets where quote_id=$1", [quote.id])
    ).rows[0];
    if (!jobSheet || jobSheet.accepted_quote_version_id !== accepted.id) {
      throw new OperationError("INVALID_STATE", "Accepted Job Sheet needs reconciliation");
    }
    result = { quote, jobSheet };
  } else {
    if (quote.status !== "sent" && quote.status !== "viewed") {
      throw new OperationError("INVALID_STATE", "Only an issued quote can be accepted");
    }
    const priorAccepted = (
      await db.query<{ id: string }>(
        "select id from quote_versions where quote_id=$1 and reason='accepted' limit 1",
        [quote.id],
      )
    ).rows[0];
    const priorSheet = (
      await db.query<{ id: string }>("select id from job_sheets where quote_id=$1 limit 1", [
        quote.id,
      ])
    ).rows[0];
    if (priorAccepted || priorSheet) {
      throw new OperationError("INVALID_STATE", "Orphaned acceptance needs reconciliation");
    }
    const raw = issued.snapshot;
    const parsed = readQuotePdfSnapshot(raw);
    if (
      !parsed ||
      typeof parsed.quote.total_value !== "number" ||
      !raw ||
      typeof raw !== "object" ||
      Array.isArray(raw) ||
      raw.id !== quote.id
    ) {
      throw new OperationError("INVALID_STATE", "Issued snapshot needs reconciliation");
    }
    const identity = raw as Record<string, unknown>;
    for (const field of ["account_id", "client_id", "contact_id"] as const) {
      if (!(field in identity)) {
        throw new OperationError("INVALID_STATE", "Issued identity needs reconciliation");
      }
    }
    const acceptedAt = new Date().toISOString();
    const accepted = await createQuoteVersion(
      {
        quote_id: quote.id,
        reason: "accepted",
        snapshot: toJsonValue({
          ...identity,
          status: "accepted",
          total_value: parsed.quote.total_value,
          issued_version_id: issued.id,
          accepted_at: acceptedAt,
          accepted_by: context.actor.profileId,
          acceptance_evidence: {
            reference,
            note: input.acceptanceEvidence.note ?? null,
          },
        }),
        pdf_template_id: issued.pdf_template_id,
        pdf_url: issued.pdf_url,
        created_by: context.actor.profileId,
      },
      db,
    );
    const updated = await updateQuoteLifecycle(
      quote.id,
      {
        status: "accepted",
        accepted_version_id: accepted.id,
        accepted_at: acceptedAt,
        accepted_by: context.actor.profileId,
      },
      db,
    );
    const jobSheet = await createJobSheetFromAcceptedQuote(
      {
        quote_id: quote.id,
        accepted_quote_version_id: accepted.id,
        account_id: snapshotId(identity.account_id),
        client_id: snapshotId(identity.client_id),
        contact_id: snapshotId(identity.contact_id),
        sales_owner: snapshotId(identity.created_by),
        total_amount: parsed.quote.total_value,
        currency: parsed.quote.currency,
        created_by: context.actor.profileId,
      },
      db,
    );
    result = { quote: updated, jobSheet };
  }
  if (claim?.kind === "new") await completeCommandReceipt(db, claim.id, result);
  return result;
}

export async function acceptQuoteCommand(
  context: RequestAuthorization,
  input: AcceptQuoteInput,
): Promise<AcceptQuoteResult> {
  return transaction((db) => acceptQuoteInTransaction(db, context, input));
}
