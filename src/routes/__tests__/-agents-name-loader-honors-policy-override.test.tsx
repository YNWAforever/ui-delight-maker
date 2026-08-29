import { describe, expect, it, vi } from "vitest";

/**
 * `/agents/$name`'s loader used to resolve `params.name` against `AGENT_DEFINITIONS` directly
 * (`agents.$name.tsx:96` before this change) - the code catalogue, not the policy store. A
 * paused agent therefore rendered "Active" here while `resolveDispatchableAgent` was already
 * refusing to dispatch it. The fix routes the same lookup through
 * `loadEffectiveAgentCatalogue` via `getEffectiveAgentCatalogue`, so this test proves the
 * loader's returned `agent.status` is the *stored* value, not the catalogue's own default.
 *
 * This deliberately tests the loader in isolation rather than through a full component render:
 * `AgentDetail` merely reads `loaderData.agent.status` into a `StatusBadge`, and that binding
 * is already covered by `-agents-ai-ops-integrity.test.tsx`. What was never covered is whether
 * the loader itself resolves the *effective* value - a render test that hand-builds
 * `loaderData` (as the sibling file does) cannot show that, because it never calls the loader
 * at all.
 */

const getAgentHistoryPageMock = vi.hoisted(() => vi.fn());
const getEffectiveAgentCatalogueMock = vi.hoisted(() => vi.fn());

vi.mock("@/server-functions/agent-runs", () => ({
  getAgentHistoryPage: getAgentHistoryPageMock,
}));

vi.mock("@/server-functions/agents-catalogue", () => ({
  getEffectiveAgentCatalogue: getEffectiveAgentCatalogueMock,
}));

import { AGENT_DEFINITIONS } from "@/lib/agents";
import { Route as AgentDetailRoute } from "../agents.$name";

const HISTORY_PAGE = {
  items: [],
  total: 0,
  page: 1,
  limit: 25,
  summary: { runs_24h: 0, avg_confidence: null },
};

/**
 * Just enough of `context.queryClient` for the loader: `ensureQueryData` calls straight
 * through to the real `queryFn` built by `routeQueryOptions`, which is what actually invokes
 * the (mocked) server functions above. No caching semantics are needed for this test.
 */
function fakeQueryClient() {
  return {
    ensureQueryData: (options: { queryFn: () => unknown }) => options.queryFn(),
  };
}

describe("agents.$name loader resolves status from the effective catalogue", () => {
  const target = AGENT_DEFINITIONS.find((agent) => agent.workflow_type === "qualify_lead");
  if (!target) throw new Error("fixture: qualify_lead missing from the catalogue");

  it("returns the stored 'inactive' override, not the catalogue's own 'active' status", async () => {
    // The code catalogue says "active" for every entry today - this is the whole point of the
    // test, so assert the premise rather than assume it.
    expect(target.status).toBe("active");

    getEffectiveAgentCatalogueMock.mockResolvedValue(
      AGENT_DEFINITIONS.map((agent) =>
        agent.name === target.name ? { ...agent, status: "inactive" as const } : agent,
      ),
    );
    getAgentHistoryPageMock.mockResolvedValue(HISTORY_PAGE);

    const loader = AgentDetailRoute.options.loader as (arg: unknown) => Promise<unknown>;
    const result = await loader({
      context: { queryClient: fakeQueryClient() },
      params: { name: target.name },
      deps: { page: 1 },
    });

    expect((result as { agent: { status: string } }).agent.status).toBe("inactive");
  });
});
