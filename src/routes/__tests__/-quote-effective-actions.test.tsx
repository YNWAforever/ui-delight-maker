// @vitest-environment jsdom
import type { ComponentType, ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
          { id: "item-1", service: "Synthetic service", description: "", qty: 1, unit_price: 100 },
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
  useQuery: ({ initialData }: { initialData?: unknown }) => ({
    data: initialData,
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
  updateQuote: vi.fn(),
}));
vi.mock("@/components/sales", () => ({
  WorkspaceHeader: ({ primaryAction }: { primaryAction?: ReactNode }) => (
    <header>{primaryAction}</header>
  ),
  ActivityTimeline: () => null,
  EmptyWorkspaceState: () => null,
  ErrorState: () => null,
  LoadingSkeleton: () => null,
  SectionHeader: () => null,
  StaleDataIndicator: () => null,
  StatusBadge: () => null,
  StickyActionBar: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
import { Route } from "../quotes.$id";
afterEach(cleanup);
function draw(role: string, capabilities: string[] | undefined, status = "approved") {
  Object.assign(state, { role, capabilities, status });
  const Component = Route.options.component as ComponentType;
  render(<Component />);
}
describe("quote action controls use server-evaluated capabilities", () => {
  it("disables issue for an admin with an effective deny", () => {
    draw("admin", []);
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
