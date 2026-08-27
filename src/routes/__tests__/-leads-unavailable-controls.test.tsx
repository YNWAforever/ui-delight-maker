// @vitest-environment jsdom

import type { ComponentType, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Lead } from "@/lib/types";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    fullPath: "/leads",
    useLoaderData: vi.fn(),
    useSearch: () => ({ page: 1, limit: 50 }),
  }),
  useNavigate: () => vi.fn(),
  useRouter: () => ({ invalidate: vi.fn(() => Promise.resolve()) }),
  Link: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Outlet: () => null,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));
vi.mock("@/lib/routing-utils", () => ({ useIsExactPath: () => true }));
vi.mock("@/server-functions/leads", () => ({
  getLeadsPage: vi.fn(),
  createLead: vi.fn(),
  updateLead: vi.fn(),
}));

import { Route } from "../leads";

const lead: Lead = {
  id: "lead-1",
  contact_id: null,
  account_id: null,
  source_campaign_id: null,
  campaign_member_id: null,
  company_name: "Northstar",
  contact_name: "Ada",
  contact_email: "ada@northstar.test",
  contact_phone: null,
  source: "website",
  status: "new",
  assigned_to: null,
  lead_score: 40,
  qualification_data: null,
  enquiry_text: null,
  created_at: "2026-08-01T09:00:00.000Z",
  updated_at: "2026-08-01T09:00:00.000Z",
};

function renderLeads() {
  vi.mocked(Route.useLoaderData).mockReturnValue({
    items: [lead],
    total: 1,
    page: 1,
    limit: 50,
  } as never);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Component = Route.options.component as ComponentType;
  return render(
    <QueryClientProvider client={queryClient}>
      <Component />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Import CSV is unavailable, and explains itself", () => {
  it("is disabled rather than a live button that does nothing", () => {
    // It used to `toast.message("CSV import is mocked in this prototype.")`. There is no lead
    // import server function anywhere, so a live control is a lie the user only discovers
    // after preparing a file.
    renderLeads();

    const button = screen.getByRole("button", { name: /Import CSV/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("carries a reason a screen reader can reach, naming what will not happen", () => {
    // A disabled control with no explanation is its own defect: the reader is left to guess
    // whether they lack permission, picked the wrong row, or the feature does not exist.
    renderLeads();

    const button = screen.getByRole("button", { name: /Import CSV/ });
    const describedBy = button.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();

    const reason = document.getElementById(describedBy as string);
    expect(reason).not.toBeNull();
    // Not merely "unavailable" — it says the capability does not exist yet AND that pressing
    // it would upload nothing, which is the part that stops someone waiting for an import.
    expect(reason?.textContent ?? "").toMatch(/not built yet/i);
    expect(reason?.textContent ?? "").toMatch(/Nothing will be uploaded/i);
  });

  it("puts the pointer explanation somewhere a disabled button cannot swallow", () => {
    // Buttons in this design system carry `disabled:pointer-events-none`, so a `title` on the
    // button itself never produces a tooltip. It has to sit on an ancestor that still
    // receives the hover, or the mouse user gets a dead control and no text at all.
    renderLeads();

    const button = screen.getByRole("button", { name: /Import CSV/ });
    const titled = button.closest("[title]");
    expect(titled).not.toBeNull();
    expect(titled).not.toBe(button);
    expect(titled?.getAttribute("title") ?? "").toMatch(/not built yet/i);
  });

  it("stays on screen instead of disappearing", () => {
    // Hiding it would remove the defect from view without telling anyone the capability is
    // planned — the absence is the thing the user needs told.
    renderLeads();

    expect(screen.queryByRole("button", { name: /Import CSV/ })).not.toBeNull();
  });
});
