import { useState } from "react";

import { EmptyWorkspaceState, SectionHeader, StatusBadge } from "@/components/sales";
import { Button } from "@/components/ui/button";
import { toSafeErrorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
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
};

function requestTarget(request: AccessRequest) {
  return request.requestType === "capability"
    ? (request.capability ?? "Capability request")
    : (request.teamId ?? "Team request");
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

export function AccessRequestQueue({
  requests,
  actorRole,
  actorProfileId,
  filtered = false,
  onDecide,
}: AccessRequestQueueProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [expiries, setExpiries] = useState<Record<string, string>>({});
  const [temporary, setTemporary] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
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

  function beginDecision(request: AccessRequest, decision: Decision) {
    setExpandedId(request.id);
    setDecisions((current) => ({ ...current, [request.id]: decision }));
    if (decision === "rejected" && !reasons[request.id]?.trim()) {
      setError("Decision reason is required");
    } else {
      setError(null);
    }
  }

  async function submit(request: AccessRequest) {
    if (submittingId) return;
    const reason = reasons[request.id]?.trim() ?? "";
    if (reason.length < 8) {
      setError("Decision reason is required");
      return;
    }
    const accessExpiresAt = temporary[request.id]
      ? expiries[request.id]
        ? new Date(expiries[request.id]).toISOString()
        : null
      : null;
    if (temporary[request.id] && !accessExpiresAt) {
      setError("Expiry is required for temporary access");
      return;
    }

    setSubmittingId(request.id);
    setError(null);
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
                  <h3 className="mt-1 break-words text-sm font-medium text-foreground">
                    {requestTarget(request)}
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
                    onClick={() => beginDecision(request, "approved")}
                  >
                    {isCapabilityRequest ? "Approve capability access" : "Approve team access"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => beginDecision(request, "rejected")}
                  >
                    Reject {request.id}
                  </Button>
                </div>
              )}

              {expandedId === request.id && !blocked ? (
                <div className="mt-4 grid gap-3 border-t border-border pt-4">
                  <p className="text-sm text-muted-foreground">
                    {decision === "approved"
                      ? isCapabilityRequest
                        ? "Approving writes an explicit allow override for this capability, which the policy engine consults before the role baseline. It is recorded in the audit log."
                        : "Approving adds this person to the team, which widens what they can see and own. It is recorded in the audit log."
                      : "Rejecting closes the request. The requester can raise a new one."}
                  </p>
                  <label className="block">
                    <span className="text-sm font-medium text-foreground">
                      Decision reason for {request.id}
                    </span>
                    <textarea
                      aria-label={"Decision reason for " + request.id}
                      value={reasons[request.id] ?? ""}
                      onChange={(event) => {
                        setReasons((current) => ({ ...current, [request.id]: event.target.value }));
                        setError(null);
                      }}
                      rows={3}
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </label>
                  {decision === "approved" ? (
                    <>
                      <label className="flex items-center gap-2 text-sm text-foreground">
                        <input
                          type="checkbox"
                          aria-label={"Temporary access for " + request.id}
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
                        <label className="block">
                          <span className="text-sm font-medium text-foreground">
                            Access expiry for {request.id}
                          </span>
                          <input
                            type="datetime-local"
                            aria-label={"Access expiry for " + request.id}
                            value={expiries[request.id] ?? ""}
                            onChange={(event) =>
                              setExpiries((current) => ({
                                ...current,
                                [request.id]: event.target.value,
                              }))
                            }
                            className="mt-1 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          />
                        </label>
                      ) : null}
                    </>
                  ) : null}
                  {error ? (
                    <p role="alert" className="text-sm text-destructive">
                      {error}
                    </p>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    className="w-fit"
                    disabled={busy}
                    onClick={() => void submit(request)}
                  >
                    {busy
                      ? "Recording…"
                      : `${decision === "approved" ? "Approve" : "Reject"} ${request.id}`}
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
