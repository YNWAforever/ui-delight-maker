import { useState } from "react";

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
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import type { ProfileStatus } from "@/lib/admin/types";
import type { TeamMembership } from "@/server/repositories/admin-teams";

export type TeamMemberUser = {
  id: string;
  name: string | null;
  email: string | null;
  status: ProfileStatus;
};

export type TeamMemberRow = TeamMembership & {
  name: string;
  email: string | null;
  profileStatus: ProfileStatus;
};

type TeamMemberTableProps = {
  members: readonly TeamMemberRow[];
  availableMembers: readonly TeamMemberUser[];
  canManage: boolean;
  /**
   * Every handler may return a promise, and this table awaits it.
   *
   * That is the contract change that makes the rest of this component honest. The three
   * handlers were called fire-and-forget, so a rejected `upsertAdminTeamMembershipFn` was an
   * unhandled promise rejection: no toast, no alert, and — because nothing here writes
   * optimistically — the row simply did not change. A reader could not tell "saved" from
   * "refused". Awaiting means the in-flight state is real and the caller's `catch` runs
   * before this component decides whether to clear anything.
   */
  onAddMembers: (
    profileIds: string[],
    startsAt: string | null,
    endsAt: string | null,
  ) => Promise<unknown> | unknown;
  onUpdateMember: (
    member: TeamMemberRow,
    role: "lead" | "deputy" | "member",
  ) => Promise<unknown> | unknown;
  onEndMember: (member: TeamMemberRow) => Promise<unknown> | unknown;
};

function dateValue(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

function isoDate(value: string) {
  return value ? new Date(value + "T00:00:00.000Z").toISOString() : null;
}

function memberLabel(member: TeamMemberRow) {
  return member.name || member.email || member.profileId;
}

export function TeamMemberTable({
  members,
  availableMembers,
  canManage,
  onAddMembers,
  onUpdateMember,
  onEndMember,
}: TeamMemberTableProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  /**
   * The membership currently being written, keyed by row id.
   *
   * `endAdminTeamMembershipFn` stamps a fresh `new Date().toISOString()` per call, so two
   * clicks wrote two different `endedAt` values and two audit rows for one human action.
   * Per-row rather than a single flag so one slow row does not freeze the whole table.
   */
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [endTarget, setEndTarget] = useState<TeamMemberRow | null>(null);

  const currentIds = new Set(members.map((member) => member.profileId));
  const candidates = availableMembers.filter(
    (member) => member.status === "active" && !currentIds.has(member.id),
  );

  async function addSelectedMembers() {
    if (adding) return;
    if (selectedIds.length === 0) {
      setError("Choose at least one member.");
      return;
    }
    if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
      setError("Membership end must be after its start.");
      return;
    }

    setError(null);
    setAdding(true);
    try {
      await onAddMembers(selectedIds, isoDate(startsAt), isoDate(endsAt));
      // Cleared only after the write settles. Clearing on click read as confirmation, and
      // when the write was refused it wiped the selection with no message and no way to
      // recover what had been chosen.
      setSelectedIds([]);
      setStartsAt("");
      setEndsAt("");
    } catch {
      // The caller owns the message — it has the sanitizer and the toast surface. This
      // component's job is to keep the form intact so the action can be retried.
      setError("Those members were not added. The selection has been kept.");
    } finally {
      setAdding(false);
    }
  }

  async function changeRole(member: TeamMemberRow, role: "lead" | "deputy" | "member") {
    if (pendingId) return;
    setPendingId(member.id);
    try {
      await onUpdateMember(member, role);
    } catch {
      setError("That membership role was not changed.");
    } finally {
      setPendingId(null);
    }
  }

  async function endMembership(member: TeamMemberRow) {
    if (pendingId) return;
    setPendingId(member.id);
    try {
      await onEndMember(member);
    } catch {
      setError("That membership was not ended.");
    } finally {
      setPendingId(null);
      setEndTarget(null);
    }
  }

  return (
    <section className="rounded-md border border-border">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-muted/20 px-4 py-3">
        <div>
          <h3 className="text-sm font-medium text-foreground">Team members</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Active memberships retain their history when roles or dates change.
          </p>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">{members.length} active</span>
      </div>

      {canManage && candidates.length > 0 ? (
        <div className="border-b border-border px-4 py-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem_10rem_auto] md:items-end">
            <label className="block min-w-0">
              <span className="text-xs font-medium text-foreground">Add members</span>
              <select
                multiple
                aria-label="Add members"
                value={selectedIds}
                disabled={adding}
                onChange={(event) =>
                  setSelectedIds(
                    Array.from(event.currentTarget.selectedOptions, (option) => option.value),
                  )
                }
                size={Math.min(4, Math.max(2, candidates.length))}
                className="mt-1 min-h-20 w-full rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                {candidates.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name || member.email || member.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-foreground">Starts</span>
              <input
                aria-label="Membership start"
                type="date"
                value={dateValue(startsAt)}
                onChange={(event) => setStartsAt(event.target.value)}
                className="mt-1 min-h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-foreground">Ends</span>
              <input
                aria-label="Membership end"
                type="date"
                value={dateValue(endsAt)}
                onChange={(event) => setEndsAt(event.target.value)}
                className="mt-1 min-h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <Button
              type="button"
              size="sm"
              disabled={adding}
              onClick={() => void addSelectedMembers()}
            >
              {adding ? "Adding…" : "Add selected members"}
            </Button>
          </div>
          {error ? (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      {members.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">No active members.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Member</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 font-medium">Membership window</th>
                {canManage ? <th className="px-4 py-2.5 font-medium">Actions</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {members.map((member) => {
                const busy = pendingId === member.id;
                return (
                  <tr key={member.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{member.name || "Unnamed user"}</p>
                      <p className="text-xs text-muted-foreground">{member.email || "No email"}</p>
                    </td>
                    <td className="px-4 py-3">
                      {canManage ? (
                        <select
                          aria-label={"Role for " + memberLabel(member)}
                          value={member.membershipRole}
                          disabled={busy}
                          onChange={(event) =>
                            void changeRole(
                              member,
                              event.target.value as "lead" | "deputy" | "member",
                            )
                          }
                          className="min-h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                        >
                          <option value="member">Member</option>
                          <option value="lead">Lead</option>
                          <option value="deputy">Deputy</option>
                        </select>
                      ) : (
                        <span className="capitalize text-muted-foreground">
                          {member.membershipRole}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {member.startsAt ? formatDate(member.startsAt) : "Open start"} to{" "}
                      {member.endsAt ? formatDate(member.endsAt) : "Open end"}
                    </td>
                    {canManage ? (
                      <td className="px-4 py-3">
                        {/*
                          Subordinate on purpose: an outline button, not a filled destructive
                          one, and the consequence is spelled out in the dialog rather than
                          on the row. Ending a membership can remove someone's scope over
                          live work, so it is never a single unconfirmed click.
                        */}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => setEndTarget(member)}
                        >
                          {busy ? "Working…" : "End membership"}
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AlertDialog open={endTarget !== null} onOpenChange={(open) => !open && setEndTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              End {endTarget ? memberLabel(endTarget) : "this"} membership?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The membership is closed with today&apos;s date and recorded in the administrative
              audit log. Any team scope this person had over the team&apos;s work ends with it. They
              keep their profile and their own records, and can be added back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep membership</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                // Radix closes on click; the dialog is kept open until the write settles so
                // a failure is not indistinguishable from a success.
                event.preventDefault();
                if (endTarget) void endMembership(endTarget);
              }}
            >
              End membership
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
