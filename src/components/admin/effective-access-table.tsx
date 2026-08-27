import { SectionHeader, StatusBadge } from "@/components/sales";
import { Button } from "@/components/ui/button";
import type { Capability } from "@/lib/admin/types";
import type { PermissionOverrideRecord } from "@/server/repositories/admin-access";

export type RoleDefaultAccess = {
  capability: Capability;
  allowed: boolean;
};

type EffectiveAccessTableProps = {
  roleDefaults: readonly RoleDefaultAccess[];
  /** Active overrides only. Expired and revoked ones belong in the history table. */
  overrides: readonly PermissionOverrideRecord[];
  /** Offers a revoke control per override. Omit for an actor without `permissions.override`. */
  onRevoke?: (override: PermissionOverrideRecord) => void;
  /** The override currently being revoked, so one row can be busy without freezing the rest. */
  revokingId?: string | null;
};

function effectiveState(
  roleDefault: boolean,
  overrides: readonly PermissionOverrideRecord[],
): { label: string; source: string } {
  const deny = overrides.find((override) => override.effect === "deny");
  if (deny) return { label: "Denied", source: "Explicit deny" };
  const allow = overrides.find((override) => override.effect === "allow");
  if (allow) return { label: "Allowed", source: "Explicit allow" };
  return roleDefault
    ? { label: "Allowed", source: "Role default" }
    : { label: "Denied", source: "Role default" };
}

/**
 * The scope an override actually has, spelled out.
 *
 * `overrideIsActive` in the policy engine narrows on department, team, resource type and
 * resource id. Until the dialog started sending them every override the product could create
 * was org-wide, and the table gave no way to tell — so an unscoped grant and a
 * single-team grant looked identical on the one screen whose job is to answer "what can this
 * person do".
 */
function scopeLabel(override: PermissionOverrideRecord): string {
  const parts: string[] = [];
  if (override.departmentId) parts.push(`Department ${override.departmentId}`);
  if (override.teamId) parts.push(`Team ${override.teamId}`);
  if (override.resourceType) {
    parts.push(
      override.resourceId
        ? `${override.resourceType} ${override.resourceId}`
        : `Any ${override.resourceType}`,
    );
  }
  return parts.length === 0 ? "Everywhere" : parts.join(" · ");
}

export function EffectiveAccessTable({
  roleDefaults,
  overrides,
  onRevoke,
  revokingId = null,
}: EffectiveAccessTableProps) {
  const capabilities = [
    ...new Set([
      ...roleDefaults.map((entry) => entry.capability),
      ...overrides.map((entry) => entry.capability),
    ]),
  ].sort();
  const defaults = new Map(roleDefaults.map((entry) => [entry.capability, entry.allowed]));

  return (
    <section aria-label="Effective access" className="space-y-4 px-4 py-6 md:px-6">
      <SectionHeader
        title="Effective access"
        description="Role defaults, explicit overrides and the final decision are shown separately, so an exception is never mistaken for a role."
      />
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[46rem] text-left text-sm">
          <thead className="border-b border-border bg-muted/30 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-3 font-medium">Capability</th>
              <th className="px-3 py-3 font-medium">Role default</th>
              <th className="px-3 py-3 font-medium">Explicit overrides</th>
              <th className="px-3 py-3 font-medium">Effective access</th>
              {onRevoke ? <th className="px-3 py-3 font-medium">Revoke</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {capabilities.map((capability) => {
              const matching = overrides.filter((entry) => entry.capability === capability);
              const state = effectiveState(defaults.get(capability) ?? false, matching);
              return (
                <tr key={capability}>
                  <td className="px-3 py-3 font-medium text-foreground">{capability}</td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {defaults.get(capability) ? "Allowed" : "Denied"}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {matching.length === 0 ? (
                      "None"
                    ) : (
                      <ul className="space-y-1">
                        {matching.map((entry) => (
                          <li key={entry.id}>
                            <span className="text-foreground">
                              {entry.effect === "deny" ? "Explicit deny" : "Explicit allow"}
                            </span>
                            <span className="ml-2 text-xs">{scopeLabel(entry)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-3 py-3 text-foreground">
                    <span className="font-medium">{state.label}</span>
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      ({state.source})
                    </span>
                  </td>
                  {onRevoke ? (
                    <td className="px-3 py-3">
                      {matching.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {matching.map((entry) => (
                            <Button
                              key={entry.id}
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={revokingId !== null}
                              onClick={() => onRevoke(entry)}
                            >
                              {revokingId === entry.id ? "Revoking…" : "Revoke"}
                            </Button>
                          ))}
                        </div>
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export type OverrideHistoryProps = {
  overrides: readonly PermissionOverrideRecord[];
};

/**
 * Expired and revoked overrides.
 *
 * It has always rendered a "Revoked" state, and until `revokeAdminPermissionOverrideFn` was
 * wired to a control nothing in the product could produce one — a permanent grant made on
 * this screen could only be undone with direct SQL.
 */
export function OverrideHistory({ overrides }: OverrideHistoryProps) {
  const history = overrides.filter(
    (entry) =>
      Boolean(entry.revokedAt) ||
      Boolean(entry.expiresAt && Date.parse(entry.expiresAt) <= Date.now()),
  );

  return (
    <section
      aria-label="Override history"
      className="space-y-4 border-t border-border px-4 py-6 md:px-6"
    >
      <SectionHeader
        title="Expired and revoked history"
        description="Historical overrides stay visible for review and are never treated as active access."
      />
      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground">No expired or revoked overrides.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[42rem] text-left text-sm">
            <thead className="border-b border-border bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-3 font-medium">Capability</th>
                <th className="px-3 py-3 font-medium">Effect</th>
                <th className="px-3 py-3 font-medium">Scope</th>
                <th className="px-3 py-3 font-medium">Reason</th>
                <th className="px-3 py-3 font-medium">State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {history.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-3 py-3 text-foreground">{entry.capability}</td>
                  <td className="px-3 py-3 text-foreground">
                    {entry.effect === "deny" ? "Explicit deny" : "Explicit allow"}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{scopeLabel(entry)}</td>
                  <td className="px-3 py-3 text-muted-foreground">{entry.reason}</td>
                  <td className="px-3 py-3">
                    {/* Both mean "no longer active", so both take the neutral tone. */}
                    <StatusBadge
                      domain="accessRequests"
                      value="cancelled"
                      label={entry.revokedAt ? "Revoked" : "Expired"}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
