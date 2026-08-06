import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The deals repository, and specifically the behaviours that a seam is most likely to lose.
 *
 * These five functions were inline in `src/server-functions/deals.ts` with no coverage at any
 * layer, so nothing recorded that the workspace read runs its four queries concurrently, that it
 * checks their errors only afterwards, or that the update writes a fixed column list rather than
 * whatever the client sent. Each of those is invisible in a diff and load-bearing at runtime.
 */
const mocks = vi.hoisted(() => ({ createSupabaseServerClient: vi.fn() }));

vi.mock("@/legacy-supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

import {
  createDeal,
  getDealWorkspace,
  listDeals,
  listOpenDeals,
  updateDeal,
} from "@/server/repositories/deals";

type TableResult = { data?: unknown; error?: { message: string } | null; delayMs?: number };

/**
 * A Supabase double that records the query each call built.
 *
 * Every builder method returns the same object and appends to `calls`, so a test can assert the
 * filters, ordering and limits a function applied without standing up PostgREST. `await`ing the
 * builder resolves the configured result for that table.
 */
function stubSupabase(results: Record<string, TableResult>) {
  const calls: Array<{ table: string; ops: string[]; payload?: unknown }> = [];
  const started: string[] = [];
  const settled: string[] = [];

  const from = vi.fn((table: string) => {
    const record = { table, ops: [] as string[], payload: undefined as unknown };
    calls.push(record);

    const result = results[table] ?? { data: [], error: null };
    const resolve = async () => {
      started.push(table);
      if (result.delayMs) await new Promise((r) => setTimeout(r, result.delayMs));
      settled.push(table);
      return { data: result.data ?? null, error: result.error ?? null };
    };

    const builder: Record<string, unknown> = {
      then: (onFulfilled: (value: unknown) => unknown, onRejected?: (r: unknown) => unknown) =>
        resolve().then(onFulfilled, onRejected),
    };
    for (const op of ["select", "eq", "order", "limit", "lte", "insert", "update", "single"]) {
      builder[op] = vi.fn((...args: unknown[]) => {
        record.ops.push(`${op}(${args.map((a) => JSON.stringify(a)).join(",")})`);
        if (op === "insert" || op === "update") record.payload = args[0];
        return builder;
      });
    }
    return builder;
  });

  mocks.createSupabaseServerClient.mockReturnValue({ from });
  return { calls, started, settled, from };
}

const callFor = (calls: ReturnType<typeof stubSupabase>["calls"], table: string) =>
  calls.find((call) => call.table === table)!;

describe("deals repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listDeals", () => {
    it("orders newest first and applies only the filters that were supplied", () => {
      const { calls } = stubSupabase({ deals: { data: [] } });

      return listDeals({ status: "open", owner: "user-1" }).then(() => {
        const ops = callFor(calls, "deals").ops.join(" ");
        expect(ops).toContain('order("created_at",{"ascending":false})');
        expect(ops).toContain('eq("status","open")');
        expect(ops).toContain('eq("owner","user-1")');
        // An absent filter must not become a filter on undefined, which would match nothing.
        expect(ops).not.toContain("stage");
        expect(ops).not.toContain("account_id");
      });
    });

    it("keeps the driver's message off the error and on its cause", async () => {
      // PostgREST names the table and column it failed on. That belongs in a server log, not in
      // a response body — the same split `resource-ownership.ts` makes.
      stubSupabase({ deals: { error: { message: "permission denied for table deals" } } });

      await expect(listDeals()).rejects.toThrow("Could not load deals");
      await expect(listDeals()).rejects.not.toThrow("permission denied");
      await listDeals().catch((error: Error) => {
        expect((error.cause as Error).message).toBe("permission denied for table deals");
      });
    });
  });

  describe("getDealWorkspace", () => {
    it("reads the deal, its events, projects and tasks concurrently", async () => {
      // Sequenced awaits would make the slow first query finish before the others start. The
      // handler this replaced used Promise.all, and four serial round trips to Supabase is a
      // user-visible difference on a detail page.
      const { started, settled } = stubSupabase({
        deals: { data: { id: "deal-1" }, delayMs: 20 },
        engagement_events: { data: [] },
        projects: { data: [] },
        tasks: { data: [] },
      });

      await getDealWorkspace("deal-1");

      expect(started).toEqual(["deals", "engagement_events", "projects", "tasks"]);
      // The slow one settles last despite being issued first — proof they overlapped.
      expect(settled[settled.length - 1]).toBe("deals");
    });

    it("issues every query even when the first one fails", async () => {
      const { started } = stubSupabase({
        deals: { error: { message: "deal read failed" } },
        engagement_events: { data: [] },
        projects: { data: [] },
        tasks: { data: [] },
      });

      await expect(getDealWorkspace("deal-1")).rejects.toThrow("Could not load this deal");
      expect(started).toHaveLength(4);
    });

    it("reports the first failing read in a fixed order, not whichever failed first", async () => {
      // Errors are checked deal -> events -> projects -> tasks after all four settle, so a run
      // where the tasks read fails fastest still reports the events failure.
      stubSupabase({
        deals: { data: { id: "deal-1" }, delayMs: 10 },
        engagement_events: { error: { message: "events failed" }, delayMs: 10 },
        projects: { data: [] },
        tasks: { error: { message: "tasks failed" } },
      });

      await expect(getDealWorkspace("deal-1")).rejects.toThrow(
        "Could not load this deal's engagement events",
      );
    });

    it("caps the event history and returns empty arrays rather than null", async () => {
      const { calls } = stubSupabase({
        deals: { data: { id: "deal-1" } },
        engagement_events: { data: null },
        projects: { data: null },
        tasks: { data: null },
      });

      await expect(getDealWorkspace("deal-1")).resolves.toEqual({
        deal: { id: "deal-1" },
        engagementEvents: [],
        projects: [],
        tasks: [],
      });

      const ops = callFor(calls, "engagement_events").ops.join(" ");
      expect(ops).toContain('order("occurred_at",{"ascending":false})');
      expect(ops).toContain("limit(50)");
    });
  });

  describe("updateDeal", () => {
    it("writes only the named columns that were provided", async () => {
      const { calls } = stubSupabase({ deals: { data: { id: "deal-1" } } });

      await updateDeal("deal-1", { stage: "negotiation", value: 50000 });

      expect(callFor(calls, "deals").payload).toEqual({ stage: "negotiation", value: 50000 });
    });

    it("ignores fields outside the allowlist, which is the mass-assignment guard", async () => {
      // `updates` reaches this through a `data as Partial<Deal>` cast that validates nothing, so
      // a caller can put anything in it.
      const { calls } = stubSupabase({ deals: { data: { id: "deal-1" } } });

      await updateDeal("deal-1", {
        stage: "won",
        id: "some-other-deal",
        created_at: "1999-01-01T00:00:00.000Z",
        is_admin: true,
      } as never);

      expect(callFor(calls, "deals").payload).toEqual({ stage: "won" });
    });

    it("distinguishes clearing a field from omitting it", async () => {
      // `null` is a write; `undefined` is a no-op. Collapsing the two would silently wipe a column
      // on any partial update.
      const { calls } = stubSupabase({ deals: { data: { id: "deal-1" } } });

      await updateDeal("deal-1", { owner: null, account_id: undefined });

      expect(callFor(calls, "deals").payload).toEqual({ owner: null });
    });
  });

  describe("listOpenDeals", () => {
    it("restricts to open deals and applies the close-before bound as an upper bound", async () => {
      const { calls } = stubSupabase({ deals: { data: [] } });

      await listOpenDeals({ owner: "user-1", close_before: "2026-12-31" });

      const ops = callFor(calls, "deals").ops.join(" ");
      expect(ops).toContain('eq("status","open")');
      expect(ops).toContain('eq("owner","user-1")');
      expect(ops).toContain('lte("expected_close_date","2026-12-31")');
    });

    it("returns an empty list rather than null when there are no open deals", async () => {
      stubSupabase({ deals: { data: null } });

      await expect(listOpenDeals()).resolves.toEqual([]);
    });
  });

  describe("createDeal", () => {
    it("inserts the input and returns the created row", async () => {
      const { calls } = stubSupabase({ deals: { data: { id: "deal-1", name: "Renewal" } } });

      await expect(createDeal({ name: "Renewal" })).resolves.toEqual({
        id: "deal-1",
        name: "Renewal",
      });
      expect(callFor(calls, "deals").payload).toEqual({ name: "Renewal" });
    });

    it("drops fields outside the allowlist, as the update path already did", async () => {
      // The validator is a bare cast, so the insert used to forward whatever arrived over the
      // wire — including columns a caller has no business setting.
      const { calls } = stubSupabase({ deals: { data: { id: "deal-1" } } });

      await createDeal({
        name: "Renewal",
        id: "chosen-by-the-caller",
        created_at: "1999-01-01T00:00:00.000Z",
        is_admin: true,
      } as never);

      expect(callFor(calls, "deals").payload).toEqual({ name: "Renewal" });
    });

    it("keeps the driver's message off a failed create", async () => {
      stubSupabase({ deals: { error: { message: 'null value in column "name" violates...' } } });

      await expect(createDeal({ name: "Renewal" })).rejects.toThrow("Could not create this deal");
      await expect(createDeal({ name: "Renewal" })).rejects.not.toThrow("violates");
    });
  });
});
