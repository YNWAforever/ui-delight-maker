// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";
import type { UserRole } from "@/lib/admin/types";
const state = vi.hoisted(() => ({
  role: "super_admin" as UserRole,
  capabilities: [] as string[] | undefined,
  loaded: {
    forbidden: false,
    data: {
      items: [
        {
          id: "audit-1",
          actor_profile_id: "actor",
          target_type: "profile",
          target_id: "synthetic",
          action: "profile.updated",
          severity: "info",
          reason: null,
          before_snapshot: null,
          after_snapshot: null,
          created_at: "2026-09-30T06:00:00Z",
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
    },
  },
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (options: unknown) => ({
    options,
    fullPath: path,
    useSearch: () => ({ page: 1 }),
    useLoaderData: () => state.loaded,
    useRouteContext: () => ({ profile: { role: state.role }, capabilities: state.capabilities }),
  }),
  useNavigate: () => vi.fn(),
  useRouter: () => ({ invalidate: vi.fn() }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQuery: () => ({ data: state.loaded, dataUpdatedAt: Date.now(), isRefetching: false }),
}));
vi.mock("@/server-functions/admin-access", () => ({
  getAdminAuditLogsFn: vi.fn(),
  exportAdminAuditLogsFn: vi.fn(),
}));
vi.mock("@/components/sales", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/sales")>()),
  WorkspaceHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  StaleDataIndicator: () => null,
  PermissionDeniedState: () => <p>Permission denied</p>,
  ErrorState: () => <p>Read failed</p>,
}));
import { Route } from "../admin.audit";
const Page = Route.options.component as ComponentType;
beforeEach(() => {
  state.role = "super_admin";
  state.capabilities = [];
});
afterEach(cleanup);
describe("Admin audit export uses the effective server capability", () => {
  it("removes export for a super admin with an effective deny", () => {
    render(<Page />);
    expect(screen.queryByRole("button", { name: "Export this page (CSV)" })).toBeNull();
    expect(screen.getAllByText("profile.updated").length).toBeGreaterThan(0);
  });
  it("fails closed when the effective snapshot is absent", () => {
    state.capabilities = undefined;
    render(<Page />);
    expect(screen.queryByRole("button", { name: "Export this page (CSV)" })).toBeNull();
  });
  it("honors an effective grant separately from the role baseline", () => {
    state.role = "read_only";
    state.capabilities = ["audit.view", "audit.export"];
    render(<Page />);
    expect(screen.getByRole("button", { name: "Export this page (CSV)" })).toHaveProperty(
      "disabled",
      false,
    );
  });
  it.each(["super_admin", "admin"] as const)("retains permitted %s export", (role) => {
    state.role = role;
    state.capabilities = ["audit.view", "audit.export"];
    render(<Page />);
    expect(screen.getByRole("button", { name: "Export this page (CSV)" })).toHaveProperty(
      "disabled",
      false,
    );
  });
});
