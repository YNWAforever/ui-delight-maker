import { beforeEach, describe, expect, it, vi } from "vitest";
import { AGENT_SUBJECT_VIEW_CAPABILITIES } from "@/lib/agent-run-visibility";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  requireCapability: vi.fn(),
  requireCapabilityChecks: vi.fn(),
  requireCapabilitySet: vi.fn(),
  requirePageAuthorization: vi.fn(),
  loadRequestAuthorization: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (data: unknown) => data;
    const chain = {
      validator(validator: (data: unknown) => unknown) {
        validate = validator;
        return chain;
      },
      handler<T extends ({ data }: { data: never }) => unknown>(handler: T) {
        return ({ data }: { data?: unknown } = {}) => handler({ data: validate(data) } as never);
      },
    };
    return chain;
  },
}));

vi.mock("@/server/auth/authorization.server", () => ({
  requireCapability: mocks.requireCapability,
  requireCapabilityChecks: mocks.requireCapabilityChecks,
  requireCapabilitySet: mocks.requireCapabilitySet,
  requirePageAuthorization: mocks.requirePageAuthorization,
  loadRequestAuthorization: mocks.loadRequestAuthorization,
}));

vi.mock("@/lib/auth/neon-auth.server", () => ({
  requireNeonAuthSession: vi.fn(),
}));

vi.mock("@/server/db/neon.server", () => ({ query: mocks.query }));

vi.mock("@/server/repositories/activity-logs", () => ({ listActivityLogs: vi.fn() }));
vi.mock("@/server/repositories/agent-runs", () => ({
  getAgentRunWithCalls: vi.fn(),
  listAgentRuns: vi.fn(),
}));

const loadModule = () => import("../agent-runs");

/** A no-op `RowAuthorizer` stub — these tests assert on `access` and query shape, not on any
 * particular row-level verdict. */
const stubRowAuthorizer = { allow: vi.fn().mockResolvedValue(new Map()) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCapability.mockResolvedValue({ profile: { id: "user-1" } });
  mocks.requireCapabilityChecks.mockResolvedValue({ profile: { id: "user-1" } });
  mocks.requireCapabilitySet.mockResolvedValue({ "agents.view": true, "leads.view": true });
  mocks.requirePageAuthorization.mockResolvedValue({
    access: { "agents.view": true, "leads.view": true },
    rows: stubRowAuthorizer,
  });
  mocks.query.mockResolvedValue([]);
  mocks.loadRequestAuthorization.mockResolvedValue({
    actor: {
      profileId: "user-1",
      role: "manager",
      status: "active",
      directReportIds: [],
      managedTeamIds: [],
      managedDepartmentIds: [],
    },
    overrides: [],
    now: new Date(),
  });
});

describe("agent operational read models", () => {
  it("explicitly maps legacy callers and refuses unknown workflows before any read", async () => {
    const { normalizeAgentHistoryInput, getAgentHistoryPage } = await loadModule();
    expect(normalizeAgentHistoryInput({ agent: "Quotation Agent" })).toEqual({
      workflowType: "draft_quote",
      page: 1,
      limit: 25,
    });
    expect(() =>
      normalizeAgentHistoryInput({ workflowType: "unknown_workflow", agent: "Quote Draft Agent" }),
    ).toThrow("Known workflow type is required");
    expect(() => getAgentHistoryPage({ data: { agent: "Invented Agent" } })).toThrow(
      "Known workflow type is required",
    );
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("normalizes agent history pagination to a maximum of 25 rows", async () => {
    const { normalizeAgentHistoryInput } = await loadModule();

    expect(
      normalizeAgentHistoryInput({ agent: "  Qualification Agent  ", page: -4, limit: 99 }),
    ).toEqual({
      workflowType: "qualify_lead",
      page: 1,
      limit: 25,
    });
  });

  it("authorizes and reads one bounded agent history page", async () => {
    const { getAgentHistoryPage } = await loadModule();
    mocks.query
      .mockResolvedValueOnce([{ total: 51 }])
      .mockResolvedValueOnce([{ id: "run-26", input_data: {}, output_data: {} }]);

    const result = await getAgentHistoryPage({
      data: { agent: "Qualification Agent", page: 2, limit: 100 },
    });

    // agents.view stays required and still throws on denial; the subject capabilities are
    // requested as optional so the read model can redact per row without a second load.
    expect(mocks.requirePageAuthorization).toHaveBeenCalledWith(["agents.view"], {
      optional: AGENT_SUBJECT_VIEW_CAPABILITIES,
      context: await mocks.loadRequestAuthorization.mock.results[0].value,
      cacheRowOwners: true,
    });
    expect(mocks.loadRequestAuthorization).toHaveBeenCalledTimes(1);
    expect(mocks.query).toHaveBeenNthCalledWith(1, expect.stringContaining("count(*)"), [
      "qualify_lead",
    ]);
    expect(mocks.query).toHaveBeenNthCalledWith(2, expect.stringContaining("limit $2 offset $3"), [
      "qualify_lead",
      25,
      25,
    ]);
    expect(result).toMatchObject({ page: 2, limit: 25, total: 51 });
  });

  it("clamps an out-of-range history page before querying its rows", async () => {
    const { getAgentHistoryPage } = await loadModule();
    mocks.query
      .mockResolvedValueOnce([{ total: 51 }])
      .mockResolvedValueOnce([{ id: "run-51", input_data: {}, output_data: {} }])
      .mockResolvedValueOnce([{ runs_24h: 2, avg_confidence: 0.8 }]);

    const result = await getAgentHistoryPage({
      data: { agent: "Qualification Agent", page: 999, limit: 25 },
    });

    expect(mocks.query).toHaveBeenNthCalledWith(2, expect.stringContaining("limit $2 offset $3"), [
      "qualify_lead",
      25,
      50,
    ]);
    expect(result).toMatchObject({ page: 3, limit: 25, total: 51 });
  });

  it("requires approval and agent visibility for the single AI review read", async () => {
    const { getAiReviewRead } = await loadModule();
    mocks.query
      .mockResolvedValueOnce([{ count: "1" }])
      .mockResolvedValueOnce([{ id: "approval-1", agent_run_id: "run-1", context_data: {} }])
      .mockResolvedValueOnce([{ id: "run-1", confidence_score: 0.42 }]);

    const result = await getAiReviewRead({});

    // approvals.view and agents.view both stay required and still throw on denial exactly as
    // the requireCapabilityChecks pair they replaced; the subject capabilities are requested as
    // optional so the read model can redact each run's content per row without a second load.
    expect(mocks.requirePageAuthorization).toHaveBeenCalledWith(["approvals.view", "agents.view"], {
      optional: AGENT_SUBJECT_VIEW_CAPABILITIES,
      context: expect.any(Object),
      cacheRowOwners: true,
    });
    expect(mocks.requirePageAuthorization.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.query.mock.invocationCallOrder[0],
    );
    expect(result).toMatchObject({
      approvals: [{ id: "approval-1" }],
      humanReviewRuns: [{ id: "run-1", confidence_score: 0.42 }],
      pagination: { totalMatching: 1, limit: 25 },
    });
    expect(mocks.query).toHaveBeenCalledTimes(3);
  });
  it("deep link counts and loads the exact workflow run rather than the latest page", async () => {
    const { getAgentHistoryPage } = await loadModule();
    const runId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    mocks.query
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([{ id: runId, input_data: {}, output_data: {} }])
      .mockResolvedValueOnce([{ runs_24h: 2, avg_confidence: 0.8 }]);
    const result = await getAgentHistoryPage({
      data: { workflowType: "qualify_lead", runId, page: 1, limit: 25 },
    });
    expect(mocks.query).toHaveBeenNthCalledWith(1, expect.stringContaining("id=$2::uuid"), [
      "qualify_lead",
      runId,
    ]);
    expect(mocks.query).toHaveBeenNthCalledWith(2, expect.stringContaining("id=$4::uuid"), [
      "qualify_lead",
      25,
      0,
      runId,
    ]);
    expect(result.items[0].id).toBe(runId);
  });
});
