import { useEffect, useRef, useState } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import type { SerializableHumanApproval } from "@/lib/serializable";
import { approvalProposedAction, approvalRejectionEffect } from "@/lib/approval-types";
import { AdminError, type AdminErrorCode } from "@/lib/admin/errors";
import { toSafeErrorMessage } from "@/lib/errors";
import { crmQueryKeys } from "@/lib/query-keys";
import { getOperationalMutationKeys } from "@/lib/operational-invalidation";
import { decideApproval, getApprovalDetailFn } from "@/server-functions/approvals";
import { approveQuote, rejectQuote } from "@/server-functions/quotes";

export type ApprovalReviewRecord = Omit<SerializableHumanApproval, "context_data"> & {
  context_data?: SerializableHumanApproval["context_data"];
  quote_id?: string | null;
  subject_restricted?: boolean;
};
export type ReviewSurface =
  | { kind: "approvals"; pendingQueryKey: QueryKey; historyQueryKey: QueryKey }
  | { kind: "ai-review" };
export type ReviewIntent = {
  record: ApprovalReviewRecord;
  decision: "approved" | "rejected" | "escalated";
  notes?: string;
  availability: { blockedReason: string | null };
};
export type ReviewOutcome =
  | { kind: "recorded"; approvalId: string; refreshFailed: boolean }
  | { kind: "not-recorded" | "unconfirmed"; approvalId: string; message: string }
  | { kind: "busy"; approvalId: string };
export type ReviewPreparation =
  | { kind: "blocked"; reason: string }
  | {
      kind: "ready";
      title: string;
      description: string;
      label: string;
      confirm: () => Promise<ReviewOutcome>;
    };
type Page = { items: ApprovalReviewRecord[] };
type Attempt = { fingerprint: string; key: string; unresolved: boolean; result?: ReviewOutcome };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const codes: readonly AdminErrorCode[] = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "OUTSIDE_SCOPE",
  "CONFLICT",
  "VALIDATION_FAILED",
  "LAST_SUPER_ADMIN",
  "OPEN_WORK_REMAINS",
  "STALE_ADMIN_STATE",
];
function businessFailure(error: unknown): boolean {
  return (
    error instanceof AdminError ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      error.name === "AdminError" &&
      "code" in error &&
      codes.includes(error.code as AdminErrorCode) &&
      "message" in error &&
      typeof error.message === "string")
  );
}
function validVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function quoteReference(record: ApprovalReviewRecord): string | null {
  const context = record.context_data;
  const value =
    record.quote_id ??
    (context && typeof context === "object" && !Array.isArray(context) ? context.quote_id : null);
  return typeof value === "string" && UUID.test(value) ? value : null;
}
/** Preserve only already-visible content; replies can contribute decision metadata, never raw content/owners. */
function projection(
  record: ApprovalReviewRecord,
  reply: Partial<ApprovalReviewRecord>,
  notes?: string,
  source: "decision" | "read" = "decision",
): ApprovalReviewRecord {
  const restricted = record.subject_restricted === true || reply.subject_restricted === true;
  return {
    id: record.id,
    agent_run_id: record.agent_run_id,
    approval_type: record.approval_type,
    requested_by: record.requested_by,
    assigned_to: record.assigned_to,
    superseded_by: record.superseded_by,
    status: reply.status ?? record.status,
    row_version: validVersion(reply.row_version) ? reply.row_version : record.row_version,
    context_data: restricted ? null : record.context_data,
    context_summary: restricted ? null : record.context_summary,
    reviewer_notes: restricted
      ? null
      : source === "read" &&
          (reply.reviewer_notes === null || typeof reply.reviewer_notes === "string")
        ? reply.reviewer_notes
        : (notes ?? null),
    decided_at:
      reply.decided_at === null || typeof reply.decided_at === "string"
        ? reply.decided_at
        : record.decided_at,
    created_at: record.created_at,
    quote_id: record.quote_id,
    subject_restricted: restricted,
  };
}

export function useApprovalReview(surface: ReviewSurface) {
  const client = useQueryClient();
  const mounted = useRef(true),
    latch = useRef<string | null>(null),
    attempts = useRef(new Map<string, Attempt>());
  const confirmedRef = useRef(new Map<string, ApprovalReviewRecord>());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<ReadonlyMap<string, ApprovalReviewRecord>>(
    () => new Map(),
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const prepare = (intent: ReviewIntent): ReviewPreparation => {
    if (intent.availability.blockedReason)
      return { kind: "blocked", reason: intent.availability.blockedReason };
    if (!validVersion(intent.record.row_version))
      return {
        kind: "blocked",
        reason: "Refresh this approval to read its current version before deciding.",
      };
    const known = confirmedRef.current.get(intent.record.id);
    if (
      intent.record.status === "approved" ||
      intent.record.status === "rejected" ||
      (known &&
        (known.status === "approved" ||
          known.status === "rejected" ||
          known.row_version > intent.record.row_version))
    )
      return {
        kind: "blocked",
        reason:
          "Refresh to see the recorded decision. This request cannot be decided from this stale view.",
      };
    const record = JSON.parse(JSON.stringify(intent.record)) as ApprovalReviewRecord;
    const decision = intent.decision,
      notes = intent.notes?.trim() || undefined;
    const targetSurface =
      surface.kind === "approvals"
        ? {
            ...surface,
            pendingQueryKey: [...surface.pendingQueryKey],
            historyQueryKey: [...surface.historyQueryKey],
          }
        : surface;
    const quoteId = record.approval_type === "quote_send" ? quoteReference(record) : null;
    if (record.approval_type === "quote_send" && !quoteId)
      return {
        kind: "blocked",
        reason: "This quote-send approval is missing a valid quote reference. Refresh the request.",
      };
    const fingerprint = JSON.stringify({
      id: record.id,
      decision,
      notes,
      expectedVersion: record.row_version,
      quoteId,
    });
    const previous = attempts.current.get(record.id);
    if (previous?.unresolved && previous.fingerprint !== fingerprint)
      return {
        kind: "blocked",
        reason: "Check the original decision result before changing the decision or notes.",
      };
    const quote = record.approval_type === "quote_send";
    const title =
      decision === "escalated"
        ? "Request changes on this request?"
        : decision === "approved"
          ? quote
            ? "Approve this quote?"
            : "Approve this request?"
          : quote
            ? "Reject this quote send?"
            : "Reject this request?";
    const description =
      decision === "escalated"
        ? "The request is marked Needs attention with your reviewer notes, and the agent run stays parked until a new approval is raised from the record itself."
        : decision === "approved"
          ? approvalProposedAction(record.approval_type)
          : approvalRejectionEffect(record.approval_type);
    const label =
      decision === "escalated" ? "Request changes" : decision === "approved" ? "Approve" : "Reject";
    const confirm = async (): Promise<ReviewOutcome> => {
      if (latch.current !== null || !mounted.current)
        return { kind: "busy", approvalId: record.id };
      const existing = attempts.current.get(record.id);
      if (existing?.fingerprint === fingerprint && existing.result?.kind === "recorded")
        return existing.result;
      if (existing?.unresolved && existing.fingerprint !== fingerprint)
        return {
          kind: "unconfirmed",
          approvalId: record.id,
          message: toSafeErrorMessage(
            new Error("Check the original decision result before changing the decision or notes."),
          ),
        };
      latch.current = record.id;
      setBusyId(record.id);
      const attempt =
        existing?.fingerprint === fingerprint
          ? existing
          : { fingerprint, key: crypto.randomUUID(), unresolved: false };
      attempts.current.set(record.id, attempt);
      let snapshot: ApprovalReviewRecord | undefined, patched: ApprovalReviewRecord | undefined;
      const rollback = () => {
        if (targetSurface.kind !== "approvals" || !snapshot || !patched) return;
        client.setQueryData<Page>(targetSurface.pendingQueryKey, (current) =>
          current
            ? {
                ...current,
                items: current.items.map((row) =>
                  row.id === record.id && row === patched ? snapshot! : row,
                ),
              }
            : current,
        );
      };
      const updatePending = (value: ApprovalReviewRecord) => {
        if (targetSurface.kind !== "approvals") return;
        client.setQueryData<Page>(targetSurface.pendingQueryKey, (current) =>
          current
            ? {
                ...current,
                items: current.items.map((row) =>
                  row.id === record.id && row.row_version <= value.row_version
                    ? {
                        ...row,
                        status: value.status,
                        row_version: value.row_version,
                        reviewer_notes: value.reviewer_notes,
                        decided_at: value.decided_at,
                      }
                    : row,
                ),
              }
            : current,
        );
      };
      const publish = (value: ApprovalReviewRecord) => {
        confirmedRef.current.set(record.id, value);
        if (mounted.current) setConfirmed(new Map(confirmedRef.current));
        updatePending(value);
      };
      const invalidate = async () => {
        const keys: QueryKey[] = [
          ...getOperationalMutationKeys({ type: "approval-decision", id: record.id }),
          crmQueryKeys.agents.all(),
        ];
        if (quoteId) keys.push(crmQueryKeys.quotes.detail(quoteId), crmQueryKeys.quotes.lists());
        if (targetSurface.kind === "approvals")
          keys.push(targetSurface.pendingQueryKey, targetSurface.historyQueryKey);
        // A parent invalidation already covers descendants. Avoid canceling/refetching the same queue twice.
        const unique = keys
          .filter(
            (key, index) =>
              keys.findIndex((other) => JSON.stringify(other) === JSON.stringify(key)) === index,
          )
          .filter(
            (key, _index, all) =>
              !all.some(
                (other) =>
                  other.length < key.length &&
                  other.every((part, i) => JSON.stringify(part) === JSON.stringify(key[i])),
              ),
          );
        const results = await Promise.allSettled(
          unique.map((queryKey) => client.invalidateQueries({ queryKey })),
        );
        return results.some((result) => result.status === "rejected");
      };
      let writeSucceeded = false;
      try {
        if (targetSurface.kind === "approvals") {
          await client.cancelQueries({ queryKey: targetSurface.pendingQueryKey, exact: true });
          snapshot = client
            .getQueryData<Page>(targetSurface.pendingQueryKey)
            ?.items.find((row) => row.id === record.id);
          client.setQueryData<Page>(targetSurface.pendingQueryKey, (current) =>
            current
              ? {
                  ...current,
                  items: current.items.map((row) =>
                    row.id === record.id && row.row_version === record.row_version
                      ? {
                          ...row,
                          status: decision,
                          reviewer_notes: notes ?? null,
                          decided_at: null,
                        }
                      : row,
                  ),
                }
              : current,
          );
          const current = client
            .getQueryData<Page>(targetSurface.pendingQueryKey)
            ?.items.find((row) => row.id === record.id);
          if (current !== snapshot) patched = current;
        }
        const metadata = {
          expectedVersion: record.row_version,
          idempotencyKey: attempt.key,
          notes,
        };
        let value: ApprovalReviewRecord;
        if (quote && quoteId && decision !== "escalated") {
          await (decision === "approved" ? approveQuote : rejectQuote)({
            data: { id: quoteId, approvalId: record.id, ...metadata },
          });
          writeSucceeded = true;
          value = projection(record, { status: decision }, notes);
          publish(value);
          try {
            const read = await getApprovalDetailFn({ data: { id: record.id } });
            if (
              read.id !== record.id ||
              !validVersion(read.row_version) ||
              read.row_version < record.row_version ||
              read.status === "pending"
            )
              throw new Error("Approval refresh is incomplete.");
            value = projection(record, read, notes, "read");
            publish(value);
          } catch {
            const result: ReviewOutcome = {
              kind: "recorded",
              approvalId: record.id,
              refreshFailed: true,
            };
            attempt.result = result;
            await invalidate();
            return result;
          }
        } else {
          const reply = await decideApproval({ data: { id: record.id, decision, ...metadata } });
          writeSucceeded = true;
          value = projection(record, reply, notes);
          publish(value);
        }
        attempt.unresolved = false;
        const result: ReviewOutcome = {
          kind: "recorded",
          approvalId: record.id,
          refreshFailed: await invalidate(),
        };
        attempt.result = result;
        return result;
      } catch (error) {
        if (writeSucceeded) {
          const result: ReviewOutcome = {
            kind: "recorded",
            approvalId: record.id,
            refreshFailed: true,
          };
          attempt.result = result;
          return result;
        }
        rollback();
        const business = businessFailure(error);
        attempt.unresolved = !business;
        try {
          const read = await getApprovalDetailFn({ data: { id: record.id } });
          if (read.id === record.id && validVersion(read.row_version)) {
            updatePending(projection(record, read, notes, "read"));
            if (read.row_version !== record.row_version || read.status !== record.status)
              attempt.unresolved = false;
          }
        } catch {
          /* Unavailable authorized read cannot settle an unknown commit. */
        }
        await invalidate();
        return {
          kind: business ? "not-recorded" : "unconfirmed",
          approvalId: record.id,
          message: business
            ? toSafeErrorMessage(error)
            : toSafeErrorMessage(
                new Error(
                  "The result is unconfirmed. Refresh to check the recorded status before retrying.",
                ),
              ),
        };
      } finally {
        latch.current = null;
        if (mounted.current) setBusyId(null);
      }
    };
    return { kind: "ready", title, description, label, confirm };
  };
  return {
    busy: busyId !== null,
    decidingIds: new Set(busyId ? [busyId] : []),
    confirmed,
    prepare,
  };
}
