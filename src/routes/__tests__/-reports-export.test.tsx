// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ComponentType } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReportId, ReportRange } from "@/lib/reports";

/**
 * "Export CSV" used to be `onClick={() => toast.success("CSV export queued")}`.
 *
 * No artifact and no queue — two false claims in four words. These tests hold the replacement
 * to the three things that made the old control a lie:
 *
 * 1. a file is actually produced, from the dataset the page already loaded and is authorized
 *    to read;
 * 2. nothing is claimed to be queued, because nothing is;
 * 3. when there is no data the control is visibly unavailable with a reason, rather than
 *    handing the reader an empty file that looks like a measurement of zero.
 *
 * The last test is a source guard rather than a render: the button says "Export CSV" and not
 * "Export loaded rows" only because the read model returns the whole result set. The day that
 * stops being true the label has to change with it, and a render test cannot see that coming.
 */

const { navigateMock, routerInvalidateMock, toastSuccessMock, toastErrorMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  routerInvalidateMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

// Mutable so a test can select a report other than the default. `beforeEach` puts it back.
const search: { range: ReportRange; report: ReportId } = { range: "30d", report: "revenue" };

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    fullPath: "/reports",
    useLoaderData: vi.fn(),
    useSearch: () => search,
  }),
  useNavigate: () => navigateMock,
  useRouter: () => ({ invalidate: routerInvalidateMock }),
}));

vi.mock("sonner", () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock, message: vi.fn() },
}));

vi.mock("@/server-functions/operations", () => ({
  getReportSummary: vi.fn(),
  getReportDataset: vi.fn(),
}));

// Recharts needs a measured container to draw anything, and none of these assertions are
// about the drawing.
vi.mock("@/components/reports/report-charts", () => ({
  ReportChart: () => <div data-testid="report-chart" />,
}));

import { DEFAULT_REPORT, REPORT_IDS, REPORT_SPECS } from "@/lib/reports";

import { Route } from "../reports";

const summary = {
  range: "30d" as const,
  metrics: {
    revenue: 1240000,
    pipelineValue: 800000,
    leads: 40,
    wonLeads: 5,
    conversionRate: 12.5,
    agentRuns: 18,
    successfulAgentRuns: 16,
    openTasks: 7,
  },
  reports: [
    {
      id: "revenue" as const,
      title: "Revenue trend",
      description: "Accepted quote value by week.",
    },
    { id: "pipeline" as const, title: "Pipeline funnel", description: "Lead volume by stage." },
  ],
};

const rows = [
  { week: "2026-01-05", revenue: 1240000 },
  { week: "2026-01-19", revenue: 60000 },
];

function renderReports(datasetRows: Array<Record<string, string | number | null>>) {
  vi.mocked(Route.useLoaderData).mockReturnValue({
    summary,
    dataset: { report: "revenue", range: "30d", data: datasetRows },
  } as never);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Component = Route.options.component as ComponentType;

  render(
    <QueryClientProvider client={queryClient}>
      <Component />
    </QueryClientProvider>,
  );
}

type CapturedDownload = { blob: Blob | null; href: string | null; download: string | null };

function captureDownload(): CapturedDownload {
  const captured: CapturedDownload = { blob: null, href: null, download: null };

  vi.spyOn(URL, "createObjectURL").mockImplementation((value: Blob | MediaSource) => {
    captured.blob = value instanceof Blob ? value : null;
    return "blob:report";
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    captured.href = this.href;
    captured.download = this.download;
  });

  return captured;
}

beforeEach(() => {
  search.range = "30d";
  search.report = "revenue";
  navigateMock.mockReset();
  routerInvalidateMock.mockReset().mockResolvedValue(undefined);
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the reports export produces a real file", () => {
  it("writes the loaded rows to a CSV blob and downloads it", async () => {
    const captured = captureDownload();
    renderReports(rows);

    fireEvent.click(screen.getByRole("button", { name: /Export CSV/ }));

    await waitFor(() => expect(captured.blob).not.toBeNull());
    expect(captured.blob?.type).toBe("text/csv;charset=utf-8");
    expect(captured.download).toBe("fimmick-revenue-30d.csv");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:report");

    // Asserted on the bytes, not on `Blob.text()`: the decoder strips a leading BOM, so a
    // string comparison cannot tell a file that carries one from a file that does not.
    const bytes = new Uint8Array(await (captured.blob as Blob).arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);

    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("Week starting,Accepted quote value (HKD)");
    // Every loaded row, with machine-readable values.
    expect(text).toContain("2026-01-05,1240000");
    expect(text).toContain("2026-01-19,60000");
  });

  it("never claims a queue, and names the file it actually wrote", async () => {
    captureDownload();
    renderReports(rows);

    fireEvent.click(screen.getByRole("button", { name: /Export CSV/ }));

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledTimes(1));
    const message = String(toastSuccessMock.mock.calls[0][0]);
    expect(message).toContain("fimmick-revenue-30d.csv");
    expect(message).toMatch(/downloaded/i);
    expect(message).not.toMatch(/queue/i);
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("disables the control with a reason when the dataset is empty", () => {
    const captured = captureDownload();
    renderReports([]);

    const button = screen.getByRole("button", { name: /Export CSV/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    const reason = screen.getByText(/Nothing to export/i);
    // The reason is associated with the control, not merely near it.
    expect(button.getAttribute("aria-describedby")).toBe(reason.id);

    fireEvent.click(button);
    expect(captured.blob).toBeNull();
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it("opens on a real report rather than a blank area", () => {
    renderReports(rows);

    // §9.23: select a meaningful default report instead of rendering an empty report area.
    expect(screen.getByRole("tab", { name: "Revenue trend" }).getAttribute("data-state")).toBe(
      "active",
    );
    expect(screen.getAllByText("Revenue trend").length).toBeGreaterThan(1);
  });

  it("describes the chart in words for a reader who cannot see it", async () => {
    renderReports(rows);

    await screen.findByTestId("report-chart");
    const caption = document.querySelector("figcaption");
    expect(caption?.textContent).toContain("05 Jan 2026");
    expect(caption?.textContent).toContain("HKD 1,240,000");
    // Two weeks of data three weeks apart: the missing week is named, not smoothed over.
    expect(caption?.textContent).toMatch(/gaps/i);
    // Once in the visible note under the chart, once inside the caption above.
    expect(screen.getAllByText(/No value is inferred for them/i).length).toBeGreaterThan(0);
  });
});

describe("a report's shape decides whether a chart is drawn at all", () => {
  /**
   * `spec.shape` is read in exactly one place: the ternary in `src/routes/reports.tsx` that
   * chooses between `ReportTable` on its own and the `figure` wrapping `ReportChart`. Nothing
   * else in the app branches on it — `report-charts.tsx` keys off the report *id*, not the
   * shape, and is only ever reached from inside that branch.
   *
   * So `"table"` is the entire mechanism by which a family with no chartable measure avoids
   * `renderChart`'s `dataKey="count"` fallback, which draws an empty chart for any report
   * that is neither special-cased nor in possession of a `count` field. These cases render
   * the page and look, rather than trusting the spec table to mean what it says.
   *
   * Both lists are derived from `REPORT_SPECS`, so a report that changes shape simply moves
   * between them and these cases keep passing — deliberately. What they pin is the branch in
   * `reports.tsx`, not which family belongs on which side of it. *That* is pinned by
   * "tabulates the per-entity families" in `src/lib/__tests__/reports.test.ts`, which fails
   * if either of them is set back to "chart".
   */
  const tableReports = REPORT_IDS.filter((id) => REPORT_SPECS[id].shape === "table");
  const chartReports = REPORT_IDS.filter((id) => REPORT_SPECS[id].shape === "chart");

  /** One plausible row, shaped from the spec so it fits whatever fields a family declares. */
  const rowFor = (report: ReportId): Record<string, string | number | null> =>
    Object.fromEntries(
      REPORT_SPECS[report].fields.map((field) => {
        if (field.kind === "period") return [field.key, "2026-01-05"];
        if (field.kind === "status") return [field.key, "won"];
        if (field.kind === "label") return [field.key, "Row one"];
        return [field.key, 1];
      }),
    );

  it.each(tableReports)("renders %s as a table with no chart element", (report) => {
    search.report = report;
    renderReports([rowFor(report)]);

    expect(screen.queryByTestId("report-chart")).toBeNull();
    // Not a chart whose disclosure merely happens to be collapsed: there is no "behind this
    // chart" details element either, and the table is the primary view rather than a nested
    // one, so exactly one table is present.
    expect(screen.queryByText(/behind this chart/i)).toBeNull();
    expect(screen.getAllByRole("table")).toHaveLength(1);
  });

  it.each(chartReports)("still renders a chart for %s", (report) => {
    search.report = report;
    renderReports([rowFor(report)]);

    expect(screen.queryByTestId("report-chart")).not.toBeNull();
  });
});

describe("the report search param cannot drift from the report catalogue", () => {
  /**
   * `reportSearchSchema`'s `report` field used to be `z.enum(["revenue", "pipeline", ...])` —
   * five literals hand-copied from `ReportId`. Adding `human_review_workload` to the catalogue
   * compiled everywhere else and 404'd only here, because nothing forced the two lists to
   * agree. The fix derives the enum from `REPORT_IDS` itself; this test proves the derivation
   * actually holds by parsing every value `REPORT_IDS` currently contains, not a list retyped
   * by hand that would keep passing while the enum drifted again.
   */
  it("accepts every report id the catalogue exports", () => {
    const schema = Route.options.validateSearch as { parse: (input: unknown) => unknown };
    for (const id of REPORT_IDS) {
      const parsed = schema.parse({ range: "30d", report: id });
      expect(parsed).toMatchObject({ report: id });
    }
  });

  it("falls back to the default report for a value outside the catalogue", () => {
    // The search param must never throw on a bad URL - it lands on the default instead. This
    // is the behaviour the fix was required to preserve exactly.
    const schema = Route.options.validateSearch as { parse: (input: unknown) => unknown };
    const parsed = schema.parse({ range: "30d", report: "not-a-report" });
    expect(parsed).toMatchObject({ report: DEFAULT_REPORT });
  });
});

describe("the export label matches what the read model returns", () => {
  it("exports a complete result set, because the report queries are unpaginated", () => {
    // `loadReportDataset` runs one aggregate query per report and returns every row. If a
    // `limit` or `offset` is ever introduced there, the export becomes partial and the button
    // must say so — "Export loaded rows" — rather than implying the whole range.
    const source = readFileSync(
      resolve(process.cwd(), "src/server/read-models/operations.ts"),
      "utf8",
    );
    const reportQueries = source.slice(
      source.indexOf("const reportQueries"),
      source.indexOf("export async function loadReportDataset"),
    );

    expect(reportQueries.length).toBeGreaterThan(200);
    expect(reportQueries).not.toMatch(/\blimit\b/i);
    expect(reportQueries).not.toMatch(/\boffset\b/i);
  });
});
