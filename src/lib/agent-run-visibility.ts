import type { Capability } from "@/lib/admin/types";
import type { RowAuthorizer } from "@/server/auth/authorization.server";

/**
 * What a reader needs in order to see an agent run's content, keyed on the run's
 * `subject_type`: the capability that entitles them, and the resource type ownership is
 * resolved under.
 *
 * Seven of the eight `resourceType` values are the subject type unchanged. **`approval` is
 * not** — its ownership key is `human_approval`, because that is the key in
 * `NEON_OWNERSHIP_QUERIES`. Passing `approval` through resolves no owner, which denies every
 * manager on every approval-subject run and makes a resource-scoped deny override never
 * match. A derivation would get this wrong silently, which is why both fields are literal.
 *
 * The `capability` column carries the same literal table that used to stand alone as
 * `AGENT_SUBJECT_VIEW_CAPABILITY` (below) — see that export's history for why it is an
 * explicit literal rather than a derived `${subject_type}s.view`: there is no `clients.view`
 * capability, and `task`/`approval` are deliberately mapped to their view capabilities rather
 * than the write capabilities nearest their call sites.
 */
export const AGENT_SUBJECT_VISIBILITY = {
  lead: { capability: "leads.view", resourceType: "lead" },
  account: { capability: "accounts.view", resourceType: "account" },
  client: { capability: "accounts.view", resourceType: "client" },
  campaign: { capability: "campaigns.view", resourceType: "campaign" },
  quote: { capability: "quotes.view", resourceType: "quote" },
  engagement: { capability: "engagements.view", resourceType: "engagement" },
  task: { capability: "tasks.view", resourceType: "task" },
  approval: { capability: "approvals.view", resourceType: "human_approval" },
} as const satisfies Record<string, { capability: Capability; resourceType: string }>;

/**
 * Which capability entitles a reader to an agent run's content — `input_data` and
 * `output_summary` alike — keyed on the run's `subject_type`.
 *
 * Derived from `AGENT_SUBJECT_VISIBILITY` above so the two never drift; kept as its own export
 * because `agent-workspaces.ts` and the tests already read it as a flat subject-type ->
 * capability map, independent of the ownership-resolution column added alongside it.
 */
export const AGENT_SUBJECT_VIEW_CAPABILITY: Record<
  keyof typeof AGENT_SUBJECT_VISIBILITY,
  Capability
> = Object.fromEntries(
  Object.entries(AGENT_SUBJECT_VISIBILITY).map(([subjectType, entry]) => [
    subjectType,
    entry.capability,
  ]),
) as Record<keyof typeof AGENT_SUBJECT_VISIBILITY, Capability>;

/**
 * The distinct capabilities above, for `requireCapabilitySet`'s `optional` list.
 *
 * Deduplicated because `account` and `client` share `accounts.view`, and asking for the same
 * capability twice would evaluate it twice for no gain.
 */
export const AGENT_SUBJECT_VIEW_CAPABILITIES: readonly Capability[] = [
  ...new Set(Object.values(AGENT_SUBJECT_VISIBILITY).map((entry) => entry.capability)),
];

/**
 * `null` for a subject type the table does not name.
 *
 * Callers must treat `null` as "not entitled". `AgentRun.subject_type` is typed `string`
 * (`lib/types.ts:409`), not the four-value union, so a value outside this table is reachable
 * at runtime and the compiler will not flag its absence.
 *
 * `Object.hasOwn` rather than a bare index read: `AGENT_SUBJECT_VISIBILITY["constructor"]`
 * returns a function from the prototype chain, which is truthy, so a `subject_type` of
 * `"constructor"`, `"__proto__"` or `"toString"` would otherwise leak that inherited member
 * instead of failing closed (see the same idiom at `lib/status-labels.ts:326-336`).
 */
export function subjectViewCapability(subjectType: string): Capability | null {
  return Object.hasOwn(AGENT_SUBJECT_VISIBILITY, subjectType)
    ? AGENT_SUBJECT_VISIBILITY[subjectType as keyof typeof AGENT_SUBJECT_VISIBILITY].capability
    : null;
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

/**
 * Decides a page of agent-run subjects, one ownership query per distinct subject type.
 *
 * Returns a lookup rather than a map because two runs about the same subject share one
 * decision, and callers key rows by their own id, not the subject's.
 *
 * A subject type the table does not name is refused — the same fail-closed default
 * `canReadAgentRunInput` has, for the same reason.
 */
export async function decideAgentSubjects(
  rows: RowAuthorizer,
  subjects: readonly { subject_type: string; subject_id: string }[],
): Promise<(subjectType: string, subjectId: string) => boolean> {
  const byType = new Map<string, Set<string>>();
  for (const { subject_type, subject_id } of subjects) {
    if (!Object.hasOwn(AGENT_SUBJECT_VISIBILITY, subject_type)) continue;
    if (!subject_id) continue;
    const ids = byType.get(subject_type) ?? new Set<string>();
    ids.add(subject_id);
    byType.set(subject_type, ids);
  }

  const decided = new Map<string, boolean>();
  for (const [subjectType, ids] of byType) {
    const entry = AGENT_SUBJECT_VISIBILITY[subjectType as keyof typeof AGENT_SUBJECT_VISIBILITY];
    const verdicts = await rows.allow(entry.capability, entry.resourceType, [...ids]);
    for (const [id, allowed] of verdicts) decided.set(`${subjectType}:${id}`, allowed);
  }

  return (subjectType, subjectId) => decided.get(`${subjectType}:${subjectId}`) ?? false;
}
