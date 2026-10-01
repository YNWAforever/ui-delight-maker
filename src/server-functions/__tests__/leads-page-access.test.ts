import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ load: vi.fn(), require: vi.fn(), page: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (data: unknown) => data;
    const chain = {
      validator(next: (data: unknown) => unknown) {
        validate = next;
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
  loadRequestAuthorization: mocks.load,
  requireCapability: mocks.require,
}));
vi.mock("@/lib/auth/neon-auth.server", () => ({ requireNeonAuthSession: vi.fn() }));
vi.mock("@/server/repositories/leads", () => ({
  listLeadsPage: mocks.page,
  listLeads: vi.fn(),
  createLead: vi.fn(),
  updateLead: vi.fn(),
  getLeadWithActivity: vi.fn(),
  moveLeadStage: vi.fn(),
  convertWonLeadToEngagement: vi.fn(),
}));
vi.mock("@/server/repositories/agent-policy", () => ({ loadAgentPolicies: vi.fn() }));
vi.mock("@/server/repositories/agent-runs", () => ({
  createAgentRun: vi.fn(),
  findActiveRun: vi.fn(),
  updateAgentRunResult: vi.fn(),
}));

import { getLeadsPage } from "../leads";
const actor = {
  profileId: "viewer",
  role: "manager",
  status: "active",
  managedDepartmentIds: [],
  managedTeamIds: [],
  directReportIds: ["report"],
};
const now = new Date("2026-10-01T00:00:00Z");
const deny = {
  profileId: "viewer",
  capability: "leads.update",
  effect: "deny",
  resourceType: "lead",
  resourceId: "l1",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.require.mockResolvedValue({});
  mocks.page.mockResolvedValue({
    items: [
      { id: "l1", assigned_to: "report" },
      { id: "l2", assigned_to: "outside" },
      { id: "l3", assigned_to: null },
    ],
    total: 3,
    page: 1,
    limit: 50,
  });
});
async function read(role = "manager", overrides: unknown[] = [], status = "active") {
  mocks.load.mockResolvedValue({ actor: { ...actor, role, status }, overrides, now });
  return getLeadsPage({ data: {} });
}
describe("Lead page effective write affordances", () => {
  it("uses owner scope and loads authorization and the page only once", async () => {
    const page = await read();
    expect(page.items.map((row) => row.can_update)).toEqual([true, false, false]);
    expect(page.can_create).toBe(true);
    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(mocks.page).toHaveBeenCalledTimes(1);
    expect(mocks.require).toHaveBeenCalledWith(
      "leads.view",
      {},
      await mocks.load.mock.results[0].value,
    );
  });
  it.each(["sales", "admin", "super_admin"])("%s retains its existing writes", async (role) => {
    const page = await read(role);
    expect(page.items.map((row) => row.can_update)).toEqual([true, true, true]);
    expect(page.can_create).toBe(true);
  });
  it.each(["client_success", "accounting", "read_only"])(
    "%s has no default Lead writes",
    async (role) => {
      const page = await read(role);
      expect(page.items.map((row) => row.can_update)).toEqual([false, false, false]);
      expect(page.can_create).toBe(false);
    },
  );
  it("honours scoped allow, deny, expiry, create deny and inactive actors", async () => {
    expect(
      (await read("read_only", [{ ...deny, effect: "allow" }])).items.map((row) => row.can_update),
    ).toEqual([true, false, false]);
    expect((await read("super_admin", [deny])).items.map((row) => row.can_update)).toEqual([
      false,
      true,
      true,
    ]);
    expect(
      (await read("manager", [{ ...deny, expiresAt: "2026-09-30T00:00:00Z" }])).items.map(
        (row) => row.can_update,
      ),
    ).toEqual([true, false, false]);
    expect(
      (await read("sales", [{ profileId: "viewer", capability: "leads.create", effect: "deny" }]))
        .can_create,
    ).toBe(false);
    const inactive = await read("super_admin", [], "suspended");
    expect(inactive.items.map((row) => row.can_update)).toEqual([false, false, false]);
    expect(inactive.can_create).toBe(false);
  });
  it("does not query the page after a read denial", async () => {
    mocks.require.mockRejectedValueOnce(new Error("FORBIDDEN"));
    await expect(read()).rejects.toThrow("FORBIDDEN");
    expect(mocks.page).not.toHaveBeenCalled();
  });
});
