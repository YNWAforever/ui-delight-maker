import { useState } from "react";
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
  onDecide: (input: AccessRequestDecision) => Promise<unknown> | unknown;
};

function requestTarget(request: AccessRequest) {
  return request.requestType === "capability"
    ? (request.capability ?? "Capability request")
    : (request.teamId ?? "Team request");
}

export function AccessRequestQueue({ requests, actorRole, onDecide }: AccessRequestQueueProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [expiries, setExpiries] = useState<Record<string, string>>({});
  const [temporary, setTemporary] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  if (requests.length === 0) {
    return (
      <section aria-label="Access requests" className="px-4 py-8 text-sm text-muted-foreground">
        No access requests are waiting for review.
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
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Could not decide this access request.",
      );
    } finally {
      setSubmittingId(null);
    }
  }

  return (
    <section aria-label="Access requests" className="space-y-3 px-4 py-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">Access request queue</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Review the requested scope, reason, and duration before deciding.
        </p>
      </div>
      <div className="space-y-3">
        {requests.map((request) => {
          const isCapabilityRequest = request.requestType === "capability";
          const managerCannotApprove = actorRole === "manager" && isCapabilityRequest;
          const decision = decisions[request.id];
          return (
            <article key={request.id} className="rounded-md border border-border px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    {isCapabilityRequest ? "Capability request" : "Team membership request"}
                  </p>
                  <h3 className="mt-1 break-words text-sm font-semibold text-foreground">
                    {request.id}
                  </h3>
                  <dl className="mt-2 grid gap-x-5 gap-y-1 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-muted-foreground">Requester</dt>
                      <dd className="break-all text-foreground">{request.requesterProfileId}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Requested access</dt>
                      <dd className="break-all text-foreground">{requestTarget(request)}</dd>
                    </div>
                  </dl>
                  <p className="mt-3 text-sm text-muted-foreground">{request.reason}</p>
                </div>
                <span className="rounded-md border border-amber-500/40 px-2 py-1 text-xs font-medium text-amber-700">
                  Pending
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {managerCannotApprove ? (
                  <button
                    type="button"
                    disabled
                    className="min-h-9 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    Capability approval unavailable
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => beginDecision(request, "approved")}
                    className="min-h-9 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {isCapabilityRequest ? "Approve capability access" : "Approve team access"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => beginDecision(request, "rejected")}
                  className="min-h-9 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Reject {request.id}
                </button>
              </div>

              {expandedId === request.id ? (
                <div className="mt-4 grid gap-3 border-t border-border pt-4">
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
                  <button
                    type="button"
                    disabled={submittingId === request.id}
                    onClick={() => void submit(request)}
                    className="min-h-9 w-fit rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {decision === "approved" ? "Approve" : "Reject"} {request.id}
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
