// @vitest-environment jsdom

/**
 * Write safety for Account 360.
 *
 * Three defects this file exists to keep fixed, all of them user-visible:
 *
 * 1. "Run intelligence" toasted success whenever the call resolved. The server answers
 *    `{ triggered: false, reason: "missing_webhook" }` rather than throwing when its webhook
 *    URL is unset, so the page promised an agent run that never started.
 * 2. Its catch arm toasted `error.message`, which re-emitted the raw n8n dispatch error and
 *    any Neon driver text — including Postgres strings that name a table or a database role.
 * 3. Both writes invalidated the `overview` and `intelligence` keys and never `activity`,
 *    which is the tab a reader opens to check the thing just happened. `intelligence` had no
 *    consumer at all, so one of the two keys they did invalidate was dead.
 */

import type { ComponentType, ReactNode } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { crmQueryKeys } from "@/lib/query-keys";
import type { CompanyWorkspaceCore } from "@/server/company-workspace/types";

const sectionHook = vi.hoisted(() => vi.fn());
const triggerRelationshipIntelligence = vi.hoisted(() => vi.fn());
const dismissRelationshipSignalFn = vi.hoisted(() => vi.fn());
const createAccountContact = vi.hoisted(() => vi.fn());
const updateAccountContact = vi.hoisted(() => vi.fn());
const invalidateQueries = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const routerInvalidate = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const toastCalls = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  message: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: toastCalls }));

vi.mock("@/hooks/use-company-workspace-section", () => ({
  COMPANY_WORKSPACE_STALE_TIME_MS: 30_000,
  useCompanyWorkspaceSection: sectionHook,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ initialData }: { initialData: unknown }) => ({
    data: initialData,
    isFetching: false,
    dataUpdatedAt: 0,
    refetch: vi.fn(),
  }),
  useQueryClient: () => ({ getQueryData: vi.fn(), invalidateQueries }),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    fullPath: "/accounts/$id",
    useLoaderData: vi.fn(),
    useSearch: vi.fn(() => ({})),
  }),
  Link: ({ to, children }: { to?: string; children?: ReactNode }) => <a href={to}>{children}</a>,
  useNavigate: () => vi.fn(),
  useRouter: () => ({ invalidate: routerInvalidate }),
}));

vi.mock("@/server-functions/accounts", () => ({ triggerRelationshipIntelligence }));
vi.mock("@/server-functions/relationship-signals", () => ({ dismissRelationshipSignalFn }));
vi.mock("@/server-functions/contacts", () => ({ createAccountContact, updateAccountContact }));
vi.mock("@/server-functions/company-workspace", () => ({ getCompanyWorkspaceRead: vi.fn() }));

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
  contacts: [],
} satisfies CompanyWorkspaceCore;

const openSignal = {
  id: "signal-1",
  account_id: "account-1",
  signal_type: "missing_champion" as const,
  severity: "high" as const,
  title: "No champion identified",
  reason: "Nobody advocates for this renewal.",
  suggested_action: "Nominate a champion.",
  source: "deterministic" as const,
  dedupe_key: "account-1:missing_champion",
  dismissed_at: null,
  dismissed_by: null,
  dismissal_reason: null,
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
};

const workspaceRead = {
  requestId: "request-overview",
  core,
  overview: {
    status: "ready" as const,
    data: {
      linkedClientCount: 1,
      activeEngagementCount: 0,
      quoteCount: 1,
      quoteTotals: [{ currency: "HKD", quoteCount: 1, totalValue: 1000 }],
      openSignalCount: 1,
      openSignals: [openSignal],
    },
  },
  sections: {},
  cache: {
    core: { fetchedAt: "2026-07-13T00:00:00.000Z", freshForMs: 30_000 },
    overview: { fetchedAt: "2026-07-13T00:00:00.000Z", freshForMs: 30_000 },
    sections: {},
  },
};

const contact = {
  id: "contact-1",
  account_id: "account-1",
  name: "Jordan Lee",
  title: "Marketing Director",
  department: null,
  email: "jordan@northstar.example",
  phone: null,
  whatsapp: null,
  linkedin_url: null,
  preferred_channel: "email" as const,
  relationship_role: "decision_maker" as const,
  influence_level: "high" as const,
  sentiment: "positive" as const,
  relationship_strength: "strong" as const,
  is_primary: true,
  active: true,
  notes: null,
  last_contacted_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-07-13T00:00:00.000Z",
};

function renderAccount(options: { tab?: string; contacts?: (typeof contact)[] } = {}) {
  sectionHook.mockReturnValue({
    data: undefined,
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  });
  vi.mocked(Route.useSearch).mockReturnValue((options.tab ? { tab: options.tab } : {}) as never);
  vi.spyOn(Route, "useLoaderData").mockReturnValue({
    ...workspaceRead,
    core: { ...core, contacts: options.contacts ?? [] },
  } as never);
  const Component = Route.options.component as ComponentType;
  return render(<Component />);
}

/** Types into a controlled input the way React's own change handler expects. */
function typeInto(input: HTMLElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Every key the queryClient was asked to invalidate, flattened for containment checks. */
function invalidatedKeys(): string[] {
  return invalidateQueries.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey));
}

const runIntelligence = async () => {
  const button = screen.getByRole("button", { name: /run intelligence/i });
  await act(async () => {
    button.click();
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  invalidateQueries.mockResolvedValue(undefined);
  routerInvalidate.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Account 360 relationship intelligence", () => {
  it("reports a dispatch that never happened as a failure", async () => {
    // The sentinel the six trigger server functions return instead of throwing.
    triggerRelationshipIntelligence.mockResolvedValue({
      triggered: false,
      reason: "missing_webhook",
    });
    renderAccount();

    await runIntelligence();

    expect(toastCalls.success).not.toHaveBeenCalled();
    expect(toastCalls.error).toHaveBeenCalledWith(
      "This agent is not connected yet, so nothing was started.",
    );
    // Nothing ran, so nothing may be refreshed as if it had.
    expect(invalidateQueries).not.toHaveBeenCalled();
    expect(routerInvalidate).not.toHaveBeenCalled();
  });

  it("says so when a run is already in flight, and does not claim to have started one", async () => {
    triggerRelationshipIntelligence.mockResolvedValue({
      triggered: false,
      reason: "already_running",
    });
    renderAccount();

    await runIntelligence();

    expect(toastCalls.success).not.toHaveBeenCalled();
    expect(toastCalls.message).toHaveBeenCalledWith(
      "Relationship intelligence is already running for this account.",
    );
  });

  it("refreshes Activity as well as Overview and Signals once a run really starts", async () => {
    triggerRelationshipIntelligence.mockResolvedValue({ triggered: true, run: { id: "run-1" } });
    renderAccount();

    await runIntelligence();

    expect(toastCalls.success).toHaveBeenCalledWith("Relationship intelligence started");
    const keys = invalidatedKeys();
    // Activity is the tab the run's own timeline entries land in, and was never invalidated.
    expect(keys).toContain(
      JSON.stringify(crmQueryKeys.companyWorkspace.section("account-1", "activity")),
    );
    expect(keys).toContain(
      JSON.stringify(crmQueryKeys.companyWorkspace.section("account-1", "overview")),
    );
    expect(keys).toContain(
      JSON.stringify(crmQueryKeys.companyWorkspace.section("account-1", "intelligence")),
    );
    // The accounts index carries an open-signal count per account.
    expect(keys).toContain(JSON.stringify(crmQueryKeys.accounts.lists()));
    // The route is loader-direct as well as query-backed, so the loader read and the
    // document title need the router (PC-4). This file had no router.invalidate at all.
    expect(routerInvalidate).toHaveBeenCalledTimes(1);
    const filter = routerInvalidate.mock.calls[0][0].filter as (m: { routeId: string }) => boolean;
    expect(filter({ routeId: "/accounts/$id" })).toBe(true);
    expect(filter({ routeId: "/leads" })).toBe(false);
  });

  it("never puts a thrown database message in front of a user", async () => {
    triggerRelationshipIntelligence.mockRejectedValue(
      new Error("permission denied for table accounts at character 21"),
    );
    renderAccount();

    await runIntelligence();

    expect(toastCalls.success).not.toHaveBeenCalled();
    const message = String(toastCalls.error.mock.calls.at(-1)?.[0]);
    expect(message).not.toMatch(/permission denied/i);
    expect(message).not.toMatch(/accounts/);
    expect(message).toBe("Something went wrong. Please try again.");
  });

  it("locks the control while the dispatch is in flight", async () => {
    let release: (value: unknown) => void = () => {};
    triggerRelationshipIntelligence.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    renderAccount();

    const button = screen.getByRole("button", { name: /run intelligence/i }) as HTMLButtonElement;
    act(() => button.click());

    await waitFor(() => expect(button.disabled).toBe(true));
    act(() => button.click());
    expect(triggerRelationshipIntelligence).toHaveBeenCalledTimes(1);

    await act(async () => {
      release({ triggered: true });
    });
  });
});

describe("Account 360 signal dismissal", () => {
  const openDismissDialog = async () => {
    renderAccount();
    const dismiss = screen.getByRole("button", { name: "Dismiss" });
    await act(async () => {
      dismiss.click();
    });
    const reason = await screen.findByLabelText("Dismissal reason");
    typeInto(reason, "Champion identified offline");
    return screen.getByRole("button", { name: "Dismiss signal" });
  };

  it("refreshes Activity after a dismissal, which is where the dismissal shows up", async () => {
    dismissRelationshipSignalFn.mockResolvedValue({ id: "signal-1" });
    const confirm = await openDismissDialog();

    await act(async () => {
      confirm.click();
    });

    expect(dismissRelationshipSignalFn).toHaveBeenCalledWith({
      data: { id: "signal-1", reason: "Champion identified offline" },
    });
    expect(toastCalls.success).toHaveBeenCalledWith("Signal dismissed");
    const keys = invalidatedKeys();
    expect(keys).toContain(
      JSON.stringify(crmQueryKeys.companyWorkspace.section("account-1", "activity")),
    );
    expect(routerInvalidate).toHaveBeenCalledTimes(1);
  });

  it("reports a refused dismissal without leaking the refusal's own text", async () => {
    dismissRelationshipSignalFn.mockRejectedValue(
      new Error('null value in column "dismissal_reason" violates not-null constraint'),
    );
    const confirm = await openDismissDialog();

    await act(async () => {
      confirm.click();
    });

    expect(toastCalls.success).not.toHaveBeenCalled();
    const message = String(toastCalls.error.mock.calls.at(-1)?.[0]);
    expect(message).not.toMatch(/dismissal_reason/);
    expect(message).toBe("Something went wrong. Please try again.");
  });
});

describe("Account 360 stakeholders", () => {
  it("names each coverage gap on its own, so a reader knows which one to close", () => {
    // Instruction §9.5 asks for "No decision-maker identified" / "No champion identified"
    // as explicit signals. One combined "Missing coverage: …" line read as a note about
    // the page rather than a finding about the account.
    renderAccount({ tab: "stakeholders", contacts: [] });

    expect(screen.getAllByText("No stakeholders recorded").length).toBeGreaterThan(0);
  });

  it("shows both gaps when a recorded stakeholder covers neither role", () => {
    renderAccount({
      tab: "stakeholders",
      contacts: [{ ...contact, relationship_role: "daily_user" as never }],
    });

    expect(screen.getByText("No decision-maker identified")).toBeTruthy();
    expect(screen.getByText("No champion identified")).toBeTruthy();
  });

  it("creates a stakeholder through the real server function and refreshes the account", async () => {
    // `createAccountContact` was exported and capability-checked with no UI caller at all.
    createAccountContact.mockResolvedValue({ id: "contact-2" });
    renderAccount({ tab: "stakeholders", contacts: [] });

    await act(async () => {
      screen.getByRole("button", { name: /add stakeholder/i }).click();
    });
    typeInto(await screen.findByLabelText("Name"), "Robin Cho");

    await act(async () => {
      screen.getByRole("button", { name: "Add stakeholder" }).click();
    });

    expect(createAccountContact).toHaveBeenCalledWith({
      data: {
        account_id: "account-1",
        name: "Robin Cho",
        title: null,
        email: null,
        phone: null,
      },
    });
    expect(toastCalls.success).toHaveBeenCalledWith("Stakeholder added");
    // Contacts arrive with the overview read, and the loader-owned title needs the router.
    expect(invalidatedKeys()).toContain(
      JSON.stringify(crmQueryKeys.companyWorkspace.section("account-1", "overview")),
    );
    expect(routerInvalidate).toHaveBeenCalledTimes(1);
  });

  it("refuses to submit a stakeholder with no name, and writes nothing", async () => {
    renderAccount({ tab: "stakeholders", contacts: [] });

    await act(async () => {
      screen.getByRole("button", { name: /add stakeholder/i }).click();
    });
    await screen.findByLabelText("Name");

    await act(async () => {
      screen.getByRole("button", { name: "Add stakeholder" }).click();
    });

    expect(createAccountContact).not.toHaveBeenCalled();
    expect(toastCalls.error).toHaveBeenCalledWith("A stakeholder name is required.");
    expect(toastCalls.success).not.toHaveBeenCalled();
  });

  it("edits an existing stakeholder through updateAccountContact", async () => {
    updateAccountContact.mockResolvedValue({ id: "contact-1" });
    renderAccount({ tab: "stakeholders", contacts: [contact] });

    await act(async () => {
      screen.getByRole("button", { name: "Edit Jordan Lee" }).click();
    });
    typeInto(await screen.findByLabelText("Name"), "Jordan Lee-Smith");

    await act(async () => {
      screen.getByRole("button", { name: "Save stakeholder" }).click();
    });

    expect(updateAccountContact).toHaveBeenCalledWith({
      data: {
        id: "contact-1",
        updates: {
          name: "Jordan Lee-Smith",
          title: "Marketing Director",
          email: "jordan@northstar.example",
          phone: null,
        },
      },
    });
    expect(toastCalls.success).toHaveBeenCalledWith("Stakeholder updated");
  });

  it("reports a denied stakeholder write without leaking the server's own words", async () => {
    createAccountContact.mockRejectedValue(
      new Error("insert into account_contacts violates foreign key constraint"),
    );
    renderAccount({ tab: "stakeholders", contacts: [] });

    await act(async () => {
      screen.getByRole("button", { name: /add stakeholder/i }).click();
    });
    typeInto(await screen.findByLabelText("Name"), "Robin Cho");

    await act(async () => {
      screen.getByRole("button", { name: "Add stakeholder" }).click();
    });

    expect(toastCalls.success).not.toHaveBeenCalled();
    const message = String(toastCalls.error.mock.calls.at(-1)?.[0]);
    expect(message).not.toMatch(/account_contacts/);
    expect(message).toBe("Something went wrong. Please try again.");
  });
});
