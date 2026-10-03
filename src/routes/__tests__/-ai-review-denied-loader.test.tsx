// @vitest-environment jsdom
import type { ComponentType, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminError } from "@/lib/admin/errors";
import { agentQueueSearchSchema } from "@/lib/agent-queue-input";
const { read, invalidate } = vi.hoisted(() => ({ read: vi.fn(), invalidate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    fullPath: "/ai-review",
    useLoaderData: vi.fn(),
    useRouteContext: vi.fn(),
  }),
  useNavigate: () => vi.fn(),
  useRouter: () => ({ invalidate }),
  Link: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/server-functions/agent-runs", () => ({ getAiReviewRead: read }));
vi.mock("@/server-functions/approvals", () => ({
  getLastReviewedAtFn: vi.fn(),
  getApprovalDetailFn: vi.fn(),
  decideApproval: vi.fn(),
}));
vi.mock("@/server-functions/quotes", () => ({ approveQuote: vi.fn(), rejectQuote: vi.fn() }));
import { Route } from "../ai-review";
async function load() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const loader = Route.options.loader;
  if (typeof loader !== "function") throw Error("Route loader required");
  try {
    return await loader({
      context: { queryClient },
      deps: agentQueueSearchSchema.parse({}),
    } as never);
  } finally {
    queryClient.clear();
  }
}
beforeEach(() => {
  read.mockReset();
  invalidate.mockReset();
  vi.mocked(Route.useRouteContext).mockReturnValue({
    profile: { id: "accounting-fixture", role: "accounting" },
  } as never);
});
afterEach(cleanup);
describe("AI Review expected server permission denial without concurrent-render recovery", () => {
  it.each(["FORBIDDEN", "OUTSIDE_SCOPE"] as const)(
    "resolves trusted %s into a payload-free denied view",
    async (code) => {
      read.mockRejectedValue(new AdminError(code, "You do not have this capability"));
      await expect(load()).resolves.toEqual({ accessDenied: true });
      expect(read).toHaveBeenCalledTimes(1);
    },
  );
  it("retains authorized queue data unchanged", async () => {
    const data = { approvals: [], humanReviewRuns: [] };
    read.mockResolvedValue(data);
    expect(await load()).toBe(data);
  });
  it.each([
    new AdminError("UNAUTHENTICATED", "Sign in"),
    new Error("You do not have this capability"),
    new Error("database unavailable"),
  ])("preserves authentication and unrelated failures for existing boundaries", async (error) => {
    read.mockRejectedValue(error);
    await expect(load()).rejects.toBe(error);
  });
  it("renders a denied loader result without mounting queue queries or decision controls", () => {
    vi.mocked(Route.useLoaderData).mockReturnValue({ accessDenied: true } as never);
    const Component = Route.options.component as ComponentType;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Component />
      </QueryClientProvider>,
    );
    expect(screen.getByText("The AI review queue did not load")).toBeTruthy();
    expect(screen.getByText("You do not have this capability")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });
});
