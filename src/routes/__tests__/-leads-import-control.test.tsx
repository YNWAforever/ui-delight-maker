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
  Link: ({ to, children, ...rest }: { to: string; children?: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
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

describe("Import CSV reaches the importer", () => {
  it("is a live link to /leads/import, not a disabled control", () => {
    // It was disabled with the reason "Lead CSV import is not built yet", because no lead
    // import server function existed. Both endpoints now exist and the route is built, so
    // the disabled state and its reason would be the lie the disabled state used to prevent.
    renderLeads();

    const link = screen.getByRole("link", { name: /Import CSV/ });
    expect(link.getAttribute("href")).toBe("/leads/import");
    expect(screen.queryByRole("button", { name: /Import CSV/ })).toBeNull();
  });

  it("carries no claim that the capability is missing", () => {
    // The old control explained its own absence through `aria-describedby` and a `title` on
    // an ancestor. Neither may survive as stale text a screen reader or tooltip still reads.
    renderLeads();

    const link = screen.getByRole("link", { name: /Import CSV/ });
    expect(link.getAttribute("aria-describedby")).toBeNull();
    expect(link.closest("[title]")).toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(/not built yet|Nothing will be uploaded/i);
  });

  it("stays on screen next to the primary action", () => {
    renderLeads();

    expect(screen.queryByRole("link", { name: /Import CSV/ })).not.toBeNull();
  });
});
