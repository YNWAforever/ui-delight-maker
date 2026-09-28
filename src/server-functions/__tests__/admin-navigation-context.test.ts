import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireNeonAuthSession: vi.fn(),
  query: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      validator: () => chain,
      handler: (handler: (...args: never[]) => unknown) => handler,
    };
    return chain;
  },
}));
vi.mock("@/lib/auth/neon-auth.server", () => ({
  requireNeonAuthSession: mocks.requireNeonAuthSession,
}));
vi.mock("@/server/db/neon.server", () => ({ query: mocks.query, transaction: vi.fn() }));

import { getAdminNavigationFn } from "../admin-users";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireNeonAuthSession.mockResolvedValue({
    profile: { id: "actor-1", role: "read_only", status: "active", primary_department_id: null },
  });
  mocks.query.mockResolvedValue([]);
});

it("renders admin navigation from one authorization context", async () => {
  const navigation = await getAdminNavigationFn();
  expect(navigation.map((item) => item.key)).toEqual(["overview", "people", "teams"]);
  expect(mocks.requireNeonAuthSession).toHaveBeenCalledOnce();
  expect(mocks.query).toHaveBeenCalledTimes(4);
});
