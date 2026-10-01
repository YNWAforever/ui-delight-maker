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
vi.mock("@/server/repositories/job-sheets", () => ({
  listJobSheetsPage: mocks.page,
  listJobSheets: vi.fn(),
  getJobSheet: vi.fn(),
  acceptJobSheet: vi.fn(),
  replaceJobSheetPortions: vi.fn(),
  updateJobSheetHeader: vi.fn(),
}));
import { getJobSheetsPage } from "../job-sheets";

const now = new Date("2026-10-01T00:00:00Z");
const actor = {
  profileId: "viewer",
  role: "accounting",
  status: "active",
  managedDepartmentIds: [],
  managedTeamIds: [],
  directReportIds: [],
};
const scoped = {
  profileId: "viewer",
  capability: "job_sheets.update_billing",
  effect: "allow",
  resourceType: "job_sheet",
  resourceId: "js-1",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.require.mockResolvedValue({});
  mocks.page.mockResolvedValue({
    items: [
      { id: "js-1", status: "accounting_review", locked_at: null, accounting_owner: "owner" },
      { id: "js-2", status: "accounting_review", locked_at: null, accounting_owner: null },
    ],
    total: 2,
    page: 1,
    limit: 50,
  });
});
async function read(role = "accounting", overrides: unknown[] = [], status = "active") {
  mocks.load.mockResolvedValue({ actor: { ...actor, role, status }, overrides, now });
  return getJobSheetsPage({ data: {} });
}
describe("Job Sheet page effective owner assignment", () => {
  it.each([
    "super_admin",
    "admin",
    "manager",
    "sales",
    "client_success",
    "accounting",
    "read_only",
  ])("%s keeps its existing assignment grant", async (role) => {
    const page = await read(role),
      allowed = ["super_admin", "admin", "accounting"].includes(role);
    expect(page.items.map((row) => row.can_assign_owner)).toEqual([allowed, allowed]);
    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(mocks.page).toHaveBeenCalledTimes(1);
    expect(mocks.require).toHaveBeenCalledWith(
      "job_sheets.view",
      {},
      await mocks.load.mock.results[0].value,
    );
  });
  it("applies scoped allow, explicit deny, expiry and inactive actor rules", async () => {
    expect((await read("read_only", [scoped])).items.map((row) => row.can_assign_owner)).toEqual([
      true,
      false,
    ]);
    expect(
      (await read("super_admin", [{ ...scoped, effect: "deny" }])).items.map(
        (row) => row.can_assign_owner,
      ),
    ).toEqual([false, true]);
    expect(
      (await read("read_only", [{ ...scoped, expiresAt: "2026-09-30T00:00:00Z" }])).items.map(
        (row) => row.can_assign_owner,
      ),
    ).toEqual([false, false]);
    expect(
      (await read("super_admin", [], "suspended")).items.map((row) => row.can_assign_owner),
    ).toEqual([false, false]);
  });
  it("does not offer assignment outside accounting review or when commercially locked", async () => {
    mocks.page.mockResolvedValue({
      items: [
        { id: "js-1", status: "accepted", locked_at: null },
        { id: "js-2", status: "accounting_review", locked_at: now.toISOString() },
        { id: "js-3", status: "cancelled", locked_at: null },
      ],
      total: 3,
      page: 1,
      limit: 50,
    });
    expect((await read()).items.map((row) => row.can_assign_owner)).toEqual([false, false, false]);
  });
  it("does not query the page after a read denial", async () => {
    mocks.require.mockRejectedValueOnce(new Error("FORBIDDEN"));
    await expect(read()).rejects.toThrow("FORBIDDEN");
    expect(mocks.page).not.toHaveBeenCalled();
  });
});
