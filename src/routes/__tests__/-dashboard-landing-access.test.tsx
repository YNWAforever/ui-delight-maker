// @vitest-environment jsdom

import type { ComponentType, ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    useLoaderData: vi.fn(),
  }),
  Link: ({ children, to }: { children?: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => vi.fn(),
  useRouter: () => ({ invalidate: vi.fn() }),
}));
vi.mock("@/components/sales", () => ({
  EmptyWorkspaceState: ({ title }: { title: string }) => <p>{title}</p>,
  MetricStrip: () => null,
  SectionHeader: () => null,
  WorkspaceHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/components/pipeline/pipeline-toolbar", () => ({ PipelineToolbar: () => null }));
vi.mock("@/components/pipeline/stage-move-dialog", () => ({ StageMoveDialog: () => null }));
vi.mock("@/components/pipeline/won-conversion-dialog", () => ({ WonConversionDialog: () => null }));
vi.mock("@/components/dashboard/dashboard-insights", () => ({ DashboardInsights: () => null }));
vi.mock("@/server-functions/dashboard", () => ({ getDashboardRead: vi.fn() }));
vi.mock("@/server-functions/leads", () => ({
  moveLeadStage: vi.fn(),
  triggerLeadAgent: vi.fn(),
  triggerLeadReplyDraft: vi.fn(),
}));
vi.mock("@/server-functions/quotes", () => ({ triggerQuoteAgent: vi.fn() }));
vi.mock("@/server-functions/tasks", () => ({ createTask: vi.fn() }));

import { Route } from "../index";

function renderLanding(access: {
  leads: boolean;
  jobSheets: boolean;
  tasks: boolean;
  approvals: boolean;
  quotes: boolean;
}) {
  vi.mocked(Route.useLoaderData).mockReturnValue({
    access,
    jobSheets: [],
  } as never);
  const Component = Route.options.component as ComponentType;
  render(<Component />);
}

afterEach(cleanup);

describe("Today landing navigation", () => {
  it("shows only the task queue for a task-only actor", () => {
    renderLanding({
      leads: false,
      jobSheets: false,
      tasks: true,
      approvals: false,
      quotes: false,
    });

    expect(screen.getByRole("link", { name: "Tasks" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "All job sheets" })).not.toBeTruthy();
    expect(screen.queryByRole("link", { name: "Approvals" })).not.toBeTruthy();
    expect(screen.queryByRole("link", { name: "Quotes" })).not.toBeTruthy();
    expect(screen.queryByText("No visible job sheets")).not.toBeTruthy();
  });

  it("offers a quote-only actor the Quotes queue without unrelated links", () => {
    renderLanding({
      leads: false,
      jobSheets: false,
      tasks: false,
      approvals: false,
      quotes: true,
    });

    expect(screen.getByRole("link", { name: "Quotes" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "All job sheets" })).not.toBeTruthy();
    expect(screen.queryByRole("link", { name: "Tasks" })).not.toBeTruthy();
    expect(screen.queryByRole("link", { name: "Approvals" })).not.toBeTruthy();
  });
});
