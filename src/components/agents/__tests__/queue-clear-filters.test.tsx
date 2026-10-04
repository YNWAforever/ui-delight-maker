// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { agentQueueSearchSchema } from "@/lib/agent-queue-input";
import { QueueToolbar } from "../queue-toolbar";

const runId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
afterEach(cleanup);
function RouteSearch({ queue }: { queue: "runs" | "approvals" }) {
  const [search, setSearch] = useState({
    ...agentQueueSearchSchema.parse({
      workflowType: "unknown",
      status: queue === "runs" ? "failed" : "pending",
      attention: true,
      origin: "demo",
      from: "2026-10-01T00:00:00Z",
      to: "2026-10-04T00:00:00Z",
      cursor: "old-cursor",
      limit: 50,
      runId,
    }),
    page: 7,
  });
  return (
    <>
      <QueueToolbar
        queue={queue}
        value={search}
        onChange={(next) => setSearch((current) => ({ ...current, ...next }))}
      />
      <output data-testid="route-search">{JSON.stringify(search)}</output>
    </>
  );
}
const currentSearch = () => JSON.parse(screen.getByTestId("route-search").textContent!);
describe("clear queue filters through the existing route search merge", () => {
  it.each(["runs", "approvals"] as const)(
    "clears every active %s filter, cursor and deep link while retaining unrelated route state",
    (queue) => {
      render(<RouteSearch queue={queue} />);
      expect(currentSearch().runId).toBe(runId);
      fireEvent.click(screen.getByRole("button", { name: "Clear queue filters" }));
      expect(currentSearch()).toEqual({ ...agentQueueSearchSchema.parse({}), page: 7 });
      expect(screen.getByRole("combobox", { name: "Workflow" })).toHaveProperty("value", "");
      expect(screen.getByRole("combobox", { name: "Queue status" })).toHaveProperty("value", "");
      expect(screen.getByLabelText("From (UTC)")).toHaveProperty("value", "");
      expect(screen.getByLabelText("To (UTC)")).toHaveProperty("value", "");
    },
  );
  it("a single filter change clears only cursor/deep link and retains other filters and route state", () => {
    render(<RouteSearch queue="runs" />);
    const before = currentSearch();
    fireEvent.change(screen.getByRole("combobox", { name: "Data origin" }), {
      target: { value: "unknown" },
    });
    const { cursor: _cursor, runId: _run, ...rest } = before;
    expect(currentSearch()).toEqual({ ...rest, origin: "unknown" });
  });
});
