import { useState } from "react";
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
  onAddMembers: (profileIds: string[], startsAt: string | null, endsAt: string | null) => void;
  onUpdateMember: (member: TeamMemberRow, role: "lead" | "deputy" | "member") => void;
  onEndMember: (member: TeamMemberRow) => void;
};

function dateValue(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

function isoDate(value: string) {
  return value ? new Date(value + "T00:00:00.000Z").toISOString() : null;
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
  const currentIds = new Set(members.map((member) => member.profileId));
  const candidates = availableMembers.filter(
    (member) => member.status === "active" && !currentIds.has(member.id),
  );

  function addSelectedMembers() {
    if (selectedIds.length === 0) {
      setError("Choose at least one member.");
      return;
    }
    if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
      setError("Membership end must be after its start.");
      return;
    }
    onAddMembers(selectedIds, isoDate(startsAt), isoDate(endsAt));
    setSelectedIds([]);
    setStartsAt("");
    setEndsAt("");
    setError(null);
  }

  return (
    <section className="rounded-md border border-border">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-muted/20 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Team members</h3>
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
                onChange={(event) =>
                  setSelectedIds(
                    Array.from(event.currentTarget.selectedOptions, (option) => option.value),
                  )
                }
                size={Math.min(4, Math.max(2, candidates.length))}
                className="mt-1 min-h-20 w-full rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            <button
              type="button"
              onClick={addSelectedMembers}
              className="min-h-9 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Add selected members
            </button>
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
              {members.map((member) => (
                <tr key={member.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{member.name || "Unnamed user"}</p>
                    <p className="text-xs text-muted-foreground">{member.email || "No email"}</p>
                  </td>
                  <td className="px-4 py-3">
                    {canManage ? (
                      <select
                        aria-label={"Role for " + (member.name || member.email || member.profileId)}
                        value={member.membershipRole}
                        onChange={(event) =>
                          onUpdateMember(member, event.target.value as "lead" | "deputy" | "member")
                        }
                        className="min-h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                    {member.startsAt ? member.startsAt.slice(0, 10) : "Open start"} to{" "}
                    {member.endsAt ? member.endsAt.slice(0, 10) : "Open end"}
                  </td>
                  {canManage ? (
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onEndMember(member)}
                        className="min-h-9 rounded-md border border-destructive/50 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        End membership
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
