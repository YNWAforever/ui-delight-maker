// @vitest-environment jsdom
import type { ComponentType, ReactNode } from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loader: vi.fn(),
  search: vi.fn(),
  context: vi.fn(),
  inventory: vi.fn(),
  changeRole: vi.fn(),
  deactivate: vi.fn(),
  suspend: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (options: Record<string, unknown>) => ({
    options,
    fullPath: path,
    useLoaderData: mocks.loader,
    useSearch: mocks.search,
    useRouteContext: mocks.context,
  }),
  Link: ({ children }: { children: ReactNode }) => <a href="#record">{children}</a>,
  Outlet: () => null,
  useNavigate: () => vi.fn(),
  useRouter: () => ({ invalidate: vi.fn() }),
}));
vi.mock("@tanstack/react-query", () => ({
  queryOptions: (value: unknown) => value,
  useQuery: ({ initialData }: { initialData?: unknown }) => ({
    data: initialData,
    isFetching: false,
    isLoading: false,
    isError: false,
    dataUpdatedAt: Date.now(),
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/lib/routing-utils", () => ({ useIsExactPath: () => true }));
vi.mock("@/lib/admin-directory", () => ({
  adminOrganizationQueryKey: ["organization"],
  adminPeopleOptionsQueryKey: () => ["people"],
  loadOrganizationDirectory: vi.fn(),
  departmentOptions: () => [],
  teamOptions: () => [],
}));
vi.mock("@/components/admin/people-directory", () => ({ PeopleDirectory: () => null }));
vi.mock("@/components/admin/invite-users-dialog", () => ({ InviteUsersDialog: () => null }));
vi.mock("@/server-functions/admin-invitations", () => ({ inviteUsers: vi.fn() }));
vi.mock("@/server-functions/admin-users", () => ({
  getAdminUsersFn: vi.fn(),
  getAdminUserFn: vi.fn(),
  getAdminReassignmentInventoryFn: mocks.inventory,
  changeAdminUserRoleFn: mocks.changeRole,
  deactivateAdminUserWithReassignmentFn: mocks.deactivate,
  suspendAdminUserFn: mocks.suspend,
  reactivateAdminUserFn: vi.fn(),
  revokeAdminUserSessionsFn: vi.fn(),
}));
vi.mock("@/server-functions/assignable-profiles", () => ({
  listAssignableProfilesFn: vi.fn(),
  resolveAssignableProfileFn: vi.fn(),
}));
import { Route } from "../admin.people";
const Component = Route.options.component as ComponentType;
const selected = {
  id: "selected-text-profile",
  name: "Selected person",
  email: "selected@example.test",
  role: "read_only",
  status: "active",
  locale: "en-HK",
  timezone: "Asia/Hong_Kong",
  availabilityStatus: "available",
  teams: [],
  workload: {},
  teamCount: 0,
  openTaskCount: 0,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.loader.mockReturnValue({
    directory: { items: [selected], total: 1, page: 1, limit: 50 },
    selectedUser: selected,
    forbidden: false,
  });
  mocks.search.mockReturnValue({ user: selected.id, page: 1 });
  mocks.context.mockReturnValue({ profile: { role: "admin" } });
  mocks.inventory.mockResolvedValue({
    profileId: selected.id,
    buckets: [],
    totalCount: 0,
    totalHistoryCount: 0,
  });
});
afterEach(cleanup);
describe("People selected-record action intent", () => {
  it("restores the selected admin record without opening mutation dialogs", () => {
    render(<Component />);
    expect(screen.getByRole("link", { name: /Open full record/ })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.inventory).not.toHaveBeenCalled();
  });
  it("lets a reader inspect the selected record without mutation dialogs or controls", () => {
    mocks.context.mockReturnValue({ profile: { role: "read_only" } });
    render(<Component />);
    expect(screen.getByRole("link", { name: /Open full record/ })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "Change role" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Suspend or deactivate" })).toBeNull();
    expect(mocks.changeRole).not.toHaveBeenCalled();
    expect(mocks.suspend).not.toHaveBeenCalled();
  });
  it("opens each authorized dialog only after its explicit action, preserving the record", async () => {
    const actor = userEvent.setup();
    render(<Component />);
    expect(screen.queryByRole("dialog")).toBeNull();
    await actor.click(screen.getByRole("button", { name: "Change role" }));
    const roleDialog = screen.getByRole("dialog", { name: "Change role" });
    await actor.click(within(roleDialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await actor.click(screen.getByRole("button", { name: "Suspend or deactivate" }));
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "Selected person" })).toBeTruthy(),
    );
    expect(mocks.inventory).toHaveBeenCalledWith({ data: { profileId: selected.id } });
    await actor.click(screen.getByRole("button", { name: "Close lifecycle dialog" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.changeRole).not.toHaveBeenCalled();
    expect(mocks.deactivate).not.toHaveBeenCalled();
  });
  it("hides an open mutation dialog when the current actor loses its role capability", async () => {
    const actor = userEvent.setup(),
      view = render(<Component />);
    await actor.click(screen.getByRole("button", { name: "Change role" }));
    expect(screen.getByRole("dialog", { name: "Change role" })).toBeTruthy();
    mocks.context.mockReturnValue({ profile: { role: "read_only" } });
    view.rerender(<Component />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.changeRole).not.toHaveBeenCalled();
  });
});
