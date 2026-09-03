import type { Capability } from "@/lib/admin/types";

/**
 * Which capability entitles a reader to an agent run's content — `input_data` and
 * `output_summary` alike — keyed on the run's `subject_type`.
 *
 * An explicit literal table rather than a derivation, because two of the eight values do not
 * follow the pattern. There is no `clients.view` capability — the product gates client reads
 * on `accounts.view` (`server-functions/clients.ts`) — so a derived `${subject_type}s.view`
 * would produce a string outside `Capability`, which `evaluateAuthorization` answers with
 * `unknown_capability`: a denial for every actor including `super_admin`.
 *
 * Keyed on what `agent_runs.subject_type` can actually hold — eight values, per the check
 * constraint widened in `neon/migrations/003_client_relationship_360.sql:182` — and not on
 * the `SubjectType` union in the repository, which has never named `quote`, `client`, `task`
 * or `approval` and constrains writes only.
 *
 * `task` and `approval` are the two entries with no targeted `.view` precedent to copy: the
 * nearest call sites gate writes (`tasks.update`, `approvals.decide`). They are deliberately
 * mapped to the view capabilities, because `sales` holds `approvals.view` without holding
 * `approvals.decide`, and gating a read behind the write would deny it a row it should see.
 */
export const AGENT_SUBJECT_VIEW_CAPABILITY = {
  lead: "leads.view",
  account: "accounts.view",
  client: "accounts.view",
  campaign: "campaigns.view",
  quote: "quotes.view",
  engagement: "engagements.view",
  task: "tasks.view",
  approval: "approvals.view",
} as const satisfies Record<string, Capability>;

/**
 * The distinct capabilities above, for `requireCapabilitySet`'s `optional` list.
 *
 * Deduplicated because `account` and `client` share `accounts.view`, and asking for the same
 * capability twice would evaluate it twice for no gain.
 */
export const AGENT_SUBJECT_VIEW_CAPABILITIES: readonly Capability[] = [
  ...new Set<Capability>(Object.values(AGENT_SUBJECT_VIEW_CAPABILITY)),
];

/**
 * `null` for a subject type the table does not name.
 *
 * Callers must treat `null` as "not entitled". `AgentRun.subject_type` is typed `string`
 * (`lib/types.ts:409`), not the four-value union, so a value outside this table is reachable
 * at runtime and the compiler will not flag its absence.
 *
 * `Object.hasOwn` rather than a bare index read: `AGENT_SUBJECT_VIEW_CAPABILITY["constructor"]`
 * returns a function from the prototype chain, which is truthy, so a `subject_type` of
 * `"constructor"`, `"__proto__"` or `"toString"` would otherwise leak that inherited member
 * instead of failing closed (see the same idiom at `lib/status-labels.ts:326-336`).
 */
export function subjectViewCapability(subjectType: string): Capability | null {
  const table: Record<string, Capability> = AGENT_SUBJECT_VIEW_CAPABILITY;
  return Object.hasOwn(table, subjectType) ? table[subjectType] : null;
}

/**
 * True only when the actor holds the capability entitling them to this row's content. "Input"
 * here means both fields the caller gates on it — `input_data` and `output_summary` alike, per
 * `agent-workspaces.ts`'s `loadAgentHistoryPage` — not `input_data` alone; the name stays
 * `canReadAgentRunInput` for the one capability check both fields share.
 *
 * Fails closed twice over: an unmapped subject type has no capability to hold, and a
 * capability absent from the access map reads as `undefined`, which is not `true`.
 */
export function canReadAgentRunInput(
  subjectType: string,
  access: Partial<Record<Capability, boolean>>,
): boolean {
  const capability = subjectViewCapability(subjectType);
  return capability !== null && access[capability] === true;
}
