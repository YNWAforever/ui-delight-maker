import { useMemo, useState } from "react";
import { toSafeErrorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { ACCOUNT_SETTINGS_TABS } from "@/lib/admin-ux-search";
import { NON_REQUESTABLE_CAPABILITIES } from "@/lib/admin/schemas";
import { CAPABILITIES } from "@/lib/admin/types";
import type { Capability } from "@/lib/admin/types";
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

export type AccountTab = (typeof ACCOUNT_SETTINGS_TABS)[number];

type AccountSettingsProps = {
  account: AccountViewData;
  /** URL-owned. The component never holds tab state of its own (IF-E2-50). */
  tab: AccountTab;
  onTabChange: (tab: AccountTab) => void;
  /** True for the one visit that follows invitation acceptance (IF-E2-43). */
  welcome?: boolean;
  onUpdateProfile: (input: AccountProfileInput) => Promise<unknown> | unknown;
  onUpdateAvailability: (input: AccountAvailabilityInput) => Promise<unknown> | unknown;
  onRevokeSessions: () => Promise<unknown> | unknown;
  onCreateDelegation: (input: AccountDelegationInput) => Promise<unknown> | unknown;
  onCancelDelegation: (id: string) => Promise<unknown> | unknown;
  onCreateAccessRequest: (input: AccountAccessRequestInput) => Promise<unknown> | unknown;
};

const TAB_LABELS: Record<AccountTab, string> = {
  profile: "Profile",
  security: "Security",
  workload: "Workload",
  availability: "Availability",
  access: "Access",
};

/**
 * The capabilities a person may ask for.
 *
 * The field used to be a free-text `<input>` seeded `"accounts.update"` (IF-E2-44). The
 * server validates against `z.enum(CAPABILITIES)`, so a typo cost a round trip and came back
 * as a ZodError string. `permissions.override` is excluded here for the same reason
 * `accessRequestSchema` rejects it: it is the capability that mints every other capability
 * and has to be granted deliberately by a super admin, never requested.
 */
const REQUESTABLE_CAPABILITIES: readonly Capability[] = CAPABILITIES.filter(
  (capability) => !NON_REQUESTABLE_CAPABILITIES.includes(capability),
);

/** The shape `accessRequestSchema` requires of `teamId`, checked before the round trip. */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Deliberately the shared formatter, not `toLocaleString()`. src/lib/format.ts pins en-GB and
// UTC so the server and the first client render produce identical markup; a locale-and-zone
// dependent string here rendered "05/08/2026, 23:30" on the server and "8/6/2026, 7:30:00 AM"
// in an Asia/Hong_Kong browser — a hydration mismatch, and a different date for the same row.
function formatDelegationDate(value: string | null | undefined) {
  if (!value) return "Not set";
  return Number.isNaN(new Date(value).getTime()) ? value : formatDateTime(value);
}

/**
 * The explicit save state each group on this page reports.
 *
 * Not one of the six writes had an in-progress state (IF-E2-48): double-clicking "Submit
 * access request" wrote two rows, and double-clicking "Create delegation" wrote two
 * overlapping delegations. Each also produced two *contradictory* signals on failure - a
 * sanitized toast from the route plus a fixed local sentence that said something different.
 * A single state per group fixes both: it is what disables the button, and it is what the
 * reader is told, in the same words the toast used.
 */
type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "invalid"; message: string }
  | { kind: "error"; message: string };

function stateMessage(state: SaveState): string | null {
  switch (state.kind) {
    case "idle":
      return null;
    case "saving":
      return "Saving...";
    case "saved":
      return `Saved ${formatDateTime(state.at)}`;
    default:
      return state.message;
  }
}

function SaveStateLine({ state, className }: { state: SaveState; className?: string }) {
  const message = stateMessage(state);
  if (message === null) return null;

  const failed = state.kind === "error" || state.kind === "invalid";
  return (
    <p
      role={failed ? "alert" : "status"}
      className={`text-sm ${failed ? "text-destructive" : "text-muted-foreground"} ${className ?? ""}`}
    >
      {message}
    </p>
  );
}

export function AccountSettings({
  account,
  tab,
  onTabChange,
  welcome = false,
  onUpdateProfile,
  onUpdateAvailability,
  onRevokeSessions,
  onCreateDelegation,
  onCancelDelegation,
  onCreateAccessRequest,
}: AccountSettingsProps) {
  const { profile } = account;
  const [name, setName] = useState(profile.name ?? "");
  const [jobTitle, setJobTitle] = useState(profile.job_title ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? "");
  const [profileState, setProfileState] = useState<SaveState>({ kind: "idle" });
  const [securityState, setSecurityState] = useState<SaveState>({ kind: "idle" });
  const [availabilityStatus, setAvailabilityStatus] = useState(profile.availability_status);
  const [leaveStarts, setLeaveStarts] = useState(profile.leave_starts_at?.slice(0, 16) ?? "");
  const [leaveEnds, setLeaveEnds] = useState(profile.leave_ends_at?.slice(0, 16) ?? "");
  const [availabilityState, setAvailabilityState] = useState<SaveState>({ kind: "idle" });
  const [delegateProfileId, setDelegateProfileId] = useState("");
  const [delegationStarts, setDelegationStarts] = useState("");
  const [delegationEnds, setDelegationEnds] = useState("");
  const [delegationReason, setDelegationReason] = useState("");
  const [delegationState, setDelegationState] = useState<SaveState>({ kind: "idle" });
  const [requestType, setRequestType] = useState<"capability" | "team">("capability");
  const [capability, setCapability] = useState<Capability>("accounts.update");
  const [teamId, setTeamId] = useState("");
  const [requestReason, setRequestReason] = useState("");
  const [accessState, setAccessState] = useState<SaveState>({ kind: "idle" });

  /**
   * One lock for the whole page, not one per button.
   *
   * These writes are not independent - a delegation cancel and a delegation create touch the
   * same rows, and profile and availability both invalidate the same account query. Letting
   * two run at once means the second one's refetch decides what the reader sees.
   */
  const [busy, setBusy] = useState<string | null>(null);

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

  /**
   * Runs one write with the page locked, and reports the same sentence the toast used.
   *
   * The route already sanitizes and toasts; the value it rethrows is sanitized again here so
   * the inline line and the toast cannot say different things about the same failure.
   */
  async function run(
    action: string,
    setState: (state: SaveState) => void,
    work: () => Promise<unknown> | unknown,
  ) {
    if (busy !== null) return;
    setBusy(action);
    setState({ kind: "saving" });
    try {
      await work();
      setState({ kind: "saved", at: new Date().toISOString() });
    } catch (error) {
      setState({ kind: "error", message: toSafeErrorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  const disabled = (action: string) => busy !== null && busy !== action;
  const label = (action: string, idle: string, running: string) =>
    busy === action ? running : idle;

  const revokeSessions = () => run("revoke-sessions", setSecurityState, () => onRevokeSessions());

  const cancelDelegation = (id: string) =>
    run(`cancel-delegation-${id}`, setDelegationState, () => onCancelDelegation(id));

  const saveProfile = () =>
    run("profile", setProfileState, () =>
      onUpdateProfile({
        name: name.trim() || null,
        job_title: jobTitle.trim() || null,
        phone: phone.trim() || null,
        avatar_url: avatarUrl.trim() || null,
        locale: profile.locale,
        timezone: profile.timezone,
      }),
    );

  const saveAvailability = () => {
    if (leaveStarts && leaveEnds && new Date(leaveEnds) <= new Date(leaveStarts)) {
      setAvailabilityState({ kind: "invalid", message: "Leave end must be after leave start" });
      return;
    }
    return run("availability", setAvailabilityState, () =>
      onUpdateAvailability({
        availability_status: availabilityStatus,
        leave_starts_at: leaveStarts ? new Date(leaveStarts).toISOString() : null,
        leave_ends_at: leaveEnds ? new Date(leaveEnds).toISOString() : null,
      }),
    );
  };

  const saveDelegation = () => {
    if (
      !delegateProfileId.trim() ||
      !delegationStarts ||
      !delegationEnds ||
      delegationReason.trim().length < 8
    ) {
      setDelegationState({
        kind: "invalid",
        message: "Delegate, dates, and a reason of at least eight characters are required",
      });
      return;
    }
    if (new Date(delegationEnds) <= new Date(delegationStarts)) {
      setDelegationState({ kind: "invalid", message: "Delegation end must be after start" });
      return;
    }
    return run("delegation", setDelegationState, async () => {
      await onCreateDelegation({
        delegateProfileId: delegateProfileId.trim(),
        startsAt: new Date(delegationStarts).toISOString(),
        endsAt: new Date(delegationEnds).toISOString(),
        reason: delegationReason.trim(),
      });
      setDelegationReason("");
    });
  };

  const saveAccessRequest = () => {
    if (requestReason.trim().length < 8) {
      setAccessState({
        kind: "invalid",
        message: "A reason of at least eight characters is required",
      });
      return;
    }
    // Checked here rather than paying a round trip for the ZodError: `accessRequestSchema`
    // requires `z.uuid()` (IF-E2-45), and the id is not discoverable from this page.
    if (requestType === "team" && !UUID_SHAPE.test(teamId.trim())) {
      setAccessState({
        kind: "invalid",
        message: "Team ID must be the team's identifier, in the 8-4-4-4-12 format",
      });
      return;
    }
    return run("access-request", setAccessState, async () => {
      await onCreateAccessRequest({
        requestType,
        capability: requestType === "capability" ? capability : undefined,
        teamId: requestType === "team" ? teamId.trim() : undefined,
        reason: requestReason.trim(),
      });
      setRequestReason("");
    });
  };

  return (
    <div className="space-y-5">
      {/* WorkspaceHeader owns this page's only h1; every heading below it is an h2. */}
      <div className="border-b border-border">
        <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Account settings">
          {ACCOUNT_SETTINGS_TABS.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={tab === item}
              onClick={() => onTabChange(item)}
              className={
                "min-h-10 shrink-0 border-b-2 px-3 py-2 text-sm font-medium " +
                (tab === item
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground")
              }
            >
              {TAB_LABELS[item]}
            </button>
          ))}
        </div>
      </div>

      {tab === "profile" ? (
        <section aria-label="Profile settings" className="space-y-5">
          {welcome ? (
            <div
              role="note"
              className="rounded-md border border-primary/30 bg-primary/5 p-4 text-sm"
            >
              <p className="font-medium text-foreground">Your account is active.</p>
              <p className="mt-1 text-muted-foreground">
                Check your name and contact details below, then set your availability so the team
                knows when you are reachable. Your role, department and teams are set by your
                organization.
              </p>
            </div>
          ) : null}

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
            <h2 className="text-base font-medium text-foreground lg:text-lg">Editable profile</h2>
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
              disabled={disabled("profile") || busy === "profile"}
              className="min-h-9 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {label("profile", "Save profile", "Saving...")}
            </button>
            <SaveStateLine state={profileState} />
          </div>

          <div className="border-t border-border pt-5">
            <h2 className="text-base font-medium text-foreground lg:text-lg">Teams</h2>
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
        <section aria-label="Security settings" className="space-y-4">
          <div className="rounded-md border border-border px-4 py-4">
            <h2 className="text-base font-medium text-foreground lg:text-lg">Password</h2>
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
            <h2 className="text-base font-medium text-foreground lg:text-lg">App sessions</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Invalidate older Fimmick app sessions while keeping this session available until
              refresh.
            </p>
            <button
              type="button"
              onClick={() => void revokeSessions()}
              disabled={disabled("revoke-sessions") || busy === "revoke-sessions"}
              className="mt-3 min-h-9 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-60"
            >
              {label("revoke-sessions", "Revoke app sessions", "Revoking...")}
            </button>
            <SaveStateLine state={securityState} className="mt-2" />
          </div>
          {/*
            The `securityContent` slot is gone (IF-E2-49). It was a declared prop rendering a
            section titled "Neon Auth security controls" that no caller ever filled, so MFA,
            device management and password change had a designed placeholder and no occupant.
            A slot nobody supplies is a promise the page cannot keep; what Neon Auth does
            offer today is the reset link above.
          */}
        </section>
      ) : null}

      {tab === "workload" ? (
        <section aria-label="Personal workload" className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {workloadEntries.map(([entryLabel, value]) => (
              <div key={entryLabel} className="rounded-md border border-border px-4 py-4">
                <p className="text-sm text-muted-foreground">{entryLabel}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
              </div>
            ))}
          </div>
          <div className="border-t border-border pt-5">
            <h2 className="text-base font-medium text-foreground lg:text-lg">Delegated coverage</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Delegate your active workload for a bounded time window. The delegate is identified by
              their profile id - ask them or an administrator for it, because this page cannot list
              other people.
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
              disabled={disabled("delegation") || busy === "delegation"}
              className="mt-3 min-h-9 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {label("delegation", "Create delegation", "Creating...")}
            </button>
            <SaveStateLine state={delegationState} className="mt-2" />
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
                        disabled={
                          disabled(`cancel-delegation-${delegation.id}`) ||
                          busy === `cancel-delegation-${delegation.id}`
                        }
                        className="min-h-9 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent disabled:opacity-60"
                      >
                        {label(
                          `cancel-delegation-${delegation.id}`,
                          "Cancel delegation",
                          "Cancelling...",
                        )}
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
        <section aria-label="Availability settings" className="space-y-4">
          <div>
            <h2 className="text-base font-medium text-foreground lg:text-lg">Availability</h2>
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
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void saveAvailability()}
              disabled={disabled("availability") || busy === "availability"}
              className="min-h-9 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {label("availability", "Save availability", "Saving...")}
            </button>
            <SaveStateLine state={availabilityState} />
          </div>
        </section>
      ) : null}

      {tab === "access" ? (
        <section aria-label="Access settings" className="space-y-5">
          <div>
            <h2 className="text-base font-medium text-foreground lg:text-lg">Request access</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Ask for a capability or team membership with a clear business reason. An administrator
              decides; nothing here grants anything by itself.
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
                <select
                  aria-label="Capability"
                  value={capability}
                  onChange={(event) => setCapability(event.target.value as Capability)}
                  className="mt-1 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {REQUESTABLE_CAPABILITIES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
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
                <span className="mt-1 block text-xs text-muted-foreground">
                  Ask an administrator for the team&apos;s id. The teams listed on your Profile tab
                  are the ones you already belong to.
                </span>
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
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void saveAccessRequest()}
              disabled={disabled("access-request") || busy === "access-request"}
              className="min-h-9 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {label("access-request", "Submit access request", "Submitting...")}
            </button>
            <SaveStateLine state={accessState} />
          </div>
          <div className="border-t border-border pt-5">
            <h2 className="text-base font-medium text-foreground lg:text-lg">Request history</h2>
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
