import type { Capability, PermissionOverride } from "@/lib/admin/types";

export type RoleDefaultAccess = {
  capability: Capability;
  allowed: boolean;
};

type EffectiveAccessTableProps = {
  roleDefaults: readonly RoleDefaultAccess[];
  overrides: readonly PermissionOverride[];
};

function effectiveState(
  roleDefault: boolean,
  overrides: readonly PermissionOverride[],
): { label: string; source: string } {
  const deny = overrides.find((override) => override.effect === "deny");
  if (deny) return { label: "Denied", source: "Explicit deny" };
  const allow = overrides.find((override) => override.effect === "allow");
  if (allow) return { label: "Allowed", source: "Explicit allow" };
  return roleDefault
    ? { label: "Allowed", source: "Role default" }
    : { label: "Denied", source: "Role default" };
}

export function EffectiveAccessTable({ roleDefaults, overrides }: EffectiveAccessTableProps) {
  const capabilities = [
    ...new Set([
      ...roleDefaults.map((entry) => entry.capability),
      ...overrides.map((entry) => entry.capability),
    ]),
  ].sort();
  const defaults = new Map(roleDefaults.map((entry) => [entry.capability, entry.allowed]));

  return (
    <section aria-label="Effective access" className="space-y-4 px-4 py-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">Effective access</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Role defaults, explicit overrides, and final decisions are shown separately.
        </p>
      </div>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[38rem] text-left text-sm">
          <thead className="border-b border-border bg-muted/30 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-3 font-medium">Capability</th>
              <th className="px-3 py-3 font-medium">Role default</th>
              <th className="px-3 py-3 font-medium">Explicit overrides</th>
              <th className="px-3 py-3 font-medium">Effective access</th>
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
                    {matching.length === 0
                      ? "None"
                      : matching.map((entry) => (
                          <span
                            key={entry.effect + "-" + entry.capability}
                            className="mr-2 inline-flex gap-1"
                          >
                            <span>
                              {entry.effect === "deny" ? "Explicit deny" : "Explicit allow"}
                            </span>
                          </span>
                        ))}
                  </td>
                  <td className="px-3 py-3 font-semibold text-foreground">
                    <span>{state.label}</span>
                    <span className="ml-2 font-normal text-muted-foreground">({state.source})</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
