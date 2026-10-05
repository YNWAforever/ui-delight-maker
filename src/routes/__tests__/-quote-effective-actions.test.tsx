// @vitest-environment jsdom
import type { ComponentType, ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const updateQuoteMock = vi.hoisted(() => vi.fn());
const state = vi.hoisted(() => ({
  role: "admin",
  capabilities: undefined as string[] | undefined,
  status: "approved",
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    fullPath: "/quotes/$id",
    useLoaderData: () => ({
      quote: {
        id: "quote-1",
        number: "Q-TEST",
        status: state.status,
        line_items: [
          {
            id: "item-1",
            service: "Synthetic service",
            description: "",
            qty: 1,
            unit_price: 100,
            quote_id: "quote-1",
            total: 100,
            sort_order: 0,
            created_at: "2026-09-30",
            updated_at: "2026-09-30",
            product_id: null,
            taxable: false,
          },
        ],
        total_value: 100,
        currency: "HKD",
        created_at: "2026-09-30",
        client_id: null,
        lead_id: null,
      },
      client: null,
      lead: null,
      capabilities: state.capabilities,
    }),
    useSearch: () => ({}),
    useRouteContext: () => ({ profile: { role: state.role } }),
  }),
  useNavigate: () => vi.fn(),
  useRouter: () => ({ invalidate: vi.fn() }),
  Link: ({ children }: { children?: ReactNode }) => <a>{children}</a>,
}));
vi.mock("@tanstack/react-query", () => ({
  // dataUpdatedAt is always a number in TanStack Query: the fetch time, here "now".
  useQuery: ({ initialData }: { initialData?: unknown }) => ({
    data: initialData,
    dataUpdatedAt: Date.now(),
    isFetching: false,
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/server-functions/quote-workspace", () => ({
  getQuoteDetailRead: vi.fn(),
  getQuoteDocumentRead: vi.fn(),
  getQuoteVersionsSection: vi.fn(),
}));
vi.mock("@/server-functions/quotes", () => ({
  acceptQuoteAndCreateJobSheet: vi.fn(),
  approveQuote: vi.fn(),
  createQuoteRevision: vi.fn(),
  issueQuoteVersion: vi.fn(),
  rejectQuote: vi.fn(),
  requestQuoteApproval: vi.fn(),
  updateQuote: updateQuoteMock,
}));
vi.mock("@/components/sales", () => ({
  WorkspaceHeader: ({
    primaryAction,
    status,
  }: {
    primaryAction?: ReactNode;
    status?: ReactNode;
  }) => (
    <header>
      {status}
      {primaryAction}
    </header>
  ),
  ActivityTimeline: () => null,
  EmptyWorkspaceState: () => null,
  ErrorState: () => null,
  LoadingSkeleton: () => null,
  SectionHeader: () => null,
  StaleDataIndicator: ({ updatedAt }: { updatedAt: string }) => (
    <time aria-label="Freshness" dateTime={updatedAt} />
  ),
  StatusBadge: () => null,
  StickyActionBar: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
import { Route } from "../quotes.$id";
import { QuoteCommercialPatchSchema } from "@/lib/operations/input-schemas";
afterEach(cleanup);
function draw(role: string, capabilities: string[] | undefined, status = "approved") {
  Object.assign(state, { role, capabilities, status });
  const Component = Route.options.component as ComponentType;
  render(<Component />);
}
describe("quote action controls use server-evaluated capabilities", () => {
  it("disables issue for an admin with an effective deny", () => {
    draw("admin", []);
    expect(
      screen.getAllByText("You do not have permission to issue this quote.").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/requires administrator access/)).toBeNull();
    for (const button of screen.getAllByRole("button", { name: "Issue quote" })) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
  });
  it("enables issue for sales with an effective scoped allow", () => {
    draw("sales", ["quotes.issue"]);
    for (const button of screen.getAllByRole("button", { name: "Issue quote" })) {
      expect((button as HTMLButtonElement).disabled).toBe(false);
    }
  });
  it("fails closed when action capabilities are absent", () => {
    draw("admin", undefined);
    expect(
      (screen.getAllByRole("button", { name: "Issue quote" })[0] as HTMLButtonElement).disabled,
    ).toBe(true);
  });
  it("keeps denied draft commercials read-only", () => {
    draw("admin", [], "draft");
    expect(screen.queryByRole("spinbutton", { name: "Quantity for Synthetic service" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save draft" })).toBeNull();
  });
  it("offers permitted draft edits while disabling submission without its capability", () => {
    draw("sales", ["quotes.update"], "draft");
    expect(screen.getByRole("spinbutton", { name: "Quantity for Synthetic service" })).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Save & Request Approval" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});

describe("persisted quote commercial round trip", () => {
  it("saves an enriched database line item as a valid strict commercial input", async () => {
    updateQuoteMock.mockReset();
    updateQuoteMock.mockResolvedValue({});
    draw("sales", ["quotes.update"], "draft");
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(updateQuoteMock).toHaveBeenCalledOnce());
    const patch = updateQuoteMock.mock.calls[0][0].data.updates;
    expect(QuoteCommercialPatchSchema.safeParse(patch).success).toBe(true);
    expect(patch.line_items[0]).toEqual({
      id: "item-1",
      service: "Synthetic service",
      description: "",
      qty: 1,
      unit_price: 100,
    });
  });
});

describe("quote freshness", () => {
  it("reports when the page fetched the quote, not when the quote was last edited", () => {
    // UX-19: the quote's own updated_at made almost every quote read "Out of date".
    const before = Date.now();
    draw("sales", ["quotes.view"]);

    const fetchedAt = Date.parse(screen.getByLabelText("Freshness").getAttribute("dateTime") ?? "");
    expect(fetchedAt).toBeGreaterThanOrEqual(before - 1000);
    expect(fetchedAt).toBeLessThanOrEqual(Date.now());
  });
});
