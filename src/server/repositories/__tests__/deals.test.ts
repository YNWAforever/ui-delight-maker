import { beforeEach, describe, expect, it, vi } from "vitest";
const transport = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/server/db/neon.server", () => ({
  query: transport.query,
  queryOne: async (sql: string, values: readonly unknown[]) =>
    (await transport.query(sql, values))[0] ?? null,
  transaction: vi.fn(),
}));
import { getDealWorkspace } from "../deals";
describe("deal workspace read contract", () => {
  beforeEach(() => vi.clearAllMocks());
  it("starts every read concurrently and returns empty related collections", async () => {
    let release: (value: unknown[]) => void = () => undefined;
    const parent = new Promise<unknown[]>((resolve) => {
      release = resolve;
    });
    transport.query.mockImplementation((sql: string) =>
      sql.includes("from deals ") ? parent : Promise.resolve([]),
    );
    const loading = getDealWorkspace("00000000-0000-0000-0000-000000000001");
    expect(transport.query).toHaveBeenCalledTimes(4);
    release([{ id: "deal" }]);
    await expect(loading).resolves.toEqual({
      deal: { id: "deal" },
      engagementEvents: [],
      projects: [],
      tasks: [],
    });
  });
  it("settles every read before reporting the first error in declared order", async () => {
    let release: (value: unknown[]) => void = () => undefined;
    const parent = new Promise<unknown[]>((resolve) => {
      release = resolve;
    });
    transport.query.mockImplementation((sql: string) => {
      if (sql.includes("from deals ")) return parent;
      if (sql.includes("from engagement_events "))
        return Promise.reject(new Error("private event failure"));
      if (sql.includes("from tasks ")) return Promise.reject(new Error("private task failure"));
      return Promise.resolve([]);
    });
    let settled = false;
    const loading = getDealWorkspace("00000000-0000-0000-0000-000000000001").catch((error) => {
      settled = true;
      return error;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);
    release([{ id: "deal" }]);
    const error = await loading;
    expect(error.message).toBe("Could not load this deal's engagement events");
    expect(error.cause.message).toBe("private event failure");
  });
  it("rejects a missing parent rather than returning a fabricated empty workspace", async () => {
    transport.query.mockResolvedValue([]);
    await expect(getDealWorkspace("00000000-0000-0000-0000-000000000001")).rejects.toThrow(
      "Could not load this deal",
    );
  });
});
