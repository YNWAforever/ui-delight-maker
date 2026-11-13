// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAgentRunDetailRead } from "@/server-functions/agent-runs";
import { crmQueryKeys } from "@/lib/query-keys";
import type {
  AgentRunDetailInput,
  AgentRunDetailRead,
  AgentTraceEvent,
} from "@/lib/agent-run-detail";
import { AgentRunDetails, AgentRunDetailPanel } from "../run-detail-panel";
vi.mock("@/server-functions/agent-runs", () => ({ getAgentRunDetailRead: vi.fn() }));
const runId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const actorId = "reader";
function event(id = "trace-one"): AgentTraceEvent {
  return {
    id,
    called_at: "2026-11-14T00:00:00.000123Z",
    tool_name: "qualify_lead",
    source: "n8n_dispatch",
    status: "ok",
    duration_ms: 25,
    error_code: null,
    args_digest: "a".repeat(64),
    args_keys: ["lead_id"],
  };
}
function result(events = [event()]): Extract<AgentRunDetailRead, { available: true }> {
  return {
    available: true,
    actorId,
    run: {
      id: runId,
      agent_name: "Qualification",
      workflow_type: "qualify_lead",
      status: "completed",
      trigger_type: "manual",
      created_at: "2026-11-14T00:00:00.000Z",
      updated_at: "2026-11-14T00:00:01.000Z",
      duration_ms: 1000,
      model_used: null,
      outcome_code: "completed",
      attempt_id: null,
    },
    events,
    nextCursor: null,
  };
}
const clients: QueryClient[] = [];
function mount(
  ui: React.ReactNode,
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  clients.push(client);
  return { client, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getAgentRunDetailRead).mockResolvedValue(result());
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
});

describe("operator run evidence", () => {
  it("loads only when a disclosure opens and shows safe trace metadata", async () => {
    const view = mount(<AgentRunDetails runId={runId} actorId={actorId} />);
    expect(getAgentRunDetailRead).not.toHaveBeenCalled();
    const details = view.container.querySelector("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(await screen.findByText("n8n dispatch")).toBeTruthy();
    expect(screen.getByText("Accepted")).toBeTruthy();
    expect(screen.getByText("25 ms")).toBeTruthy();
    expect(screen.getByText("a".repeat(64))).toBeTruthy();
    expect(screen.getByText(/Callback rows count delivery attempts/)).toBeTruthy();
    expect(getAgentRunDetailRead).toHaveBeenCalledTimes(1);
  });

  it("preserves uncertain dispatch and legacy unknown outcomes", async () => {
    vi.mocked(getAgentRunDetailRead).mockResolvedValue(
      result([
        { ...event("uncertain"), status: "error", error_code: "dispatch_ambiguous" },
        {
          ...event("legacy"),
          source: null,
          status: null,
          duration_ms: null,
          args_keys: null,
          args_digest: null,
        },
      ]),
    );
    mount(<AgentRunDetailPanel runId={runId} actorId={actorId} />);
    await screen.findByText("Dispatch outcome unknown");
    expect(screen.getByText("Outcome unknown")).toBeTruthy();
    expect(screen.getByText("Duration unrecorded")).toBeTruthy();
    expect(screen.queryByText("Succeeded")).toBeNull();
  });

  it("provides loading, historical-empty and refresh states", async () => {
    let resolve!: (value: AgentRunDetailRead) => void;
    vi.mocked(getAgentRunDetailRead).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    mount(<AgentRunDetailPanel runId={runId} actorId={actorId} />);
    expect(screen.getByRole("status").textContent).toContain("Loading run evidence");
    resolve(result([]));
    expect(await screen.findByText(/Older runs may predate tracing/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Refresh run details" }));
    await screen.findByText("n8n dispatch");
    expect(getAgentRunDetailRead).toHaveBeenCalledTimes(2);
  });

  it("paginates bounded traces using the server cursor and returns to newer events", async () => {
    const cursor = { calledAt: "2026-11-14T00:00:00.000123Z", id: runId };
    vi.mocked(getAgentRunDetailRead).mockImplementation(async (options) =>
      (options?.data as AgentRunDetailInput | undefined)?.cursor
        ? result([{ ...event("older"), tool_name: "older-event" }])
        : { ...result(), nextCursor: cursor },
    );
    mount(<AgentRunDetailPanel runId={runId} actorId={actorId} />);
    await screen.findByText("n8n dispatch");
    fireEvent.click(screen.getByRole("button", { name: "Older trace events" }));
    await screen.findByText("older-event");
    expect(getAgentRunDetailRead).toHaveBeenLastCalledWith({ data: { runId, cursor } });
    expect(screen.getByText("Trace page 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Newer trace events" }));
    await screen.findByText("qualify_lead", { selector: "span" });
    expect(screen.queryByText("older-event")).toBeNull();
  });

  it("hides cached evidence during refresh and after current access is denied", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(
      crmQueryKeys.agents.section(runId, "run-detail", { actorId, cursor: undefined }),
      result([{ ...event(), tool_name: "cached-private-canary" }]),
    );
    let reject!: (error: Error) => void;
    vi.mocked(getAgentRunDetailRead).mockImplementationOnce(
      () =>
        new Promise((_done, fail) => {
          reject = fail;
        }),
    );
    mount(<AgentRunDetailPanel runId={runId} actorId={actorId} />, client);
    expect(screen.queryByText("cached-private-canary")).toBeNull();
    reject(new Error("select private_database_canary from internal_table"));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText(/private_database_canary/)).toBeNull();
    expect(screen.queryByText("cached-private-canary")).toBeNull();
  });

  it("hides a previously visible result when a background refresh fails", async () => {
    const { client } = mount(<AgentRunDetailPanel runId={runId} actorId={actorId} />);
    await screen.findByText("n8n dispatch");
    vi.mocked(getAgentRunDetailRead).mockRejectedValue(new Error("private-driver-message"));
    await client.invalidateQueries({ queryKey: crmQueryKeys.agents.section(runId, "run-detail") });
    await screen.findByRole("alert");
    expect(screen.queryByText("n8n dispatch")).toBeNull();
    expect(screen.queryByText("private-driver-message")).toBeNull();
  });

  it("removes visible evidence when a refreshed subject verdict denies access", async () => {
    mount(<AgentRunDetailPanel runId={runId} actorId={actorId} />);
    await screen.findByText("n8n dispatch");
    vi.mocked(getAgentRunDetailRead).mockResolvedValue({ available: false, actorId });
    fireEvent.click(screen.getByRole("button", { name: "Refresh run details" }));
    await screen.findByRole("alert");
    expect(screen.queryByText("n8n dispatch")).toBeNull();
  });

  it("does not render data returned for another actor", async () => {
    vi.mocked(getAgentRunDetailRead).mockResolvedValue({ ...result(), actorId: "someone-else" });
    mount(<AgentRunDetailPanel runId={runId} actorId={actorId} />);
    await screen.findByRole("alert");
    expect(screen.queryByText("n8n dispatch")).toBeNull();
  });

  it("keeps private metadata out when the server returns the uniform unavailable result", async () => {
    vi.mocked(getAgentRunDetailRead).mockResolvedValue({ available: false, actorId });
    mount(<AgentRunDetailPanel runId={runId} actorId={actorId} />);
    await screen.findByRole("alert");
    expect(screen.queryByText("Tool-call trace")).toBeNull();
  });
});
