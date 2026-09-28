import { isRedirect } from "@tanstack/react-router";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getNeonAuthSession: vi.fn(),
  getSession: vi.fn(),
  getWorkspacePreferences: vi.fn(),
  getAdminNavigationFn: vi.fn(),
  getAdminNavigationForContext: vi.fn(),
  loadRequestAuthorization: vi.fn(),
  resolveEffectiveCapabilities: vi.fn(),
  effectiveCapabilitiesWithContext: vi.fn(),
  listWorkspaceFavorites: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ handler: (handler: (...args: never[]) => unknown) => handler }),
}));
vi.mock("@/lib/auth/neon-auth.server", () => ({
  getNeonAuthSession: mocks.getNeonAuthSession,
}));
vi.mock("@/server-functions/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/server-functions/workspace-preferences", () => ({
  getWorkspacePreferences: mocks.getWorkspacePreferences,
}));
vi.mock("@/server-functions/admin-users", () => ({
  getAdminNavigationFn: mocks.getAdminNavigationFn,
}));
vi.mock("@/server/admin/navigation.server", () => ({
  getAdminNavigationForContext: mocks.getAdminNavigationForContext,
}));
vi.mock("@/server/repositories/workspace-preferences", () => ({
  listWorkspaceFavorites: mocks.listWorkspaceFavorites,
}));
vi.mock("@/server/auth/authorization.server", () => ({
  loadRequestAuthorization: mocks.loadRequestAuthorization,
  resolveEffectiveCapabilities: mocks.resolveEffectiveCapabilities,
  effectiveCapabilitiesWithContext: mocks.effectiveCapabilitiesWithContext,
}));

import { getAppShellRead } from "../app-shell";

const session = {
  user: { id: "user-1", email: "person@example.com" },
  profile: { id: "profile-1", name: "Person" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getNeonAuthSession.mockResolvedValue(session);
  mocks.getSession.mockResolvedValue(session);
  mocks.getWorkspacePreferences.mockResolvedValue({ favorites: [] });
  mocks.getAdminNavigationFn.mockResolvedValue([]);
  mocks.resolveEffectiveCapabilities.mockResolvedValue(["accounts.view"]);
  mocks.loadRequestAuthorization.mockResolvedValue({ session, actor: {}, overrides: [] });
  mocks.getAdminNavigationForContext.mockResolvedValue([]);
  mocks.effectiveCapabilitiesWithContext.mockReturnValue(["accounts.view"]);
  mocks.listWorkspaceFavorites.mockResolvedValue([]);
});

it("shares one authorization context across shell navigation and capabilities", async () => {
  const read = await getAppShellRead();
  expect(read.capabilities).toEqual(["accounts.view"]);
  expect(mocks.getNeonAuthSession).toHaveBeenCalledOnce();
  expect(mocks.loadRequestAuthorization).toHaveBeenCalledOnce();
  expect(mocks.getAdminNavigationForContext).toHaveBeenCalledOnce();
  expect(mocks.effectiveCapabilitiesWithContext).toHaveBeenCalledOnce();
  expect(mocks.listWorkspaceFavorites).toHaveBeenCalledWith("profile-1");
});
it("redirects a missing session before loading favorites or authorization", async () => {
  mocks.getNeonAuthSession.mockResolvedValue(null);
  await expect(getAppShellRead()).rejects.toSatisfy(isRedirect);
  expect(mocks.loadRequestAuthorization).not.toHaveBeenCalled();
  expect(mocks.listWorkspaceFavorites).not.toHaveBeenCalled();
});
