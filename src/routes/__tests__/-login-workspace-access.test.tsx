import { describe, expect, it, vi } from "vitest";

const { getCurrentWorkspaceAccessMock, redirectMock } = vi.hoisted(() => ({
  getCurrentWorkspaceAccessMock: vi.fn(),
  redirectMock: vi.fn((options: unknown) => ({ ...(options as object), isRedirect: true })),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (options: object) => ({ path, options }),
  redirect: redirectMock,
  useRouterState: vi.fn(),
}));
vi.mock("@/server-functions/auth", () => ({
  getCurrentWorkspaceAccess: getCurrentWorkspaceAccessMock,
}));
vi.mock("@/components/auth/login-auth-page", () => ({
  LoginAuthPage: () => null,
}));

import { Route as LoginRoute } from "../login";
import { Route as LoginAuthPathRoute } from "../login.$authPath";

describe("login workspace access loaders", () => {
  it.each([
    ["plain login", LoginRoute],
    ["auth path", LoginAuthPathRoute],
  ])(
    "shows a signed-in no-profile state on %s instead of redirecting back to login",
    async (_, route) => {
      getCurrentWorkspaceAccessMock.mockResolvedValueOnce({ state: "no_profile" });
      await expect((route.options.loader as () => Promise<unknown>)()).resolves.toEqual({
        state: "no_profile",
      });
      expect(redirectMock).not.toHaveBeenCalled();
      expect(getCurrentWorkspaceAccessMock).toHaveBeenCalledWith();
    },
  );

  it("redirects only active workspace identities", async () => {
    getCurrentWorkspaceAccessMock.mockResolvedValueOnce({ state: "active" });
    await expect((LoginRoute.options.loader as () => Promise<unknown>)()).rejects.toMatchObject({
      to: "/",
      isRedirect: true,
    });
  });
});
