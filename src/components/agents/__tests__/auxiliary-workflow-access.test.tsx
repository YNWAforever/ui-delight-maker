// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuxiliaryWorkflowPanel } from "../auxiliary-workflow-panel";
import { getNoteTidyRuns } from "@/server-functions/auxiliary-agent-runs";
vi.mock("@/server-functions/auxiliary-agent-runs", () => ({ getNoteTidyRuns: vi.fn() }));
vi.mock("@/server-functions/agent-runs", () => ({ getAgentRunDetailRead: vi.fn() }));
vi.mock("../policy-panel", () => ({ PolicyPanel: () => null }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
const clients: QueryClient[] = [];
const history = {
  items: [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      status: "completed",
      created_at: "2026-11-14T00:00:00Z",
      updated_at: "2026-11-14T00:00:01Z",
      outcome_code: null,
      model_used: "actor-a-model",
      tokens_used: null,
      usage: null,
    },
  ],
  total: 1,
  page: 1,
  limit: 25 as const,
};
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.resetAllMocks();
});
describe("actor-owned Note Tidy history beside run evidence", () => {
  it("partitions history by actor when the identity changes", async () => {
    vi.mocked(getNoteTidyRuns).mockResolvedValueOnce(history);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    const view = render(
      <QueryClientProvider client={client}>
        <AuxiliaryWorkflowPanel actorId="actor-a" />
      </QueryClientProvider>,
    );
    await screen.findByText(/actor-a-model/);
    vi.mocked(getNoteTidyRuns).mockImplementationOnce(() => new Promise(() => {}));
    view.rerender(
      <QueryClientProvider client={client}>
        <AuxiliaryWorkflowPanel actorId="actor-b" />
      </QueryClientProvider>,
    );
    expect(screen.queryByText(/actor-a-model/)).toBeNull();
    expect(screen.getByText("Loading Note Tidy metadata…")).toBeTruthy();
  });
  it("hides previously authorized metadata after a failed refresh", async () => {
    vi.mocked(getNoteTidyRuns).mockResolvedValueOnce(history);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    render(
      <QueryClientProvider client={client}>
        <AuxiliaryWorkflowPanel actorId="actor-a" />
      </QueryClientProvider>,
    );
    await screen.findByText(/actor-a-model/);
    vi.mocked(getNoteTidyRuns).mockRejectedValueOnce(new Error("private-driver-canary"));
    fireEvent.click(screen.getByRole("button", { name: "Refresh Note Tidy history" }));
    await screen.findByText("Note Tidy history unavailable.");
    expect(screen.queryByText(/actor-a-model|private-driver-canary/)).toBeNull();
  });
});
