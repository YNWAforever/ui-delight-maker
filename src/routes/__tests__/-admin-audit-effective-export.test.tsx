// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
import { exportAdminAuditLogsFn } from "@/server-functions/admin-access";
import { Route } from "../admin.audit";
const Page = Route.options.component as ComponentType;
beforeEach(() => {
  state.role = "super_admin";
  state.capabilities = [];
  vi.mocked(exportAdminAuditLogsFn).mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Admin audit export uses the effective server capability", () => {
  it("removes export for a super admin with an effective deny", () => {
    render(<Page />);
    expect(screen.queryByRole("button", { name: "Export this page (CSV)" })).toBeNull();
    // The raw key is the cell title; the text is the humanised action (UX-06).
    expect(screen.getAllByTitle("profile.updated")[0].textContent).toBe("Profile updated");
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

describe("Admin audit filters", () => {
  it("finds the actor by name when the session can read the directory", () => {
    // UX-12: the filter asked for an "Actor profile id".
    state.capabilities = ["audit.view", "users.view"];
    render(<Page />);

    expect(screen.getByRole("combobox", { name: "Actor search" })).toBeTruthy();
    expect(screen.getByText("Selected: Anyone")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Audit actor" })).toBeNull();
  });

  it("falls back to the ID field rather than offer a search the server would refuse", () => {
    state.capabilities = ["audit.view"];
    render(<Page />);

    expect(screen.queryByRole("combobox", { name: "Actor search" })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Audit actor" })).toBeTruthy();
    expect(screen.getByText("Actor ID")).toBeTruthy();
  });
});

describe("the audit export produces a real download", () => {
  type CapturedDownload = {
    href: string | null;
    download: string | null;
    /** True only if the anchor was in the document at the moment the click fired. */
    connectedAtClick: boolean | null;
  };

  function captureDownload(): { captured: CapturedDownload; revoke: ReturnType<typeof vi.spyOn> } {
    const captured: CapturedDownload = { href: null, download: null, connectedAtClick: null };
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:audit");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      captured.href = this.href;
      captured.download = this.download;
      captured.connectedAtClick = this.isConnected;
    });
    return { captured, revoke };
  }

  it("attaches the anchor before clicking and revokes the blob URL afterwards", async () => {
    // P3-1: the anchor used to be detached when clicked and the object URL was revoked in the
    // same tick, so a browser could cancel the download while the toast still said it worked.
    state.capabilities = ["audit.view", "audit.export"];
    const { captured, revoke } = captureDownload();
    vi.mocked(exportAdminAuditLogsFn).mockResolvedValue(state.loaded.data as never);
    render(<Page />);

    fireEvent.click(screen.getByRole("button", { name: "Export this page (CSV)" }));

    await waitFor(() => expect(captured.href).toBe("blob:audit"));
    expect(captured.connectedAtClick).toBe(true);
    expect(captured.download).toBe("fimmick-admin-audit-page-1.csv");
    // Released after the click, not during it, and the anchor is gone from the document.
    expect(revoke).not.toHaveBeenCalled();
    expect(document.querySelector("a[download]")).toBeNull();
    await waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:audit"), { timeout: 2000 });
  });
});
