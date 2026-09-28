import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const chain = {
    validator() {
      return chain;
    },
    handler<T extends (...args: never[]) => unknown>(handler: T) {
      return handler;
    },
  };
  return {
    chain,
    requireCapability: vi.fn(),
    loadRequestAuthorization: vi.fn(),
    requireSession: vi.fn(),
    listJobSheetsPage: vi.fn(),
  };
});

vi.mock("@tanstack/react-start", () => ({ createServerFn: () => mocks.chain }));
vi.mock("@/server/auth/authorization.server", () => ({
  requireCapability: mocks.requireCapability,
  loadRequestAuthorization: mocks.loadRequestAuthorization,
}));
vi.mock("@/lib/auth/neon-auth.server", () => ({ requireNeonAuthSession: mocks.requireSession }));
vi.mock("@/server/repositories/job-sheets", () => ({
  acceptJobSheet: vi.fn(),
  getJobSheet: vi.fn(),
  listJobSheets: vi.fn(),
  listJobSheetsPage: mocks.listJobSheetsPage,
  replaceJobSheetPortions: vi.fn(),
  updateJobSheetXeroReference: vi.fn(),
}));

const loadPage = async () => (await import("../job-sheets")).getJobSheetsPage;
const data = { status: "accounting_review", page: 2, limit: 25 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadRequestAuthorization
    .mockReset()
    .mockResolvedValue({ actor: { profileId: "user-1" }, overrides: [] });
  mocks.requireSession.mockResolvedValue({
    user: { id: "user-1" },
    profile: { id: "user-1", role: "sales", status: "active" },
    session: {},
  });
  mocks.listJobSheetsPage.mockResolvedValue({ items: [], total: 0, page: 2, limit: 25 });
});

describe("paginated job-sheet server function", () => {
  it("authorizes and forwards pagination inputs", async () => {
    const getPage = await loadPage();
    await getPage({ data });
    expect(mocks.requireCapability).toHaveBeenCalledWith("job_sheets.view", {}, expect.anything());
    expect(mocks.loadRequestAuthorization).toHaveBeenCalledOnce();
    expect(mocks.listJobSheetsPage).toHaveBeenCalledWith(data, expect.anything());
    expect(mocks.loadRequestAuthorization.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.listJobSheetsPage.mock.invocationCallOrder[0],
    );
  });

  it("does not query when session validation fails", async () => {
    mocks.loadRequestAuthorization.mockRejectedValueOnce(new Error("Unauthorized"));
    const getPage = await loadPage();
    await expect(getPage({ data })).rejects.toThrow("Unauthorized");
    expect(mocks.listJobSheetsPage).not.toHaveBeenCalled();
  });
});
