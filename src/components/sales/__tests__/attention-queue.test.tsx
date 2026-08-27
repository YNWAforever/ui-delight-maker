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

import { AttentionQueue, type AttentionItem, type AttentionSeverity } from "../attention-queue";

afterEach(cleanup);

const item = (overrides: Partial<AttentionItem> & Pick<AttentionItem, "id">): AttentionItem => ({
  severity: "sla",
  title: "QT-1042",
  reason: "Waiting on the client for four days.",
  age: "4 days",
  href: "/quotes/1042",
  ...overrides,
});

describe("AttentionQueue", () => {
  it("names every severity in text, so the signal survives without colour", () => {
    // The whole reason this queue exists is to say what is wrong. A tinted row says
    // nothing to a colour-blind user, a screen reader, or a greyscale screenshot.
    const expected: Array<[AttentionSeverity, string]> = [
      ["sla", "SLA breached"],
      ["approval", "Waiting approval"],
      ["value", "High value"],
      ["ai-review", "AI review"],
      ["risk", "At risk"],
      ["failure", "Failed"],
      ["stuck", "Stuck"],
    ];

    render(
      <AttentionQueue
        items={expected.map(([severity]) => item({ id: severity, severity }))}
        emptyTitle="Nothing waiting"
        emptyDescription="Every exception is cleared."
      />,
    );

    for (const [, label] of expected) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("renders items in the order given and never re-sorts them", () => {
    // Attention order is computed by the caller from SLA clock, value and risk score.
    // A component that quietly sorted by severity would make that ranking a lie.
    render(
      <AttentionQueue
        items={[
          item({ id: "1", severity: "stuck", title: "Third by severity, first by rank" }),
          item({ id: "2", severity: "sla", title: "Most severe, ranked second" }),
          item({ id: "3", severity: "approval", title: "Ranked last" }),
        ]}
        emptyTitle="Nothing waiting"
        emptyDescription="Every exception is cleared."
      />,
    );

    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Third by severity, first by rank",
      "Most severe, ranked second",
      "Ranked last",
    ]);
  });

  it("keeps each row's severity attached to that row's record", () => {
    render(
      <AttentionQueue
        items={[
          item({ id: "1", severity: "failure", title: "AGT-7" }),
          item({ id: "2", severity: "value", title: "QT-9001" }),
        ]}
        emptyTitle="Nothing waiting"
        emptyDescription="Every exception is cleared."
      />,
    );

    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getByText("Failed")).toBeTruthy();
    expect(within(rows[0]).queryByText("High value")).toBeNull();
    expect(within(rows[1]).getByText("High value")).toBeTruthy();
  });

  it("uses the caller's copy when the queue is empty rather than a generic message", () => {
    // An empty exception queue is good news and is worth saying in the queue's own terms.
    render(
      <AttentionQueue
        items={[]}
        emptyTitle="No approvals waiting"
        emptyDescription="Every quote over HKD 50,000 has been signed off."
      />,
    );

    expect(screen.getByText("No approvals waiting")).toBeTruthy();
    expect(screen.getByText("Every quote over HKD 50,000 has been signed off.")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });
});
