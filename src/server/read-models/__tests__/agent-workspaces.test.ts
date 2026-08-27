import { beforeEach, describe, expect, it, vi } from "vitest";

import { AGENT_DEFINITIONS, AGENT_RUN_STUCK_MINUTES } from "@/lib/agents";

/**
 * The AI Ops read model.
 *
 * `/agents` used to derive nothing: an enable switch stood in for state the database does
 * not hold, and every number on the page came either from a 24-hour count or from the fifty
 * runs the loader happened to bring back. This read model is what lets the page stop
 * guessing — so the things worth pinning are the ones a future edit would break silently:
 *
 * 1. **Three queries, not six.** The route's budget in `route-loader-contract.ts` is three.
 *    Success rate, current-state counts, stuck detection and "last run" were all added
 *    inside the existing aggregate rather than beside it. A fourth query would pass every
 *    behavioural assertion and quietly halve the page's speed.
 * 2. **No payloads.** `input_data` and `output_data` are unbounded jsonb. The directory
 *    reads neither, and a `select *` creeping into the recent-runs query is exactly how a
 *    50-row list becomes a megabyte.
 * 3. **Totals are not the sum of the cards.** `agent_runs.agent_name` is written by the
 *    dispatch path and the catalogue is code; they have drifted before. The cards can only
 *    show catalogued agents, so the KPI strip folds every row instead.
 */

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock("@/server/db/neon.server", () => ({ query: queryMock }));

const [FIRST_AGENT, SECOND_AGENT] = AGENT_DEFINITIONS;

function aggregateRow(overrides: { agent_name: string } & Record<string, unknown>) {
  return {
    runs_24h: 0,
    completed_24h: 0,
    failed_24h: 0,
    avg_confidence: null,
    waiting_approval: 0,
    running: 0,
    stuck: 0,
    last_run_at: null,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("loadAgentDirectoryRead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("issues three concurrent queries and reads no run payload", async () => {
    const pending = Array.from({ length: 3 }, () => deferred<unknown[]>());
    pending.forEach(({ promise }) => queryMock.mockReturnValueOnce(promise));
    const { loadAgentDirectoryRead } = await import("../agent-workspaces");

    const result = loadAgentDirectoryRead();

    // All three are in flight before any resolves: a sequential rewrite would show 1 here.
    expect(queryMock).toHaveBeenCalledTimes(3);

    const calls = queryMock.mock.calls as Array<[string, unknown[]?]>;
    const sql = calls.map(([statement]) => statement.replace(/\s+/g, " ").trim());

    expect(sql.every((statement) => !/select\s+(?:\w+\.)?\*/i.test(statement))).toBe(true);
    for (const column of ["input_data", "output_data"]) {
      expect(sql.some((statement) => statement.includes(column))).toBe(false);
    }

    pending.forEach(({ resolve }) => resolve([]));
    await result;
  });

  it("derives every card counter inside the one aggregate pass", async () => {
    queryMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const { loadAgentDirectoryRead } = await import("../agent-workspaces");
    await loadAgentDirectoryRead();

    const [statement, values] = queryMock.mock.calls[0] as [string, unknown[]];
    const sql = statement.replace(/\s+/g, " ").trim();

    expect(sql).toContain("group by agent_name");
    for (const alias of [
      "as runs_24h",
      "as completed_24h",
      "as failed_24h",
      "as avg_confidence",
      "as waiting_approval",
      "as running",
      "as stuck",
      "as last_run_at",
    ]) {
      expect(sql).toContain(alias);
    }

    // The stuck threshold is a bound parameter, not interpolated text, and it is the same
    // constant the route uses to decide which runs to list.
    expect(values).toEqual([AGENT_RUN_STUCK_MINUTES]);
    expect(sql).toContain("interval '1 minute' * $1::int");

    // `ready_for_review` is in the status-label map for other sources but cannot exist here:
    // agent_runs_status_check allows four values and that is not one of them.
    expect(sql).not.toContain("ready_for_review");
  });

  it("counts current state without a time window, and rates within one", async () => {
    queryMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const { loadAgentDirectoryRead } = await import("../agent-workspaces");
    await loadAgentDirectoryRead();

    const sql = (queryMock.mock.calls[0] as [string])[0].replace(/\s+/g, " ").trim();

    // A run wedged for three days is the one worth showing, so the open-state counters must
    // not carry the 24-hour predicate the rate counters do.
    expect(sql).toMatch(
      /count\(\*\) filter \(where status = 'waiting_approval'\)::int as waiting_approval/,
    );
    expect(sql).toMatch(/count\(\*\) filter \(where status = 'running'\)::int as running/);
    expect(sql).toMatch(
      /count\(\*\) filter \( where created_at >= now\(\) - interval '24 hours' and status = 'completed' \)::int as completed_24h/,
    );
  });

  it("totals every agent_name on record, not only the catalogued ones", async () => {
    queryMock
      .mockResolvedValueOnce([
        aggregateRow({
          agent_name: FIRST_AGENT.display_name,
          runs_24h: 10,
          completed_24h: 8,
          failed_24h: 2,
          waiting_approval: 1,
          running: 3,
          stuck: 1,
          avg_confidence: 0.9,
          last_run_at: "2026-08-27T10:00:00.000Z",
        }),
        // A name the dispatch path wrote and the catalogue no longer has. It can never
        // appear as a card, and it must still appear in the totals.
        aggregateRow({
          agent_name: "Retired Agent",
          runs_24h: 90,
          completed_24h: 40,
          failed_24h: 50,
          waiting_approval: 4,
          running: 0,
          stuck: 0,
          avg_confidence: 0.5,
        }),
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { loadAgentDirectoryRead } = await import("../agent-workspaces");
    const directory = await loadAgentDirectoryRead();

    expect(directory.totals).toEqual({
      runs_24h: 100,
      completed_24h: 48,
      failed_24h: 52,
      waiting_approval: 5,
      running: 3,
      stuck: 1,
      // Weighted by run count, not averaged across agents: (0.9*10 + 0.5*90) / 100.
      avg_confidence: 0.54,
    });

    // The catalogue is still what the cards enumerate.
    expect(directory.agents).toHaveLength(AGENT_DEFINITIONS.length);
    expect(directory.agents.some((agent) => agent.display_name === "Retired Agent")).toBe(false);
  });

  it("gives an agent that has never run zeros and a null last run, never a guess", async () => {
    queryMock
      .mockResolvedValueOnce([
        aggregateRow({
          agent_name: FIRST_AGENT.display_name,
          runs_24h: 4,
          completed_24h: 4,
          last_run_at: new Date("2026-08-27T09:30:00.000Z"),
        }),
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { loadAgentDirectoryRead } = await import("../agent-workspaces");
    const directory = await loadAgentDirectoryRead();

    const first = directory.agents.find((agent) => agent.name === FIRST_AGENT.name);
    const second = directory.agents.find((agent) => agent.name === SECOND_AGENT.name);

    // A Date from the driver is normalised to ISO so the value survives serialization to
    // the client and `formatDateTime` gets what it expects.
    expect(first?.last_run_at).toBe("2026-08-27T09:30:00.000Z");
    expect(first?.runs_24h).toBe(4);

    expect(second?.last_run_at).toBeNull();
    expect(second?.runs_24h).toBe(0);
    expect(second?.completed_24h).toBe(0);
    expect(second?.stuck).toBe(0);
    expect(second?.avg_confidence).toBeNull();
    expect(directory.totals.avg_confidence).toBeNull();
  });

  it("places sparkline buckets oldest-first so the bars read left to right", async () => {
    queryMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { agent_name: FIRST_AGENT.display_name, hours_ago: 0, run_count: 5 },
        { agent_name: FIRST_AGENT.display_name, hours_ago: 13, run_count: 2 },
        // Outside the fourteen-hour window the sparkline covers: dropped, not folded into
        // the nearest bucket, which would overstate a quiet hour.
        { agent_name: FIRST_AGENT.display_name, hours_ago: 14, run_count: 99 },
      ])
      .mockResolvedValueOnce([]);

    const { loadAgentDirectoryRead } = await import("../agent-workspaces");
    const directory = await loadAgentDirectoryRead();

    const sparkline = directory.agents.find((agent) => agent.name === FIRST_AGENT.name)?.sparkline;
    expect(sparkline).toHaveLength(14);
    expect(sparkline?.at(-1)).toBe(5);
    expect(sparkline?.at(0)).toBe(2);
    expect(sparkline?.includes(99)).toBe(false);
  });
});
