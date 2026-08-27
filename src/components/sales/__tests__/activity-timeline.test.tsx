// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: ComponentProps<"a"> & { to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

import { ActivityTimeline, type ActivityEvent } from "../activity-timeline";

afterEach(cleanup);

const events: ActivityEvent[] = [
  {
    id: "1",
    at: "2026-05-20T09:30:00Z",
    kind: "quote_drafted",
    title: "Quote drafted",
    actor: { name: "Renewal Assistant", isAgent: true },
  },
  {
    id: "2",
    at: "2026-05-20T16:05:00Z",
    kind: "quote_approved",
    title: "Quote approved",
    actor: { name: "Ada Wong" },
  },
];

describe("ActivityTimeline", () => {
  it("marks an agent's event as an agent's, and leaves a person's unmarked", () => {
    // The failure this prevents: reading "Renewal Assistant sent the quote" as a decision
    // a colleague signed off on. The marker is text, so it survives greyscale and reaches
    // a screen reader; a colour or a different avatar would not.
    render(<ActivityTimeline events={events} />);

    const [agentRow, humanRow] = screen.getAllByRole("listitem");

    expect(within(agentRow).getByText("Renewal Assistant")).toBeTruthy();
    expect(within(agentRow).getByText("AI agent")).toBeTruthy();

    expect(within(humanRow).getByText("Ada Wong")).toBeTruthy();
    expect(within(humanRow).queryByText("AI agent")).toBeNull();
  });

  it("does not mark an actor as an agent merely because the event kind is automated", () => {
    // isAgent is about who acted. An automated-sounding kind performed by a person is
    // still a human decision, and claiming otherwise is the same error in reverse.
    render(
      <ActivityTimeline
        events={[
          {
            id: "1",
            at: "2026-05-20T09:30:00Z",
            kind: "agent_run_approved",
            title: "Agent run approved",
            actor: { name: "Ada Wong" },
          },
        ]}
      />,
    );

    expect(screen.queryByText("AI agent")).toBeNull();
  });

  it("formats timestamps through the shared SSR-safe formatter", () => {
    // src/lib/format.ts pins en-GB and UTC. Formatting inline would render one string on
    // the server and another in the browser, which React reports as a hydration mismatch.
    render(<ActivityTimeline events={[events[0]]} />);

    expect(screen.getByText("20 May 2026, 09:30")).toBeTruthy();
  });

  it("groups consecutive same-day events under one date and shows only the time per row", () => {
    render(
      <ActivityTimeline
        groupByDay
        events={[
          ...events,
          {
            id: "3",
            at: "2026-05-21T23:45:00Z",
            kind: "quote_sent",
            title: "Quote sent",
            actor: { name: "Ada Wong" },
          },
        ]}
      />,
    );

    const days = screen.getAllByRole("heading", { level: 3 });
    expect(days.map((day) => day.textContent)).toEqual(["20 May 2026", "21 May 2026"]);

    // Once the day is a heading, repeating it on every row is noise.
    expect(screen.getByText("09:30")).toBeTruthy();
    expect(screen.queryByText("20 May 2026, 09:30")).toBeNull();
  });

  it("starts a new day group when the caller's order revisits a day", () => {
    // Grouping follows the given order instead of collecting scattered events, because
    // re-collecting them would silently re-order a timeline the caller ranked.
    render(
      <ActivityTimeline
        groupByDay
        events={[
          { id: "1", at: "2026-05-20T09:30:00Z", kind: "note", title: "First" },
          { id: "2", at: "2026-05-21T09:30:00Z", kind: "note", title: "Second" },
          { id: "3", at: "2026-05-20T18:00:00Z", kind: "note", title: "Third" },
        ]}
      />,
    );

    expect(
      screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent),
    ).toEqual(["20 May 2026", "21 May 2026", "20 May 2026"]);
  });

  it("says the timeline is empty instead of rendering a bare rail", () => {
    render(<ActivityTimeline events={[]} emptyMessage="No renewal activity yet." />);

    expect(screen.getByText("No renewal activity yet.")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });
});
