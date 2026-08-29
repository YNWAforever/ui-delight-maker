import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentWorkflowType } from "@/lib/agents";

const { mockQuery, mockQueryOne } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockQueryOne: vi.fn(),
}));

vi.mock("@/server/db/neon.server", () => ({
  query: mockQuery,
  queryOne: mockQueryOne,
  transaction: vi.fn(),
}));

const { loadAgentPolicies, setAgentPolicy, listAgentPolicyVersions } =
  await import("../agent-policy");

describe("loadAgentPolicies", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryOne.mockReset();
  });

  it("falls back to the code default for a workflow with no row", async () => {
    // The starting state of every environment. If this is wrong, the whole slice has
    // changed behaviour it was meant to leave alone.
    mockQuery.mockResolvedValue([]);

    const policies = await loadAgentPolicies();

    expect(policies.get("qualify_lead")).toEqual({ status: "active", humanApproval: false });
  });

  it("lets a stored row override the code default", async () => {
    mockQuery.mockResolvedValue([
      { workflow_type: "qualify_lead", status: "inactive", human_approval: true },
    ]);

    const policies = await loadAgentPolicies();

    expect(policies.get("qualify_lead")).toEqual({ status: "inactive", humanApproval: true });
  });

  it("ignores a row for a workflow the catalogue no longer has", async () => {
    // A renamed or removed agent must not break dispatch for every other one. A constraint
    // cannot prevent this, because the catalogue is code rather than a table.
    mockQuery.mockResolvedValue([
      { workflow_type: "deleted_workflow", status: "inactive", human_approval: true },
    ]);

    const policies = await loadAgentPolicies();

    expect(policies.has("deleted_workflow" as AgentWorkflowType)).toBe(false);
    expect(policies.get("qualify_lead")).toEqual({ status: "active", humanApproval: false });
  });

  it("issues exactly one query", async () => {
    // Dispatch calls this. One query per dispatch is the budget; a per-agent fan-out
    // would be five.
    mockQuery.mockResolvedValue([]);
    await loadAgentPolicies();
    expect(mockQuery).toHaveBeenCalledOnce();
  });

  it("breaks a same-created_at tie by the higher version_seq, not plan order", async () => {
    // Two rows for one workflow can share a created_at: Postgres's now() is transaction-start
    // time, so two policy changes written in a single transaction get an identical timestamp.
    // version_seq — a generated identity column, strictly increasing per insert — is the only
    // thing that then says which of the tied rows is actually newer; without it in the order
    // by, distinct on would pick between them by plan order instead of insertion order.
    //
    // query() is mocked, so this test cannot make Postgres itself run distinct on the way the
    // schema integration test (clientops-schema.integration.test.ts) does against a real
    // database. What it CAN and must pin, from here, is that the SQL this function sends
    // actually asks for that resolution: created_at desc as the real precedence, version_seq
    // desc only to break a tie on it. A fixture-data assertion would pass no matter what this
    // string says — the mock returns whatever it is told to regardless of the query text — so
    // asserting on the SQL itself is the only check in this file that can go red when the
    // tiebreak is silently dropped.
    mockQuery.mockResolvedValue([]);

    await loadAgentPolicies();

    const [sql] = mockQuery.mock.calls[0] as [string];
    expect(sql).toContain("order by workflow_type, created_at desc, version_seq desc");
  });
});

describe("setAgentPolicy", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryOne.mockReset();
  });

  it("appends a version rather than updating", async () => {
    mockQueryOne.mockResolvedValue({ id: "v1" });

    await setAgentPolicy({
      workflowType: "qualify_lead",
      status: "inactive",
      humanApproval: false,
      reason: "vendor review",
      changedBy: "profile-1",
    });

    const [sql] = mockQueryOne.mock.calls[0];
    expect(String(sql)).toContain("insert into agent_policy_versions");
    // Append-only: a mistaken change is corrected by a new version, and the mistake stays
    // visible. An update or delete would erase the record this table exists to keep.
    expect(String(sql)).not.toContain("update ");
    expect(String(sql)).not.toContain("delete ");
  });

  it("rejects a workflow the catalogue does not have", async () => {
    // Accepting one would deliberately create the stale row loadAgentPolicies has to ignore
    // on every read.
    await expect(
      setAgentPolicy({
        workflowType: "not_a_workflow" as never,
        status: "inactive",
        humanApproval: false,
        changedBy: "profile-1",
      }),
    ).rejects.toThrow();
    expect(mockQueryOne).not.toHaveBeenCalled();
  });
});

describe("listAgentPolicyVersions", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns one workflow's versions newest first", async () => {
    mockQuery.mockResolvedValue([]);

    await listAgentPolicyVersions("qualify_lead");

    const [sql, values] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain("from agent_policy_versions");
    expect(String(sql)).toContain("where v.workflow_type = $1");
    // Same ordering as loadAgentPolicies, for the same reason: rows written in one transaction
    // share a created_at, and version_seq resolves that to true insertion order.
    expect(String(sql)).toContain("order by v.created_at desc, v.version_seq desc");
    expect(values).toEqual(["qualify_lead"]);
  });

  it("rejects a workflow the catalogue does not have", async () => {
    // Symmetry with setAgentPolicy, which refuses to write one. A caller passing an unknown
    // workflow has a bug, and returning an empty list would hide it.
    await expect(listAgentPolicyVersions("not_a_workflow" as never)).rejects.toThrow();
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
