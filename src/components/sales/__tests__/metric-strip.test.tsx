// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: ComponentProps<"a"> & { to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

import { MetricStrip, type SalesMetric } from "../metric-strip";

const metric = (label: string, extra: Partial<SalesMetric> = {}): SalesMetric => ({
  id: label.toLowerCase(),
  label,
  value: "12",
  ...extra,
});

/** The shape the strip occupies, independent of what is inside it. */
const layoutOf = (container: HTMLElement) => ({
  rootClass: (container.firstElementChild as HTMLElement).className,
  cells: [...container.querySelectorAll("[data-metric-cell]")].map((cell) => cell.className),
  supporting: container.querySelectorAll("[data-supporting-cell]").length,
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("MetricStrip", () => {
  it("warns in development past four primary metrics, and still renders every one", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    render(
      <MetricStrip
        metrics={[metric("Overdue"), metric("Due today"), metric("Hot leads"), metric("Quotes")]}
      />,
    );
    expect(warn).not.toHaveBeenCalled();

    cleanup();
    render(
      <MetricStrip
        metrics={[
          metric("Overdue"),
          metric("Due today"),
          metric("Hot leads"),
          metric("Quotes"),
          metric("Renewals"),
        ]}
      />,
    );

    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain("5 primary metrics");
    // The cap is advice to the author, not censorship of the data: dropping the fifth
    // metric would silently hide a number the page claims to show.
    expect(screen.getAllByText("Renewals")).toHaveLength(1);
    expect(document.querySelectorAll("[data-metric-cell]")).toHaveLength(5);
  });

  it("states the tone in words, never in colour alone", () => {
    render(
      <MetricStrip
        metrics={[
          metric("Watching", { tone: "info" }),
          metric("Healthy", { tone: "success" }),
          metric("Slipping", { tone: "warning" }),
          metric("Breached", { tone: "destructive" }),
        ]}
      />,
    );

    // A reader who cannot distinguish the tone colours still gets the whole signal.
    expect(screen.getByText("Watch")).toBeTruthy();
    expect(screen.getByText("On track")).toBeTruthy();
    expect(screen.getByText("Needs attention")).toBeTruthy();
    // "Urgent", not "Critical": the copy rules name "Critical" as inflated wording to
    // replace, and metric tones use the same restraint as everything else.
    expect(screen.getByText("Urgent")).toBeTruthy();
  });

  it("leaves a neutral metric unmarked rather than labelling every card", () => {
    const { container } = render(
      <MetricStrip metrics={[metric("Open leads", { tone: "neutral", hint: "unworked" })]} />,
    );

    // "Nothing to flag" is the default state; a marker on every card teaches people to
    // ignore all of them, which costs the warning tone its meaning.
    expect(container.textContent).toContain("unworked");
    expect(container.textContent).not.toContain("Neutral");
    expect(container.querySelectorAll("[data-metric-cell]")).toHaveLength(1);
  });

  it("keeps loading and error in exactly the layout of the loaded state", () => {
    const props = {
      metrics: [metric("Overdue"), metric("Due today"), metric("Hot leads")],
      supporting: [metric("Stale"), metric("Unassigned")],
    };

    const loaded = layoutOf(render(<MetricStrip {...props} />).container);
    cleanup();
    const loading = layoutOf(render(<MetricStrip {...props} isLoading />).container);
    cleanup();
    const failed = layoutOf(render(<MetricStrip {...props} error />).container);

    // Same grid, same number of cells, same cell chrome — only the contents differ, so
    // resolving a slow query does not reflow everything below the strip.
    expect(loading).toEqual(loaded);
    expect(failed).toEqual(loaded);
    expect(loaded.cells).toHaveLength(3);
    expect(loaded.supporting).toBe(2);
  });

  it("holds the grid open at full width when the data has not arrived yet", () => {
    const { container } = render(<MetricStrip metrics={[]} isLoading />);

    // A caller that has nothing yet still gets a four-cell strip, so the page does not
    // grow by a card's height the moment the query resolves.
    expect(container.querySelectorAll("[data-metric-cell]")).toHaveLength(4);
    expect((container.firstElementChild as HTMLElement).getAttribute("aria-busy")).toBe("true");
  });

  it("says a failed metric is unavailable instead of showing a number it does not have", () => {
    render(<MetricStrip metrics={[metric("Pending", { value: "41" })]} error />);

    expect(screen.queryByText("41")).toBeNull();
    expect(screen.getByText("Unavailable")).toBeTruthy();
  });

  it("makes a metric with an href a link to its filtered workspace", () => {
    render(
      <MetricStrip
        metrics={[metric("Overdue", { href: "/leads?filter=overdue" }), metric("Hot leads")]}
      />,
    );

    const link = screen.getByRole("link", { name: "Overdue" });
    expect(link.getAttribute("href")).toBe("/leads?filter=overdue");
    // Only the metric that was given one becomes a link.
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("does not offer the link while the number behind it is loading or failed", () => {
    const linked = [metric("Overdue", { href: "/leads?filter=overdue" })];

    render(<MetricStrip metrics={linked} isLoading />);
    expect(screen.queryByRole("link")).toBeNull();

    cleanup();
    render(<MetricStrip metrics={linked} error />);
    // Linking to "the 12 overdue leads" while the count is unknown promises something
    // the destination cannot honour.
    expect(screen.queryByRole("link")).toBeNull();
  });

  describe("updatedAt", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-05-20T12:00:00.000Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("renders freshness as relative time, from the shared formatter", () => {
      render(
        <MetricStrip metrics={[metric("Overdue", { updatedAt: "2026-05-20T09:00:00.000Z" })]} />,
      );

      const stamp = screen.getByText(/Updated/);
      expect(stamp.textContent).toBe("Updated 3h ago");
      // The machine-readable value stays the ISO string the caller supplied.
      expect(stamp.getAttribute("datetime")).toBe("2026-05-20T09:00:00.000Z");
    });
  });

  it("still accepts the prop shape the existing routes pass", () => {
    // These nine routes are not being migrated in this change, so the old call has to
    // keep compiling and rendering: no `id`, numeric `value`, `delta`, `columns`.
    const { container } = render(
      <MetricStrip
        metrics={[
          { label: "Pending", value: 7, hint: "awaiting human decision" },
          { label: "Quote sends", value: 3, hint: "pending quote approvals", delta: -12 },
          { label: "Decided", value: 41, hint: "approved, rejected, or changed", delta: 8 },
        ]}
        columns={3}
      />,
    );

    expect(container.querySelectorAll("[data-metric-cell]")).toHaveLength(3);
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText(/-12%/)).toBeTruthy();
    expect(screen.getByText(/\+8%/)).toBeTruthy();
    expect((container.firstElementChild as HTMLElement).className).toContain("xl:grid-cols-3");
  });
});
