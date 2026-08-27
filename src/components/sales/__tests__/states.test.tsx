// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: ComponentProps<"a"> & { to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

import { DataTableShell, type ColumnDef, type ColumnPriority } from "../data-table-shell";
import { MetricStrip, type SalesMetric } from "../metric-strip";
import { ResponsiveRecordList } from "../responsive-record-list";
import {
  EmptyWorkspaceState,
  ErrorState,
  FilteredEmptyState,
  LoadingSkeleton,
  PermissionDeniedState,
  StaleDataIndicator,
} from "../states";
import { WorkSurfaceEmpty } from "../work-surface-empty";

afterEach(cleanup);

/* ---------------------------------------------------------------------------------- */

type Row = { id: string; name: string; owner: string; stage: string; value: string };

const ROWS: Row[] = [
  { id: "a-1", name: "Acme", owner: "Dana", stage: "Draft", value: "1,200" },
  { id: "a-2", name: "Belltown", owner: "Sam", stage: "Sent", value: "3,400" },
  { id: "a-3", name: "Corvid", owner: "Lee", stage: "Won", value: "900" },
];

const PRIORITIES: ColumnPriority[] = ["primary", "primary", "secondary", "tertiary"];

const COLUMNS: ColumnDef<Row>[] = [
  { id: "name", header: "Name", priority: "primary", cell: (row) => row.name },
  { id: "owner", header: "Owner", priority: "primary", cell: (row) => row.owner },
  { id: "stage", header: "Stage", priority: "secondary", cell: (row) => row.stage },
  { id: "value", header: "Value", priority: "tertiary", cell: (row) => row.value },
];

const metric = (label: string): SalesMetric => ({ id: label.toLowerCase(), label, value: "12" });

/** Everything about a node that decides how much room it takes up. */
const shapeOf = (root: HTMLElement, selector: string) =>
  [...root.querySelectorAll(selector)].map((node) => node.className);

/**
 * A skeleton that reserves the wrong amount of room is worse than no skeleton: the page
 * settles once when it appears and again when it is replaced. So each variant is compared
 * against the real component's own markup rather than eyeballed.
 */
describe("LoadingSkeleton structural parity", () => {
  it("metrics reserves the same grid and the same number of cards as MetricStrip", () => {
    const skeleton = render(<LoadingSkeleton variant="metrics" label="metrics" columns={4} />);
    const skeletonGrid = skeleton.container.querySelector("[aria-hidden='true'] > div");
    const skeletonCells = shapeOf(skeleton.container, "[data-metric-cell]");

    cleanup();

    const loaded = render(
      <MetricStrip
        metrics={[metric("Overdue"), metric("Due today"), metric("Hot leads"), metric("Quotes")]}
      />,
    );
    const loadedGrid = loaded.container.firstElementChild;

    expect(skeletonCells).toHaveLength(4);
    expect(skeletonCells).toEqual(shapeOf(loaded.container, "[data-metric-cell]"));
    // aria-busy is the only difference the loading state is allowed to make to the grid.
    expect(skeletonGrid?.className).toBe(loadedGrid?.className);
  });

  it("table reserves the same columns, at the same breakpoints, as DataTableShell", () => {
    const skeleton = render(
      <LoadingSkeleton variant="table" label="quotes" rows={ROWS.length} priorities={PRIORITIES} />,
    );
    const skeletonTable = skeleton.container.querySelector("table");
    const skeletonHeaders = shapeOf(skeleton.container, "th");
    const skeletonCells = shapeOf(skeleton.container, "td");

    cleanup();

    const loaded = render(
      <DataTableShell columns={COLUMNS} rows={ROWS} rowKey={(row) => row.id} />,
    );

    expect(skeletonTable?.className).toBe(loaded.container.querySelector("table")?.className);
    expect(skeletonHeaders).toEqual(shapeOf(loaded.container, "th"));
    expect(skeletonCells).toEqual(shapeOf(loaded.container, "td"));
  });

  it("cards reserves the same list rows as ResponsiveRecordList's card surface", () => {
    const skeleton = render(<LoadingSkeleton variant="cards" label="quotes" rows={ROWS.length} />);
    const skeletonItems = shapeOf(skeleton.container, "li");
    const skeletonBodies = shapeOf(skeleton.container, "li > div");

    cleanup();

    const loaded = render(
      <ResponsiveRecordList
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(row) => row.id}
        renderCard={(row) => <p>{row.name}</p>}
      />,
    );

    expect(skeletonItems).toHaveLength(ROWS.length);
    expect(skeletonItems).toEqual(shapeOf(loaded.container, "li"));
    expect(skeletonBodies).toEqual(shapeOf(loaded.container, "li > div"));
  });

  it("detail and panel hold a section for every section that will arrive", () => {
    const detail = render(<LoadingSkeleton variant="detail" label="quote" rows={3} />);
    // Three body sections plus the one summary card beside them.
    expect(detail.container.querySelectorAll(".p-5")).toHaveLength(4);
    cleanup();

    const panel = render(<LoadingSkeleton variant="panel" label="summary" rows={2} />);
    const sections = panel.container.querySelectorAll("[aria-hidden='true'] > div > div");
    expect(sections).toHaveLength(2);
    // The same `mt-2` gap RecordSummaryPanel puts between a section label and its content.
    expect(panel.container.querySelectorAll(".mt-2")).toHaveLength(2);
  });

  it("tells a screen reader once what is loading, and hides the boxes from it", () => {
    const { container } = render(<LoadingSkeleton variant="table" label="leads" rows={4} />);

    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.textContent).toBe("Loading leads…");

    // Forty empty cells announced one at a time is not an accessible loading state.
    const boxes = container.querySelector("[aria-hidden='true']");
    expect(boxes).not.toBeNull();
    expect(boxes?.querySelectorAll("td").length).toBeGreaterThan(0);
  });
});

/* ---------------------------------------------------------------------------------- */

describe("ErrorState", () => {
  /** What a Neon/Postgres failure actually looks like by the time it reaches the client. */
  const DRIVER_MESSAGE =
    'select id, name from public.leads where owner_id = $1 - column "owner_id" does not exist';

  it("never renders a raw driver message handed to it as an error", () => {
    render(<ErrorState kind="server" onRetry={() => {}} error={new Error(DRIVER_MESSAGE)} />);

    const text = document.body.textContent ?? "";
    expect(text).not.toContain("owner_id");
    expect(text).not.toContain("select");
    expect(text).not.toContain("public.leads");
    expect(screen.getByText("Something went wrong. Please try again.")).toBeTruthy();
  });

  it("never renders a raw driver message even when a caller passes it as copy", () => {
    // The mistake this component exists to make impossible: `description={error.message}`.
    render(<ErrorState kind="server" onRetry={() => {}} description={DRIVER_MESSAGE} />);

    const text = document.body.textContent ?? "";
    expect(text).not.toContain("owner_id");
    expect(text).not.toContain("does not exist");
    expect(screen.getByText("Something went wrong. Please try again.")).toBeTruthy();
  });

  /**
   * The message above is caught by its SQL shape, which makes it the easy case. These are
   * the hard ones: real Postgres server messages that quote no SQL, name no relation and
   * read like plain English, so nothing about their shape gives them away. Two carry a
   * secret — the database role, and a table name.
   */
  it.each([
    'password authentication failed for user "clientops_rw"',
    "permission denied for table accounts",
    "Connection terminated unexpectedly",
    "sorry, too many clients already",
    "canceling statement due to statement timeout",
    'invalid input syntax for type uuid: "abc"',
  ])("never renders %s, from any of the three props that reach the screen", (message) => {
    const { rerender } = render(
      <ErrorState kind="server" onRetry={() => {}} error={new Error(message)} />,
    );
    expect(document.body.textContent).not.toContain(message);

    rerender(<ErrorState kind="server" onRetry={() => {}} description={message} />);
    expect(document.body.textContent).not.toContain(message);

    rerender(<ErrorState kind="server" onRetry={() => {}} title={message} />);
    expect(document.body.textContent).not.toContain(message);
  });

  it("passes a sentence a person wrote through untouched", () => {
    render(
      <ErrorState kind="server" onRetry={() => {}} description="This quote is already approved." />,
    );

    expect(screen.getByText("This quote is already approved.")).toBeTruthy();
  });

  it("says which failure it is in words, not by icon or colour", () => {
    const { rerender } = render(<ErrorState kind="offline" onRetry={() => {}} />);
    expect(screen.getByText("You appear to be offline")).toBeTruthy();

    rerender(<ErrorState kind="stale" onRetry={() => {}} />);
    expect(screen.getByText("This view is out of date")).toBeTruthy();
  });

  it("gives the retry control an accessible name and calls back", async () => {
    const onRetry = vi.fn();
    render(<ErrorState kind="server" onRetry={onRetry} retryLabel="Reload leads" />);

    const button = screen.getByRole("button", { name: "Reload leads" });
    await userEvent.click(button);

    expect(onRetry).toHaveBeenCalledOnce();
  });
});

/* ---------------------------------------------------------------------------------- */

describe("PermissionDeniedState", () => {
  it("names the workspace and leaks nothing about how access is modelled", () => {
    render(<PermissionDeniedState what="Approvals" />);

    const text = document.body.textContent ?? "";
    expect(text).toContain("Approvals");

    // Capability strings, role names and the vocabulary of the authorization module.
    for (const leak of [
      "capability",
      "requireCapability",
      ".view",
      ".manage",
      "role",
      "admin",
      "scope",
      "403",
      "forbidden",
      "unauthorized",
    ]) {
      expect(text.toLowerCase()).not.toContain(leak.toLowerCase());
    }

    // And no dotted identifier of any shape, which is what every capability in this
    // codebase looks like: `leads.view`, `quotes.approve`, `admin.users.manage`.
    expect(text).not.toMatch(/[a-z_]+\.[a-z_]+/i);
  });

  it("points at a person rather than offering a retry that cannot work", () => {
    render(<PermissionDeniedState what="Approvals" />);

    expect(screen.queryByRole("button")).toBeNull();
    expect(document.body.textContent).toContain("Ask whoever set up your account");
  });

  /**
   * The test above only proves that a workspace name renders as a workspace name. The
   * guarantee in the component's doc is stronger — that no capability reaches the screen —
   * and a `what: string` prop cannot carry it, so it is enforced here against the values a
   * call site would actually get wrong: the capability it just checked, the role it read,
   * the table the query failed on.
   */
  it.each([
    "leads.view",
    "admin.users.manage",
    "quotes:approve",
    "leads_view",
    "leadsView",
    "accounts/read",
    "client_success",
  ])("does not echo %s, which is an identifier and not a workspace name", (identifier) => {
    render(<PermissionDeniedState what={identifier} />);

    const text = document.body.textContent ?? "";
    expect(text).not.toContain(identifier);
    expect(text).toContain("You do not have access to this workspace");
  });

  it("still names a real workspace, including a multi-word one", () => {
    render(<PermissionDeniedState what="Client Workspace" />);

    expect(document.body.textContent).toContain("You do not have access to Client Workspace");
  });
});

/* ---------------------------------------------------------------------------------- */

describe("empty states", () => {
  it("are two different states with two different actions", async () => {
    const onClear = vi.fn();

    const empty = render(
      <EmptyWorkspaceState
        title="No leads yet"
        description="Leads appear here once a campaign starts sending."
        action={<button type="button">New lead</button>}
      />,
    );
    const emptyText = empty.container.textContent ?? "";

    // Nothing exists: the way out is to create a record, and never to clear a filter.
    expect(emptyText).toContain("No leads yet");
    expect(emptyText.toLowerCase()).not.toContain("filter");
    expect(screen.getByRole("button", { name: "New lead" })).toBeTruthy();

    cleanup();

    const filtered = render(<FilteredEmptyState onClear={onClear} filterSummary="Status: Draft" />);
    const filteredText = filtered.container.textContent ?? "";

    // Records exist: the way out is to widen the filter, and never to create a record.
    expect(filteredText).toContain("No results match these filters");
    expect(filteredText).toContain("Status: Draft");
    expect(filteredText.toLowerCase()).not.toContain("yet");
    expect(screen.queryByRole("button", { name: "New lead" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("renders WorkSurfaceEmpty through the same component, not a second copy", () => {
    const superseded = render(
      <WorkSurfaceEmpty title="All clear" description="Nothing needs you right now." />,
    );
    const supersededHtml = superseded.container.innerHTML;

    cleanup();

    const canonical = render(
      <EmptyWorkspaceState title="All clear" description="Nothing needs you right now." />,
    );

    expect(supersededHtml).toBe(canonical.container.innerHTML);
  });
});

/* ---------------------------------------------------------------------------------- */

describe("StaleDataIndicator", () => {
  const UPDATED_AT = "2026-05-20T09:30:00.000Z";

  it("renders an absolute date on the server, so hydration has nothing to correct", () => {
    const html = renderToStaticMarkup(<StaleDataIndicator updatedAt={UPDATED_AT} />);

    expect(html).toContain("20 May 2026");
    expect(html).not.toContain("ago");
    // Nor may it judge freshness without a clock.
    expect(html).not.toContain("Out of date");
  });

  it("switches to relative time once mounted", () => {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60_000).toISOString();
    render(<StaleDataIndicator updatedAt={twoMinutesAgo} />);

    expect(document.body.textContent).toContain("2m ago");
  });

  it("calls out stale data in words, not only in colour", () => {
    const old = new Date(Date.now() - 60 * 60_000).toISOString();
    render(<StaleDataIndicator updatedAt={old} staleAfterMs={5 * 60_000} />);

    expect(document.body.textContent).toContain("Out of date");
  });

  it("says it is refreshing instead of dating data that is about to change", () => {
    render(<StaleDataIndicator updatedAt={UPDATED_AT} isRefetching />);

    expect(document.body.textContent).toContain("Refreshing");
    expect(document.body.textContent).not.toContain("Updated");
  });
});
