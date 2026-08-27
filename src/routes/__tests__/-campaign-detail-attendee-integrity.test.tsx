// @vitest-environment jsdom

import type { ComponentType, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { crmQueryKeys } from "@/lib/query-keys";

const followUpTasksMock = vi.hoisted(() => vi.fn());
const updateCampaignMock = vi.hoisted(() => vi.fn());
const workspaceReadMock = vi.hoisted(() => vi.fn());
const workspaceSectionMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());
const routerInvalidateMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());
const toastSuccessMock = vi.hoisted(() => vi.fn());
const useSearchMock = vi.hoisted(() => vi.fn());
const useRouteContextMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    fullPath: "/campaigns/$id",
    useLoaderData: vi.fn(),
    useSearch: useSearchMock,
    useRouteContext: useRouteContextMock,
  }),
  useNavigate: () => navigateMock,
  useRouter: () => ({ invalidate: routerInvalidateMock }),
  notFound: () => new Error("not found"),
  Link: ({ to, children }: { to: string; children?: ReactNode }) => <a href={to}>{children}</a>,
}));
vi.mock("sonner", () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock, message: vi.fn() },
}));
vi.mock("@/server-functions/campaigns", () => ({
  createCampaignFollowUpTasksFn: followUpTasksMock,
  updateCampaign: updateCampaignMock,
}));
vi.mock("@/server-functions/event-import", () => ({
  commitEventImportFn: vi.fn(),
  validateEventImportRowsFn: vi.fn(),
}));
vi.mock("@/server-functions/relationship-workspaces", () => ({
  getCampaignWorkspaceRead: workspaceReadMock,
  getCampaignWorkspaceSection: workspaceSectionMock,
}));

import { Route } from "../campaigns.$id";

const CAMPAIGN = {
  id: "campaign-1",
  name: "Spring Roadshow",
  type: "client_event" as const,
  status: "active" as const,
  objective: "Meet retail buyers",
  owner: "user-1",
  starts_at: "2026-07-01T00:00:00.000Z",
  ends_at: "2026-07-02T00:00:00.000Z",
  notes: null,
  created_at: "2026-06-01T00:00:00.000Z",
  updated_at: "2026-06-01T00:00:00.000Z",
};

const SUMMARY = {
  total: 120,
  attended: 90,
  highIntent: 12,
  openFollowUp: 40,
  converted: 7,
  unmatchedAccounts: 9,
  possibleDuplicates: 4,
  latestImportAt: "2026-07-03T09:00:00.000Z",
};

type Attendee = {
  id: string;
  contact_id: string | null;
  account_id: string | null;
  raw_company_name: string | null;
  raw_contact_name: string | null;
  raw_email: string | null;
  raw_phone: string | null;
  attendee_status: string;
  interests: string[];
  follow_up_status: string;
  conversion_outcome: string | null;
  created_at: string;
  duplicate_count?: number | string | null;
};

const makeAttendee = (overrides: Partial<Attendee> & Pick<Attendee, "id">): Attendee => ({
  contact_id: "contact-1",
  account_id: "account-1",
  raw_company_name: "Acme Retail",
  raw_contact_name: "Dana Lo",
  raw_email: "dana@acme.example",
  raw_phone: null,
  attendee_status: "attended",
  interests: [],
  follow_up_status: "task_created",
  conversion_outcome: "none",
  created_at: "2026-07-03T09:00:00.000Z",
  ...overrides,
});

/**
 * Four rows, one per state the list has to be able to tell apart:
 * matched-and-moving, matched-but-unpicked, matched-but-repeated, and unmatched.
 */
const ATTENDEES: Attendee[] = [
  makeAttendee({ id: "member-moving", raw_contact_name: "Dana Lo" }),
  makeAttendee({
    id: "member-waiting",
    raw_contact_name: "Ken Ho",
    follow_up_status: "not_started",
  }),
  makeAttendee({
    id: "member-repeat",
    raw_contact_name: "Mia Chan",
    duplicate_count: "2",
  }),
  makeAttendee({
    id: "member-unmatched",
    raw_contact_name: "Sam Ng",
    account_id: null,
    contact_id: null,
    raw_company_name: "Unknown Trading",
    follow_up_status: "not_started",
  }),
];

const SECTION = {
  members: ATTENDEES,
  total: 120,
  page: 1,
  limit: 50,
  importHistory: [
    {
      importedAt: "2026-07-03T00:00:00.000Z",
      lastImportedAt: "2026-07-03T09:00:00.000Z",
      attendeeCount: 120,
    },
  ],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  followUpTasksMock.mockReset();
  updateCampaignMock.mockReset();
  workspaceReadMock.mockReset();
  workspaceReadMock.mockResolvedValue({ campaign: CAMPAIGN, attendeeSummary: SUMMARY });
  workspaceSectionMock.mockReset();
  workspaceSectionMock.mockResolvedValue(SECTION);
  navigateMock.mockReset();
  navigateMock.mockResolvedValue(undefined);
  routerInvalidateMock.mockReset();
  routerInvalidateMock.mockResolvedValue(undefined);
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
  useSearchMock.mockReturnValue({ attendeePage: 1 });
  useRouteContextMock.mockReturnValue({ profile: { id: "user-1", role: "client_success" } });
  vi.mocked(Route.useLoaderData).mockReturnValue({
    campaign: CAMPAIGN,
    attendeeSummary: SUMMARY,
  } as never);
});

afterEach(cleanup);

async function renderDetail() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
  const Component = Route.options.component as ComponentType;
  render(
    <QueryClientProvider client={queryClient}>
      <Component />
    </QueryClientProvider>,
  );
  // The attendee section has no initialData, so it genuinely fetches on mount.
  await waitFor(() => expect(screen.getAllByText("Dana Lo").length).toBeGreaterThan(0));
  return { invalidateQueries };
}

/** The attendee table, as distinct from the card list rendering the same rows. */
const attendeeTable = () => screen.getByRole("table", { name: "Campaign attendees" });

const attendeeRow = (name: string) => {
  const row = within(attendeeTable())
    .getAllByRole("row")
    .find((candidate) => candidate.textContent?.includes(name));
  if (!row) throw new Error(`No attendee row for ${name}`);
  return row;
};

const invalidatedRouteIds = () =>
  routerInvalidateMock.mock.calls.map(([argument]) => {
    const filter = (argument as { filter: (match: { routeId: string }) => boolean }).filter;
    return ["/campaigns", "/campaigns/$id", "/accounts", "/"].filter((routeId) =>
      filter({ routeId }),
    );
  });

describe("attendee data quality is stated, not implied", () => {
  it("says Unmatched for an attendee that resolved to no account", async () => {
    /**
     * §9.11. The old cell printed the CSV company name in medium weight with "Awaiting
     * account match" underneath in muted 12px, so a broken row and a finished row differed
     * only by a subtitle nobody reads.
     */
    await renderDetail();

    expect(attendeeRow("Sam Ng").textContent).toContain("Unmatched");
    expect(attendeeRow("Dana Lo").textContent).toContain("Matched");
    expect(attendeeRow("Dana Lo").textContent).not.toContain("Unmatched");
  });

  it("marks a possible duplicate only when the campaign actually holds another copy", async () => {
    /**
     * IF-D2-21: `commitEventImport` inserts every row unconditionally, so re-uploading a
     * roster doubles it. The marker is driven by a campaign-wide window count, not by what
     * happens to be on this page — a second copy usually lands on a different page.
     */
    await renderDetail();

    expect(attendeeRow("Mia Chan").textContent).toContain("Possible duplicate");
    expect(attendeeRow("Dana Lo").textContent).not.toContain("Possible duplicate");
    expect(attendeeRow("Ken Ho").textContent).not.toContain("Possible duplicate");
  });

  it("reports campaign-wide data-quality counts, not the page's", async () => {
    await renderDetail();

    // 9 unmatched and 4 duplicates out of 120 attendees — none of which is derivable from
    // the four rows this page happens to hold.
    const banner = screen.getByText(/matched no account/i);
    expect(banner.textContent).toContain("9");
    expect(banner.textContent).toContain("4");
  });
});

describe("the follow-up queue", () => {
  it("holds only attendees nobody has picked up, unmatched first", async () => {
    await renderDetail();

    const queueItems = screen
      .getAllByRole("listitem")
      .filter((item) => item.textContent?.includes("Imported"));
    const names = queueItems.map((item) => item.textContent ?? "");

    // Unmatched outranks a merely-waiting row: AttentionQueue renders the caller's order
    // and never sorts, so the ordering rule has to hold here.
    expect(names[0]).toContain("Sam Ng");
    expect(names.some((text) => text.includes("Ken Ho"))).toBe(true);
    // Matched and already has a task, but it is a suspected repeat — so it is still a
    // decision waiting on a human.
    expect(names.some((text) => text.includes("Mia Chan"))).toBe(true);
    // Matched, has a task, and nothing suspect: listing it would be the queue crying wolf.
    expect(names.some((text) => text.includes("Dana Lo"))).toBe(false);
  });

  it("sends an unmatched attendee to Accounts and a matched one to its account", async () => {
    await renderDetail();

    const queueItems = screen
      .getAllByRole("listitem")
      .filter((item) => item.textContent?.includes("Imported"));
    const unmatched = queueItems.find((item) => item.textContent?.includes("Sam Ng"));
    const waiting = queueItems.find((item) => item.textContent?.includes("Ken Ho"));

    expect(
      within(unmatched as HTMLElement)
        .getByRole("link")
        .getAttribute("href"),
    ).toBe("/accounts");
    expect(
      within(waiting as HTMLElement)
        .getByRole("link")
        .getAttribute("href"),
    ).toBe("/accounts/account-1");
  });
});

describe("follow-up task generation", () => {
  it("refreshes the campaigns index as well as this campaign", async () => {
    /**
     * IF-D2-20(b). Neither mutation key set listed `campaigns.lists()`, so generating
     * follow-up tasks left `/campaigns` serving its cached index — and the parent loader,
     * which is what `Route.useLoaderData()` reads there, was never re-run either.
     */
    followUpTasksMock.mockResolvedValue({ createdTasks: 3, skippedMembers: 0 });
    const { invalidateQueries } = await renderDetail();

    fireEvent.click(screen.getByRole("button", { name: "Create follow-up tasks" }));
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled());

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: crmQueryKeys.campaigns.lists(),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: crmQueryKeys.campaigns.detail("campaign-1"),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: crmQueryKeys.tasks.lists() });
    expect(invalidatedRouteIds()).toEqual([["/campaigns"]]);
  });

  it("does not report work it did not do when every attendee already has a task", async () => {
    followUpTasksMock.mockResolvedValue({ createdTasks: 0, skippedMembers: 0 });
    await renderDetail();

    fireEvent.click(screen.getByRole("button", { name: "Create follow-up tasks" }));
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled());

    expect(toastSuccessMock).toHaveBeenCalledWith("Every attendee already has a follow-up task.");
  });

  it("reports a failure through the sanitiser and refreshes nothing", async () => {
    followUpTasksMock.mockRejectedValue(
      new Error("permission denied for table tasks at character 21"),
    );
    const { invalidateQueries } = await renderDetail();

    fireEvent.click(screen.getByRole("button", { name: "Create follow-up tasks" }));
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());

    const message = String(toastErrorMock.mock.calls[0][0]);
    expect(message).not.toMatch(/permission denied|character 21|table tasks/i);
    expect(invalidateQueries).not.toHaveBeenCalled();
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it("locks the control while the run is in flight", async () => {
    const pending = deferred<{ createdTasks: number; skippedMembers: number }>();
    followUpTasksMock.mockReturnValue(pending.promise);
    await renderDetail();

    fireEvent.click(screen.getByRole("button", { name: "Create follow-up tasks" }));
    await waitFor(() => {
      const button = screen.getByRole("button", { name: "Creating tasks…" }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    });
    fireEvent.click(screen.getByRole("button", { name: "Creating tasks…" }));

    expect(followUpTasksMock).toHaveBeenCalledTimes(1);
    pending.resolve({ createdTasks: 1, skippedMembers: 0 });
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled());
  });
});

describe("a failed background refresh is visible", () => {
  it("says the totals are stale instead of showing them as if they were current", async () => {
    /**
     * IF-D2-22. `initialData` means `workspaceQuery.data` is always defined, so a failed
     * refetch of the name, status and attendee counts was completely silent — and the one
     * moment those counts are being read is straight after an import.
     *
     * Rendered without the invalidateQueries spy so the refetch this triggers is real.
     */
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const Component = Route.options.component as ComponentType;
    render(
      <QueryClientProvider client={queryClient}>
        <Component />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getAllByText("Dana Lo").length).toBeGreaterThan(0));

    workspaceReadMock.mockRejectedValue(new Error('relation "campaigns" does not exist'));
    await queryClient.invalidateQueries({
      queryKey: crmQueryKeys.campaigns.detail("campaign-1"),
    });

    const alert = await screen.findByText("These campaign totals could not be refreshed");
    const banner = alert.closest('[role="alert"]') as HTMLElement;
    expect(banner.textContent).toContain("last ones that loaded successfully");
    // The thrown text names a table. It must not survive into the page.
    expect(banner.textContent).not.toMatch(/relation|does not exist/i);
  });
});

describe("attendee paging", () => {
  it("writes the page into the URL rather than component state", async () => {
    // IF-D2-23: a refresh, a shared link or Back silently returned the reader to page 1.
    await renderDetail();

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));

    const updater = navigateMock.mock.calls.at(-1)?.[0].search as (
      current: Record<string, unknown>,
    ) => Record<string, unknown>;
    expect(updater({ attendeePage: 1 })).toEqual({ attendeePage: 2 });
  });

  it("asks the server for the page the URL names", async () => {
    useSearchMock.mockReturnValue({ attendeePage: 3 });
    await renderDetail();

    expect(workspaceSectionMock).toHaveBeenCalledWith({
      data: { campaignId: "campaign-1", page: 3, limit: 50 },
    });
  });
});

describe("editing a campaign", () => {
  it("reaches updateCampaign and refreshes the detail and the index", async () => {
    /**
     * FW-5. `updateCampaign` was exported and capability-checked with no caller anywhere,
     * so a campaign's status and dates were write-once at creation — it could never be
     * marked completed, which is the state the follow-up flow is meant to end in.
     */
    updateCampaignMock.mockResolvedValue(CAMPAIGN);
    const { invalidateQueries } = await renderDetail();

    fireEvent.click(screen.getByRole("button", { name: /edit campaign/i }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Spring Roadshow 2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Save campaign" }));

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith("Campaign updated"));

    expect(updateCampaignMock).toHaveBeenCalledTimes(1);
    const payload = updateCampaignMock.mock.calls[0][0].data as {
      id: string;
      updates: Record<string, unknown>;
    };
    expect(payload.id).toBe("campaign-1");
    expect(payload.updates.name).toBe("Spring Roadshow 2026");
    // No assignable-owner read exists, so the edit form must not offer to write one.
    expect(payload.updates).not.toHaveProperty("owner");
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: crmQueryKeys.campaigns.lists(),
    });
    expect(invalidatedRouteIds()).toEqual([["/campaigns"]]);
  });

  it("reports a failed save without leaking the thrown text and keeps the form open", async () => {
    updateCampaignMock.mockRejectedValue(new Error("You do not have this capability"));
    await renderDetail();

    fireEvent.click(screen.getByRole("button", { name: /edit campaign/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save campaign" }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save campaign" })).toBeTruthy();
  });

  it("is disabled with a reason for a role that cannot manage campaigns", async () => {
    useRouteContextMock.mockReturnValue({ profile: { id: "user-2", role: "sales" } });
    await renderDetail();

    const button = screen.getByRole("button", {
      name: /edit campaign/i,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText("Editing campaigns is not part of your role.")).toBeTruthy();
  });
});
