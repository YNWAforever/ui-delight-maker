import { useMemo, useState, type ReactNode } from "react";
import { formatDateTime } from "@/lib/format";
import type { Profile } from "@/lib/types";
import type { AccessRequest, WorkDelegation } from "@/server/repositories/admin-access";
import type { UserWorkloadSummary } from "@/server/repositories/admin-users";

export type AccountViewData = {
  profile: Profile;
  departmentName?: string | null;
  managerName?: string | null;
  teams?: Array<{
    teamId: string;
    teamName: string;
    membershipRole: string;
  }>;
  workload?: UserWorkloadSummary;
  delegations?: readonly WorkDelegation[];
  accessRequests?: readonly AccessRequest[];
};

export type AccountProfileInput = {
  name?: string | null;
  job_title?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  locale?: string;
  timezone?: string;
};

export type AccountAvailabilityInput = {
  availability_status: Profile["availability_status"];
  leave_starts_at: string | null;
  leave_ends_at: string | null;
};

export type AccountDelegationInput = {
  delegateProfileId: string;
  startsAt: string;
  endsAt: string;
  reason: string;
};

export type AccountAccessRequestInput = {
  requestType: "capability" | "team";
  capability?: string;
  teamId?: string;
  reason: string;
};

type AccountSettingsProps = {
  account: AccountViewData;
  securityContent?: ReactNode;
  onUpdateProfile: (input: AccountProfileInput) => Promise<unknown> | unknown;
  onUpdateAvailability: (input: AccountAvailabilityInput) => Promise<unknown> | unknown;
  onRevokeSessions: () => Promise<unknown> | unknown;
  onCreateDelegation: (input: AccountDelegationInput) => Promise<unknown> | unknown;
  onCancelDelegation: (id: string) => Promise<unknown> | unknown;
  onCreateAccessRequest: (input: AccountAccessRequestInput) => Promise<unknown> | unknown;
};

type AccountTab = "profile" | "security" | "workload" | "availability" | "access";

const tabs: Array<{ id: AccountTab; label: string }> = [
  { id: "profile", label: "Profile" },
  { id: "security", label: "Security" },
  { id: "workload", label: "Workload" },
  { id: "availability", label: "Availability" },
  { id: "access", label: "Access" },
];

// Deliberately the shared formatter, not `toLocaleString()`. src/lib/format.ts pins en-GB and
// UTC so the server and the first client render produce identical markup; a locale-and-zone
// dependent string here rendered "05/08/2026, 23:30" on the server and "8/6/2026, 7:30:00 AM"
// in an Asia/Hong_Kong browser — a hydration mismatch, and a different date for the same row.
function formatDelegationDate(value: string | null | undefined) {
  if (!value) return "Not set";
  return Number.isNaN(new Date(value).getTime()) ? value : formatDateTime(value);
}

export function AccountSettings({
  account,
  securityContent,
  onUpdateProfile,
  onUpdateAvailability,
  onRevokeSessions,
  onCreateDelegation,
  onCancelDelegation,
  onCreateAccessRequest,
}: AccountSettingsProps) {
  const { profile } = account;
  const [tab, setTab] = useState<AccountTab>("profile");
  const [name, setName] = useState(profile.name ?? "");
  const [jobTitle, setJobTitle] = useState(profile.job_title ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? "");
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [securityMessage, setSecurityMessage] = useState<string | null>(null);
  const [availabilityStatus, setAvailabilityStatus] = useState(profile.availability_status);
  const [leaveStarts, setLeaveStarts] = useState(profile.leave_starts_at?.slice(0, 16) ?? "");
  const [leaveEnds, setLeaveEnds] = useState(profile.leave_ends_at?.slice(0, 16) ?? "");
  const [availabilityMessage, setAvailabilityMessage] = useState<string | null>(null);
  const [delegateProfileId, setDelegateProfileId] = useState("");
  const [delegationStarts, setDelegationStarts] = useState("");
  const [delegationEnds, setDelegationEnds] = useState("");
  const [delegationReason, setDelegationReason] = useState("");
  const [delegationMessage, setDelegationMessage] = useState<string | null>(null);
  const [requestType, setRequestType] = useState<"capability" | "team">("capability");
  const [capability, setCapability] = useState("accounts.update");
  const [teamId, setTeamId] = useState("");
  const [requestReason, setRequestReason] = useState("");
  const [accessMessage, setAccessMessage] = useState<string | null>(null);

  const workloadEntries = useMemo(
    () =>
      [
        ["Open tasks", account.workload?.openTasks ?? 0],
        ["Assigned leads", account.workload?.assignedLeads ?? 0],
        ["Owned accounts", account.workload?.ownedAccounts ?? 0],
        ["Owned clients", account.workload?.ownedClients ?? 0],
        ["Owned quotes", account.workload?.ownedQuotes ?? 0],
        ["Owned job sheets", account.workload?.ownedJobSheets ?? 0],
      ] as const,
    [account.workload],
  );

  async function revokeSessions() {
    try {
      await onRevokeSessions();
      setSecurityMessage("Older app sessions revoked");
    } catch {
      setSecurityMessage("Could not revoke app sessions");
    }
  }

  async function cancelDelegation(id: string) {
    try {
      await onCancelDelegation(id);
      setDelegationMessage("Delegation cancelled");
    } catch {
      setDelegationMessage("Could not cancel delegation");
    }
  }
  async function saveProfile() {
    try {
      await onUpdateProfile({
        name: name.trim() || null,
        job_title: jobTitle.trim() || null,
        phone: phone.trim() || null,
        avatar_url: avatarUrl.trim() || null,
        locale: profile.locale,
        timezone: profile.timezone,
      });
      setProfileMessage("Profile updated");
    } catch {
      setProfileMessage("Could not update profile");
    }
  }

  async function saveAvailability() {
    if (leaveStarts && leaveEnds && new Date(leaveEnds) <= new Date(leaveStarts)) {
      setAvailabilityMessage("Leave end must be after leave start");
      return;
    }
    setAvailabilityMessage(null);
    try {
      await onUpdateAvailability({
        availability_status: availabilityStatus,
        leave_starts_at: leaveStarts ? new Date(leaveStarts).toISOString() : null,
        leave_ends_at: leaveEnds ? new Date(leaveEnds).toISOString() : null,
      });
      setAvailabilityMessage("Availability updated");
    } catch {
      setAvailabilityMessage("Could not update availability");
    }
  }

  async function saveDelegation() {
    if (
      !delegateProfileId ||
      !delegationStarts ||
      !delegationEnds ||
      delegationReason.trim().length < 8
    ) {
      setDelegationMessage("Delegate, dates, and a meaningful reason are required");
      return;
    }
    if (new Date(delegationEnds) <= new Date(delegationStarts)) {
      setDelegationMessage("Delegation end must be after start");
      return;
    }
    setDelegationMessage(null);
    try {
      await onCreateDelegation({
        delegateProfileId,
        startsAt: new Date(delegationStarts).toISOString(),
        endsAt: new Date(delegationEnds).toISOString(),
        reason: delegationReason.trim(),
      });
      setDelegationMessage("Delegation created");
      setDelegationReason("");
    } catch {
      setDelegationMessage("Could not create delegation");
    }
  }

  async function saveAccessRequest() {
    if (requestReason.trim().length < 8) {
      setAccessMessage("A meaningful reason is required");
      return;
    }
    if (requestType === "team" && !teamId.trim()) {
      setAccessMessage("Team ID is required");
      return;
    }
    setAccessMessage(null);
    try {
      await onCreateAccessRequest({
        requestType,
        capability: requestType === "capability" ? capability : undefined,
        teamId: requestType === "team" ? teamId.trim() : undefined,
        reason: requestReason.trim(),
      });
      setAccessMessage("Access request submitted");
      setRequestReason("");
    } catch {
      setAccessMessage("Could not submit access request");
    }
  }

  return (
    <div className="space-y-5">
      <div className="border-b border-border px-4 pt-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Personal account
          </p>
          <h1 className="mt-1 text-xl font-semibold text-foreground">Account settings</h1>
          <p className="mt-1 pb-4 text-sm text-muted-foreground">
            Manage your profile, availability, security, workload, and access requests.
          </p>
        </div>
        <div
          className="flex gap-1 overflow-x-auto"
          role="tablist"
          aria-label="Account settings tabs"
        >
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={
                "min-h-10 shrink-0 border-b-2 px-3 py-2 text-sm font-medium " +
                (tab === item.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground")
              }
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "profile" ? (
        <section aria-label="Profile settings" className="space-y-5 px-4">
          <div className="grid gap-3 border-b border-border pb-5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Role</dt>
              <dd className="mt-1 font-medium text-foreground">{profile.role}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Department</dt>
              <dd className="mt-1 font-medium text-foreground">
                {account.departmentName ?? "Not assigned"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Manager</dt>
              <dd className="mt-1 font-medium text-foreground">
                {account.managerName ?? "Not assigned"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Email</dt>
              <dd className="mt-1 break-all font-medium text-foreground">
                {profile.email ?? "Not set"}
              </dd>
            </div>
          </div>

          <div>
            <h2 className="text-base font-semibold text-foreground">Editable profile</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Role, department, manager, status, and teams are controlled by your organization.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-foreground">Name</span>
              <input
                aria-label="Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-1 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-foreground">Job title</span>
              <input
                aria-label="Job title"
                value={jobTitle}
                onChange={(event) => setJobTitle(event.target.value)}
                className="mt-1 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-foreground">Phone</span>
              <input
                aria-label="Phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="mt-1 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-foreground">Avatar URL</span>
              <input
                aria-label="Avatar URL"
                value={avatarUrl}
                onChange={(event) => setAvatarUrl(event.target.value)}
                className="mt-1 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void saveProfile()}
              className="min-h-9 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            >
              Save profile
            </button>
            {profileMessage ? (
              <p role="status" className="text-sm text-muted-foreground">
                {profileMessage}
              </p>
            ) : null}
          </div>

          <div className="border-t border-border pt-5">
            <h2 className="text-base font-semibold text-foreground">Teams</h2>
            <div className="mt-3 divide-y divide-border rounded-md border border-border">
              {(account.teams ?? []).length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">No active teams.</p>
              ) : (
                account.teams?.map((team) => (
                  <div
                    key={team.teamId}
                    className="flex flex-wrap justify-between gap-2 px-3 py-3 text-sm"
                  >
                    <span className="font-medium text-foreground">{team.teamName}</span>
                    <span className="text-muted-foreground">{team.membershipRole}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      ) : null}

      {tab === "security" ? (
        <section aria-label="Security settings" className="space-y-4 px-4">
          <div className="rounded-md border border-border px-4 py-4">
            <h2 className="text-base font-semibold text-foreground">Password</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Reset your Neon Auth password from the supported sign-in route.
            </p>
            <a
              href="/login/forgot-password"
              className="mt-3 inline-flex min-h-9 items-center rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
            >
              Reset password
            </a>
          </div>
          <div className="rounded-md border border-border px-4 py-4">
            <h2 className="text-base font-semibold text-foreground">App sessions</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Invalidate older Fimmick app sessions while keeping this session available until
              refresh.
            </p>
            <button
              type="button"
              onClick={() => void revokeSessions()}
              className="mt-3 min-h-9 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
            >
              Revoke app sessions
            </button>
            {securityMessage ? (
              <p role="status" className="mt-2 text-sm text-muted-foreground">
                {securityMessage}
              </p>
            ) : null}
          </div>
          {securityContent ? (
            <div aria-label="Neon Auth security controls" className="border-t border-border pt-4">
              {securityContent}
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === "workload" ? (
        <section aria-label="Personal workload" className="space-y-5 px-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {workloadEntries.map(([label, value]) => (
              <div key={label} className="rounded-md border border-border px-4 py-4">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
              </div>
            ))}
          </div>
          <div className="border-t border-border pt-5">
            <h2 className="text-base font-semibold text-foreground">Delegated coverage</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Delegate your active workload for a bounded time window.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Delegate profile</span>
                <input
                  aria-label="Delegate profile"
                  value={delegateProfileId}
                  onChange={(event) => setDelegateProfileId(event.target.value)}
                  className="mt-1 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Starts</span>
                <input
                  aria-label="Delegation starts"
                  type="datetime-local"
                  value={delegationStarts}
                  onChange={(event) => setDelegationStarts(event.target.value)}
                  className="mt-1 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Ends</span>
                <input
                  aria-label="Delegation ends"
                  type="datetime-local"
                  value={delegationEnds}
                  onChange={(event) => setDelegationEnds(event.target.value)}
                  className="mt-1 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Reason</span>
                <input
                  aria-label="Delegation reason"
                  value={delegationReason}
                  onChange={(event) => setDelegationReason(event.target.value)}
                  className="mt-1 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() => void saveDelegation()}
              className="mt-3 min-h-9 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            >
              Create delegation
            </button>
            {delegationMessage ? (
              <p role="status" className="mt-2 text-sm text-muted-foreground">
                {delegationMessage}
              </p>
            ) : null}
            <div className="mt-4 divide-y divide-border rounded-md border border-border">
              {(account.delegations ?? []).length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">No current delegations.</p>
              ) : (
                account.delegations?.map((delegation) => (
                  <div
                    key={delegation.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 text-sm"
                  >
                    <div>
                      <p className="font-medium text-foreground">
                        {delegation.delegatorProfileId} to {delegation.delegateProfileId}
                      </p>
                      <p className="text-muted-foreground">
                        {formatDelegationDate(delegation.startsAt)} to{" "}
                        {formatDelegationDate(delegation.endsAt)}
                      </p>
                    </div>
                    {delegation.delegatorProfileId === profile.id &&
                    delegation.status === "active" ? (
                      <button
                        type="button"
                        onClick={() => void cancelDelegation(delegation.id)}
                        className="min-h-9 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
                      >
                        Cancel delegation
                      </button>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      ) : null}

      {tab === "availability" ? (
        <section aria-label="Availability settings" className="space-y-4 px-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Availability</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Keep your current capacity and leave window visible to the team.
            </p>
          </div>
          <label className="block max-w-sm">
            <span className="text-sm font-medium text-foreground">Availability status</span>
            <select
              aria-label="Availability status"
              value={availabilityStatus}
              onChange={(event) =>
                setAvailabilityStatus(event.target.value as Profile["availability_status"])
              }
              className="mt-1 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="available">Available</option>
              <option value="limited">Limited</option>
              <option value="away">Away</option>
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-foreground">Leave starts</span>
              <input
                aria-label="Leave starts"
                type="datetime-local"
                value={leaveStarts}
                onChange={(event) => setLeaveStarts(event.target.value)}
                className="mt-1 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-foreground">Leave ends</span>
              <input
                aria-label="Leave ends"
                type="datetime-local"
                value={leaveEnds}
                onChange={(event) => setLeaveEnds(event.target.value)}
                className="mt-1 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => void saveAvailability()}
            className="min-h-9 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            Save availability
          </button>
          {availabilityMessage ? (
            <p role="status" className="text-sm text-muted-foreground">
              {availabilityMessage}
            </p>
          ) : null}
        </section>
      ) : null}

      {tab === "access" ? (
        <section aria-label="Access settings" className="space-y-5 px-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Request access</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Ask for a capability or team membership with a clear business reason.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-foreground">Request type</span>
              <select
                aria-label="Request type"
                value={requestType}
                onChange={(event) => setRequestType(event.target.value as "capability" | "team")}
                className="mt-1 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="capability">Capability</option>
                <option value="team">Team membership</option>
              </select>
            </label>
            {requestType === "capability" ? (
              <label className="block">
                <span className="text-sm font-medium text-foreground">Capability</span>
                <input
                  aria-label="Capability"
                  value={capability}
                  onChange={(event) => setCapability(event.target.value)}
                  className="mt-1 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
              </label>
            ) : (
              <label className="block">
                <span className="text-sm font-medium text-foreground">Team ID</span>
                <input
                  aria-label="Team ID"
                  value={teamId}
                  onChange={(event) => setTeamId(event.target.value)}
                  className="mt-1 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
              </label>
            )}
          </div>
          <label className="block">
            <span className="text-sm font-medium text-foreground">Reason</span>
            <textarea
              aria-label="Access request reason"
              value={requestReason}
              onChange={(event) => setRequestReason(event.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => void saveAccessRequest()}
            className="min-h-9 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            Submit access request
          </button>
          {accessMessage ? (
            <p role="status" className="text-sm text-muted-foreground">
              {accessMessage}
            </p>
          ) : null}
          <div className="border-t border-border pt-5">
            <h2 className="text-base font-semibold text-foreground">Request history</h2>
            {(account.accessRequests ?? []).length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No access requests yet.</p>
            ) : (
              <div className="mt-3 divide-y divide-border rounded-md border border-border">
                {account.accessRequests?.map((request) => (
                  <div
                    key={request.id}
                    className="flex flex-wrap justify-between gap-2 px-3 py-3 text-sm"
                  >
                    <span className="text-foreground">
                      {request.requestType === "capability" ? request.capability : request.teamId}
                    </span>
                    <span className="capitalize text-muted-foreground">{request.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
