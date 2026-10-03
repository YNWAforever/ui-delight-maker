export type AgentDataFilter = "all" | "demo" | "non-demo" | "unknown";

/** Historical names and model-generated output are not evidence of demo origin. */
export function explicitDemoProvenance(input: unknown): boolean | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const demo = (input as Record<string, unknown>).demo;
  return typeof demo === "boolean" ? demo : null;
}

export function matchesAgentDataFilter(value: boolean | null | undefined, filter: AgentDataFilter) {
  if (filter === "all") return true;
  if (filter === "unknown") return value == null;
  return filter === "demo" ? value === true : value === false;
}
