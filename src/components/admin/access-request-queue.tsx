import { useState } from "react";

import { EmptyWorkspaceState, SectionHeader, StatusBadge } from "@/components/sales";
import { Button } from "@/components/ui/button";
import { toSafeErrorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { humanizeKey } from "@/lib/status-labels";
import type { UserRole } from "@/lib/admin/types";
import type { AccessRequest } from "@/server/repositories/admin-access";

type Decision = "approved" | "rejected";

export type AccessRequestDecision = {
  id: string;
  decision: Decision;
  reason: string;
  accessExpiresAt: string | null;
};

type AccessRequestQueueProps = {
  requests: readonly AccessRequest[];
  actorRole: UserRole;
  /** The signed-in profile, so the segregation-of-duties rule can be shown, not just enforced. */
  actorProfileId?: string | null;
  /** True when the current list is filtered to something other than the pending queue. */
  filtered?: boolean;
  onDecide: (input: AccessRequestDecision) => Promise<unknown> | unknown;
  /** Team names by id, so a team request reads "Coverage team" rather than its id. */
  teamName?: (teamId: string) => string | undefined;
};

/** What the request is for, in words: a capability name or a team name, never a raw key or id. */
function requestTarget(request: AccessRequest, teamName?: (teamId: string) => string | undefined) {
  if (request.requestType === "capability") {
    return request.capability ? humanizeKey(request.capability) : "Capability request";
  }
  const name = request.teamId ? teamName?.(request.teamId) : undefined;
  return name ? `Join ${name}` : "Team membership request";
}

/**
 * Why a decision control is unavailable, in the words of the rule that makes it so.
 *
 * Each branch mirrors a check in `decideAdminAccessRequestFn` and none of them replaces it —
 * the server decides again, and this only stops the reader filling in a mandatory reason for
 * a decision that was never going to be accepted.
 *
 * Note the manager branch covers **both** decisions, not just approval. The server refuses a
 * manager any decision on a capability request ("Managers can only decide team access
 * requests"), so leaving Reject enabled — as the screen did — offered a second control that
 * could only ever produce an error.
 */
function undecidableReason(
  request: AccessRequest,
  actorRole: UserRole,
  actorProfileId: string | null | undefined,
): string | null {
  if (request.status !== "pending") {
    return "This request has already been decided.";
  }
  if (actorProfileId && request.requesterProfileId === actorProfileId) {
    return "You raised this request, so someone else has to decide it.";
  }
  if (actorRole === "manager" && request.requestType === "capability") {
    return "Managers decide team access requests. A capability request needs an Admin or Super Admin.";
  }
  return null;
}

/** The decision reason's minimum, which the server's schema also enforces. */
const REASON_MIN_LENGTH = 8;

const fieldId = (requestId: string, field: string) => `access-request-${requestId}-${field}`;

export function AccessRequestQueue({
  requests,
  actorRole,
  actorProfileId,
  filtered = false,
  onDecide,
  teamName,
}: AccessRequestQueueProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [expiries, setExpiries] = useState<Record<string, string>>({});
  const [temporary, setTemporary] = useState<Record<string, boolean>>({});
  // A failed write, shown above the confirm button. Field problems are kept apart and shown at
  // the field they concern, linked by aria-describedby (UX-16).
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ reason?: string; expiry?: string }>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  if (requests.length === 0) {
    return (
      <section aria-label="Access requests" className="px-4 py-6 md:px-6">
        <EmptyWorkspaceState
          title={filtered ? "No requests in this state" : "No access requests waiting"}
          description={
            filtered
              ? "Change the state filter above to see requests that have already been decided."
              : "Requests raised from a person's own account settings appear here for a decision."
          }
        />
      </section>
    );
  }

  // Opening a decision shows no error: "required" before anything was typed read as a mistake
  // already made (UX-16). The rule is stated as a hint beside the field instead.
  function beginDecision(request: AccessRequest, decision: Decision) {
    setExpandedId(request.id);
    setDecisions((current) => ({ ...current, [request.id]: decision }));
    setError(null);
    setFieldErrors({});
  }

  async function submit(request: AccessRequest) {
    if (submittingId) return;
    const reason = reasons[request.id]?.trim() ?? "";
    if (reason.length < REASON_MIN_LENGTH) {
      setFieldErrors({
        reason:
          reason.length === 0
            ? "Enter a reason for this decision."
            : `Use at least ${REASON_MIN_LENGTH} characters for the reason.`,
      });
      document.getElementById(fieldId(request.id, "reason"))?.focus();
      return;
    }
    const accessExpiresAt = temporary[request.id]
      ? expiries[request.id]
        ? new Date(expiries[request.id]).toISOString()
        : null
      : null;
    if (temporary[request.id] && !accessExpiresAt) {
      setFieldErrors({ expiry: "Choose when the temporary access ends." });
      document.getElementById(fieldId(request.id, "expiry"))?.focus();
      return;
    }

    setSubmittingId(request.id);
    setError(null);
    setFieldErrors({});
    try {
      await onDecide({
        id: request.id,
        decision: decisions[request.id] ?? "rejected",
        reason,
        accessExpiresAt,
      });
      setExpandedId(null);
    } catch (submissionError) {
      // `decideAdminAccessRequestFn` reaches `requireCapability`, which runs raw SQL.
      setError(toSafeErrorMessage(submissionError));
    } finally {
      setSubmittingId(null);
    }
  }

  return (
    <section aria-label="Access requests" className="space-y-4 px-4 py-6 md:px-6">
      <SectionHeader
        title="Access request queue"
        description="Review the requested scope, reason and duration before deciding. An approval writes an explicit allow override."
      />
      <div className="space-y-3">
        {requests.map((request) => {
          const isCapabilityRequest = request.requestType === "capability";
          const blocked = undecidableReason(request, actorRole, actorProfileId);
          const decision = decisions[request.id];
          const busy = submittingId === request.id;
          return (
            <article key={request.id} className="rounded-md border border-border px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {isCapabilityRequest ? "Capability request" : "Team membership request"}
                  </p>
                  <h3
                    id={`access-request-${request.id}-target`}
                    className="mt-1 break-words text-sm font-medium text-foreground"
                  >
                    {requestTarget(request, teamName)}
                  </h3>
                  <dl className="mt-2 grid gap-x-5 gap-y-1 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-muted-foreground">Requester</dt>
                      <dd className="break-all text-foreground">{request.requesterProfileId}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Raised</dt>
                      <dd className="text-foreground">{formatDateTime(request.createdAt)}</dd>
                    </div>
                  </dl>
                  <p className="mt-3 text-sm text-muted-foreground">{request.reason}</p>
                  {request.status !== "pending" && request.decidedAt ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Decided {formatDateTime(request.decidedAt)}
                      {request.decisionReason ? ` · ${request.decisionReason}` : ""}
                    </p>
                  ) : null}
                </div>
                {/*
                  The record's real status. This was a hardcoded amber "Pending" pill on
                  every row, so an approved or cancelled request — which the state filter can
                  now actually show — still read as waiting on a decision.
                */}
                <StatusBadge domain="accessRequests" value={request.status} />
              </div>

              {blocked ? (
                <p className="mt-4 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  {blocked}
                </p>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy}
                    aria-describedby={`access-request-${request.id}-target`}
                    onClick={() => beginDecision(request, "approved")}
                  >
                    {isCapabilityRequest ? "Approve capability access" : "Approve team access"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    aria-describedby={`access-request-${request.id}-target`}
                    onClick={() => beginDecision(request, "rejected")}
                  >
                    Reject request
                  </Button>
                </div>
              )}

              {expandedId === request.id && !blocked ? (
                <div className="mt-4 grid gap-3 border-t border-border pt-4">
                  <p className="text-sm text-muted-foreground">
                    {decision === "approved"
                      ? isCapabilityRequest
                        ? "Approving gives the requester this capability, whatever their role allows. It is recorded in the audit log."
                        : "Approving adds this person to the team, which widens what they can see and own. It is recorded in the audit log."
                      : "Rejecting closes the request. The requester can raise a new one."}
                  </p>
                  <div>
                    <label
                      htmlFor={fieldId(request.id, "reason")}
                      className="text-sm font-medium text-foreground"
                    >
                      Decision reason
                    </label>
                    <textarea
                      id={fieldId(request.id, "reason")}
                      value={reasons[request.id] ?? ""}
                      onChange={(event) => {
                        setReasons((current) => ({ ...current, [request.id]: event.target.value }));
                        setError(null);
                        setFieldErrors((current) => ({ ...current, reason: undefined }));
                      }}
                      rows={3}
                      aria-invalid={fieldErrors.reason ? true : undefined}
                      aria-describedby={[
                        fieldId(request.id, "reason-hint"),
                        fieldErrors.reason ? fieldId(request.id, "reason-error") : null,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive"
                    />
                    <p
                      id={fieldId(request.id, "reason-hint")}
                      className="mt-1 text-xs text-muted-foreground"
                    >
                      At least {REASON_MIN_LENGTH} characters. Recorded in the audit log.
                    </p>
                    {fieldErrors.reason ? (
                      <p
                        id={fieldId(request.id, "reason-error")}
                        className="mt-1 text-xs font-medium text-tone-danger-fg"
                      >
                        {fieldErrors.reason}
                      </p>
                    ) : null}
                  </div>
                  {decision === "approved" ? (
                    <>
                      <label className="flex items-center gap-2 text-sm text-foreground">
                        <input
                          type="checkbox"
                          checked={temporary[request.id] ?? false}
                          onChange={(event) =>
                            setTemporary((current) => ({
                              ...current,
                              [request.id]: event.target.checked,
                            }))
                          }
                        />
                        Temporary access
                      </label>
                      {temporary[request.id] ? (
                        <div>
                          <label
                            htmlFor={fieldId(request.id, "expiry")}
                            className="text-sm font-medium text-foreground"
                          >
                            Access expiry
                          </label>
                          <input
                            id={fieldId(request.id, "expiry")}
                            type="datetime-local"
                            value={expiries[request.id] ?? ""}
                            onChange={(event) => {
                              setExpiries((current) => ({
                                ...current,
                                [request.id]: event.target.value,
                              }));
                              setFieldErrors((current) => ({ ...current, expiry: undefined }));
                            }}
                            aria-invalid={fieldErrors.expiry ? true : undefined}
                            aria-describedby={
                              fieldErrors.expiry ? fieldId(request.id, "expiry-error") : undefined
                            }
                            className="mt-1 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive"
                          />
                          {fieldErrors.expiry ? (
                            <p
                              id={fieldId(request.id, "expiry-error")}
                              className="mt-1 text-xs font-medium text-tone-danger-fg"
                            >
                              {fieldErrors.expiry}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  {error ? (
                    <p role="alert" className="text-sm text-tone-danger-fg">
                      {error}
                    </p>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    className="w-fit"
                    disabled={busy}
                    aria-describedby={`access-request-${request.id}-target`}
                    onClick={() => void submit(request)}
                  >
                    {busy
                      ? "Recording…"
                      : decision === "approved"
                        ? "Confirm approval"
                        : "Confirm rejection"}
                  </Button>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
