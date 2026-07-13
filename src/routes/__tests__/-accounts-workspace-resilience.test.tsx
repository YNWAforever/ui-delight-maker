// @vitest-environment jsdom

import type { ComponentType, ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CompanyWorkspaceCore } from "@/server/company-workspace/types";

const sectionHook = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-company-workspace-section", () => ({
  useCompanyWorkspaceSection: sectionHook,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute:
    () =>
    (options: unknown): { options: unknown; useLoaderData: ReturnType<typeof vi.fn> } => ({
      options,
      useLoaderData: vi.fn(),
    }),
  Link: ({ children }: { children?: ReactNode }) => <a href="#">{children}</a>,
}));

import { Route } from "../accounts.$id";

const core = {
  company: {
    id: "account-1",
    name: "Northstar Media",
    domain: "northstar.example",
    industry: "Marketing",
    tier: "mid-market",
    account_owner: null,
    lifecycle_stage: "active_client",
    cs_owner: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-07-13T00:00:00.000Z",
  },
  ownership: { accountOwnerId: null, csOwnerId: null },
  contacts: [
    {
      id: "contact-1",
      account_id: "account-1",
      name: "Jordan Lee",
      title: "Marketing Director",
      department: "Marketing",
      email: "jordan@northstar.example",
      phone: null,
      whatsapp: null,
      linkedin_url: null,
      preferred_channel: "email",
      relationship_role: "decision_maker",
      influence_level: "high",
      sentiment: "positive",
      relationship_strength: "strong",
      is_primary: true,
      active: true,
      notes: null,
      last_contacted_at: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-07-13T00:00:00.000Z",
    },
  ],
} satisfies CompanyWorkspaceCore;
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  sectionHook.mockReset();
});

describe("Company Workspace resilience", () => {
  it("keeps core and healthy section content usable when Activity fails", async () => {
    const sections = {
      commercial: {
        data: {
          status: "ready",
          data: {
            clients: [
              {
                id: "client-1",
                company_name: "Northstar Retainer",
                health_score: 92,
                renewal_date: "2027-01-01",
              },
            ],
            engagements: [],
            leads: [
              {
                id: "lead-1",
                contact_name: "Qualified opportunity",
                company_name: "Northstar Media",
                source: "Referral",
                status: "qualified",
              },
            ],
            quotes: [
              {
                id: "quote-1",
                number: "Q-100",
                total_value: 1000,
                currency: "HKD",
              },
            ],
          },
        },
        isLoading: false,
        refetch: vi.fn(),
      },
      delivery_finance: {
        data: {
          status: "ready",
          data: {
            tasks: [],
            jobSheets: [
              {
                id: "sheet-1",
                quote_id: "quote-1",
                number: "JS-100",
                status: "accepted",
                total_amount: 1000,
                currency: "HKD",
                xero_customer_reference: null,
              },
            ],
          },
        },
        isLoading: false,
        refetch: vi.fn(),
      },
      activity: {
        data: {
          status: "error",
          error: {
            code: "schema_mismatch",
            requestId: "request-activity",
            retryable: false,
            section: "activity",
          },
        },
        isLoading: false,
        refetch: vi.fn(),
      },
      intelligence: {
        data: { status: "ready", data: { signals: [] } },
        isLoading: false,
        refetch: vi.fn(),
      },
    };

    sectionHook.mockImplementation(
      (_accountId: string, section: keyof typeof sections) => sections[section],
    );
    vi.spyOn(Route, "useLoaderData").mockReturnValue(core);

    const AccountDetailRoute = Route.options.component as ComponentType;
    render(<AccountDetailRoute />);

    expect(screen.getByText("Northstar Media")).toBeTruthy();
    expect(screen.getByText("Account owner")).toBeTruthy();
    expect(screen.getAllByText("Unassigned").length).toBeGreaterThan(0);
    expect(screen.getByText("Northstar Retainer")).toBeTruthy();

    await userEvent.click(screen.getByRole("tab", { name: "People" }));
    expect(screen.getByText("Jordan Lee")).toBeTruthy();

    await userEvent.click(screen.getByRole("tab", { name: "Commercial" }));
    expect(screen.getByText("Qualified opportunity")).toBeTruthy();
    expect(screen.getByText(/Reference request-activity/)).toBeTruthy();
    expect(screen.queryByText("No approval or campaign activity yet.")).not.toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry section" })).not.toBeTruthy();

    await userEvent.click(screen.getByRole("tab", { name: "Activity" }));
    expect(screen.getByText(/Reference request-activity/)).toBeTruthy();
    expect(screen.getByText("Northstar Media")).toBeTruthy();

    await userEvent.click(screen.getByRole("tab", { name: "Delivery & Finance" }));
    expect(screen.getByText("Quote Q-100")).toBeTruthy();
  });
  it("keeps healthy Activity and Delivery content visible when Commercial fails", async () => {
    const sections = {
      commercial: {
        data: {
          status: "error",
          error: {
            code: "schema_mismatch",
            requestId: "request-commercial",
            retryable: false,
            section: "commercial",
          },
        },
        isLoading: false,
        refetch: vi.fn(),
      },
      delivery_finance: {
        data: {
          status: "ready",
          data: {
            tasks: [
              {
                id: "task-1",
                title: "Healthy delivery task",
                status: "open",
                due_date: null,
              },
            ],
            jobSheets: [],
          },
        },
        isLoading: false,
        refetch: vi.fn(),
      },
      activity: {
        data: {
          status: "ready",
          data: {
            timeline: [
              {
                id: "timeline-1",
                kind: "campaign",
                title: "Healthy campaign activity",
                detail: "Campaign remained available",
                occurred_at: "2026-07-13T00:00:00.000Z",
              },
            ],
          },
        },
        isLoading: false,
        refetch: vi.fn(),
      },
      intelligence: {
        data: { status: "ready", data: { signals: [] } },
        isLoading: false,
        refetch: vi.fn(),
      },
    };

    sectionHook.mockImplementation(
      (_accountId: string, section: keyof typeof sections) => sections[section],
    );
    vi.spyOn(Route, "useLoaderData").mockReturnValue(core);

    const AccountDetailRoute = Route.options.component as ComponentType;
    render(<AccountDetailRoute />);
    await userEvent.click(screen.getByRole("tab", { name: "Commercial" }));

    expect(screen.getByText(/Reference request-commercial/)).toBeTruthy();
    expect(screen.getByText("Healthy campaign activity")).toBeTruthy();
    expect(screen.getByText("Healthy delivery task")).toBeTruthy();
  });

  it("keeps healthy Commercial context visible when Delivery fails", async () => {
    const sections = {
      commercial: {
        data: {
          status: "ready",
          data: {
            clients: [
              {
                id: "client-1",
                company_name: "Northstar Retainer",
                health_score: 92,
                renewal_date: "2027-01-01",
              },
            ],
            engagements: [
              {
                id: "engagement-1",
                status: "active",
                renewal_date: "2027-01-01",
              },
            ],
            leads: [],
            quotes: [],
          },
        },
        isLoading: false,
        refetch: vi.fn(),
      },
      delivery_finance: {
        data: {
          status: "error",
          error: {
            code: "schema_mismatch",
            requestId: "request-delivery",
            retryable: false,
            section: "delivery_finance",
          },
        },
        isLoading: false,
        refetch: vi.fn(),
      },
      activity: {
        data: { status: "empty", data: { timeline: [] } },
        isLoading: false,
        refetch: vi.fn(),
      },
      intelligence: {
        data: { status: "ready", data: { signals: [] } },
        isLoading: false,
        refetch: vi.fn(),
      },
    };

    sectionHook.mockImplementation(
      (_accountId: string, section: keyof typeof sections) => sections[section],
    );
    vi.spyOn(Route, "useLoaderData").mockReturnValue(core);

    const AccountDetailRoute = Route.options.component as ComponentType;
    render(<AccountDetailRoute />);
    await userEvent.click(screen.getByRole("tab", { name: "Delivery & Finance" }));

    expect(screen.getAllByText("Linked clients").length).toBeGreaterThan(0);
    expect(screen.getByText("Active engagements")).toBeTruthy();
    expect(screen.getAllByText(/Reference request-delivery/).length).toBeGreaterThan(0);
  });
});
