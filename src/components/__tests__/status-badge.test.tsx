// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import {
  KNOWN_LIFECYCLE_STAGES,
  KNOWN_STATUS_VALUES,
  type StatusDomain,
} from "@/lib/status-labels";

import { LifecycleBadge, StatusBadge } from "../status-badge";

afterEach(() => cleanup());

/**
 * The regression contract for B7.
 *
 * `StatusBadge` used to hold a flat `Record<string, string>` of 29 keys and derive its text
 * as `value.replace(/_/g, " ")`. Splitting that into a domain-aware map is the kind of change
 * that silently reletters a badge on a route nobody opened during review, so every raw value
 * the old map knew is enumerated here with the exact text it must render.
 *
 * On casing: the old badge put lowercase text in the DOM and leaned on CSS `capitalize` to
 * title-case it on screen. The expectations below are the DOM text, which is now the
 * canonical sentence-case label. `capitalize` is still on the element, so the rendered pixels
 * are unchanged — "Pending approval" paints as "Pending Approval" exactly as "pending
 * approval" did. What changed is what a screen reader announces, for the better.
 *
 * Three entries are marked `consolidated`. Those are the deliberate rewordings from
 * design-decisions.md §5 and are the only labels whose wording moves.
 */
type Expectation = {
  domain: StatusDomain;
  value: string;
  /** Exact DOM text. */
  text: string;
  /** Set when §5 deliberately changes the wording, with the label it replaces. */
  consolidated?: string;
};

const EXPECTATIONS: Expectation[] = [
  // leads
  { domain: "leads", value: "new", text: "New" },
  { domain: "leads", value: "qualified", text: "Qualified" },
  { domain: "leads", value: "replied", text: "Replied" },
  { domain: "leads", value: "quoted", text: "Quoted" },
  { domain: "leads", value: "approved", text: "Approved" },
  { domain: "leads", value: "won", text: "Won" },
  { domain: "leads", value: "lost", text: "Lost" },
  // quotes
  { domain: "quotes", value: "draft", text: "Draft" },
  { domain: "quotes", value: "pending_approval", text: "Pending approval" },
  { domain: "quotes", value: "sent", text: "Sent" },
  { domain: "quotes", value: "viewed", text: "Viewed" },
  { domain: "quotes", value: "accepted", text: "Accepted" },
  { domain: "quotes", value: "rejected", text: "Rejected" },
  // tasks
  { domain: "tasks", value: "open", text: "Open" },
  { domain: "tasks", value: "in_progress", text: "In progress" },
  { domain: "tasks", value: "done", text: "Done" },
  // approvals
  { domain: "approvals", value: "pending", text: "Waiting approval", consolidated: "Pending" },
  {
    domain: "approvals",
    value: "escalated",
    text: "Needs attention",
    consolidated: "Escalated",
  },
  // agent runs
  { domain: "agentRuns", value: "running", text: "Running" },
  {
    domain: "agentRuns",
    value: "ready_for_review",
    text: "Waiting approval",
    consolidated: "Ready for review",
  },
  { domain: "agentRuns", value: "waiting_approval", text: "Waiting approval" },
  { domain: "agentRuns", value: "completed", text: "Completed" },
  { domain: "agentRuns", value: "failed", text: "Failed" },
  { domain: "agentRuns", value: "idle", text: "Idle" },
  // agents
  { domain: "agents", value: "active", text: "Active" },
  { domain: "agents", value: "paused", text: "Paused" },
  // `AgentDefinition.status` is "active" | "inactive", and `Product.active` renders the same
  // pair on /settings. Before this entry existed both fell through to the raw-value path, so
  // a deactivated product read "inactive" beside an "Active" one.
  { domain: "agents", value: "inactive", text: "Inactive" },
  // priority
  { domain: "priority", value: "high", text: "High" },
  { domain: "priority", value: "medium", text: "Medium" },
  { domain: "priority", value: "low", text: "Low" },
];

describe("StatusBadge label regression", () => {
  it("covers every value the status map knows, and no invented ones", () => {
    expect([...EXPECTATIONS.map((e) => e.value)].sort()).toEqual([...KNOWN_STATUS_VALUES].sort());
  });

  it.each(EXPECTATIONS)(
    "renders $value as $text without a domain, as every existing caller does",
    ({ value, text }) => {
      render(<StatusBadge value={value} />);
      expect(screen.getByText(text)).not.toBeNull();
    },
  );

  it.each(EXPECTATIONS)(
    "renders $value as $text when scoped to $domain",
    ({ domain, value, text }) => {
      render(<StatusBadge value={value} domain={domain} />);
      expect(screen.getByText(text)).not.toBeNull();
    },
  );

  it("changes the wording of exactly three values, all of them on purpose", () => {
    const consolidated = EXPECTATIONS.filter((e) => e.consolidated);
    expect(consolidated.map((e) => `${e.value} -> ${e.text}`)).toEqual([
      "pending -> Waiting approval",
      "escalated -> Needs attention",
      "ready_for_review -> Waiting approval",
    ]);
  });
});

describe("StatusBadge", () => {
  it("renders an unknown label when a legacy status is missing", () => {
    expect(() => render(<StatusBadge value={null} />)).not.toThrow();
    expect(screen.getByText("Unknown")).not.toBeNull();
  });

  it("renders a blank status as unknown rather than an empty pill", () => {
    render(<StatusBadge value="   " />);
    expect(screen.getByText("Unknown")).not.toBeNull();
  });

  it("falls back to the raw value with underscores replaced, in neutral tone", () => {
    render(<StatusBadge value="awaiting_client_countersign" />);
    const badge = screen.getByText("awaiting client countersign");
    expect(badge.className).toContain("bg-muted");
  });

  it("does not resolve a value off Object.prototype", () => {
    render(<StatusBadge value="constructor" />);
    expect(screen.getByText("constructor")).not.toBeNull();
  });

  it("still lets a caller override the label, as the approvals screen does", () => {
    render(<StatusBadge value="approved" label="Approved by you" />);
    expect(screen.getByText("Approved by you")).not.toBeNull();
    expect(screen.queryByText("Approved")).toBeNull();
  });

  it("still merges a caller className", () => {
    render(<StatusBadge value="won" className="ml-auto" />);
    expect(screen.getByText("Won").className).toContain("ml-auto");
  });

  it("renders one tone class per tone rather than a per-status tint", () => {
    render(
      <>
        <StatusBadge value="new" />
        <StatusBadge value="sent" />
      </>,
    );
    expect(screen.getByText("New").className).toBe(screen.getByText("Sent").className);
  });
});

describe("LifecycleBadge", () => {
  const STAGES: Array<[string, string]> = [
    ["prospect", "Prospect"],
    ["active_client", "Active client"],
    ["at_risk", "At risk"],
    ["churned", "Churned"],
    ["partner", "Partner"],
    ["vendor", "Vendor"],
  ];

  it("covers exactly the stages the accounts table allows", () => {
    expect(STAGES.map(([value]) => value).sort()).toEqual([...KNOWN_LIFECYCLE_STAGES].sort());
  });

  it.each(STAGES)("renders %s as %s", (stage, text) => {
    render(<LifecycleBadge stage={stage} />);
    expect(screen.getByText(text)).not.toBeNull();
  });

  it("renders an unknown stage rather than throwing", () => {
    expect(() => render(<LifecycleBadge stage={null} />)).not.toThrow();
    expect(screen.getByText("Unknown")).not.toBeNull();
  });

  it("keeps active_client distinct from an agent's active", () => {
    render(
      <>
        <LifecycleBadge stage="active_client" />
        <StatusBadge value="active" domain="agents" />
      </>,
    );
    expect(screen.getByText("Active client")).not.toBeNull();
    expect(screen.getByText("Active")).not.toBeNull();
  });
});
