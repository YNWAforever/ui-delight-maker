// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminError } from "@/lib/admin/errors";

const getAdminNavigationMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() =>
  vi.fn((input: { to: string }) => ({ type: "redirect", ...input })),
);

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  Outlet: () => null,
  redirect: redirectMock,
}));
vi.mock("@/server-functions/admin-users", () => ({ getAdminNavigationFn: getAdminNavigationMock }));

import { Route } from "../admin";

const beforeLoad = Route.options.beforeLoad as () => Promise<{ navigation: unknown }>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admin route access", () => {
  it("allows a scoped manager when the server returns users navigation", async () => {
    const navigation = [
      { key: "overview", label: "Overview", capability: "users.view", href: "/admin" },
      { key: "people", label: "People", capability: "users.view", href: "/admin/people" },
    ];
    getAdminNavigationMock.mockResolvedValue(navigation);

    await expect(beforeLoad()).resolves.toEqual({ navigation });
    expect(getAdminNavigationMock).toHaveBeenCalledOnce();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects actors without an admin capability to the revenue desk", async () => {
    getAdminNavigationMock.mockRejectedValue(
      new AdminError("FORBIDDEN", "You do not have this capability"),
    );

    await expect(beforeLoad()).rejects.toEqual({ type: "redirect", to: "/" });
    expect(redirectMock).toHaveBeenCalledWith({ to: "/" });
  });
});
