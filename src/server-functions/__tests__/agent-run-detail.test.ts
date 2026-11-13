import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), gate: vi.fn(), load: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (data: unknown) => data;
    const chain = {
      validator(fn: (data: unknown) => unknown) {
        validate = fn;
        return chain;
      },
      handler(fn: (input: { data: unknown }) => unknown) {
        return ({ data }: { data?: unknown } = {}) => fn({ data: validate(data) });
      },
    };
    return chain;
  },
}));
vi.mock("@/server/auth/authorization.server", () => ({
  loadRequestAuthorization: mocks.context,
  requirePageAuthorization: mocks.gate,
}));
vi.mock("@/server/read-models/agent-run-detail", () => ({ loadAgentRunDetail: mocks.load }));
import { getAgentRunDetailRead } from "../agent-runs";
const runId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const context = { actor: { profileId: "reader" } };
const rows = { allow: vi.fn() };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue(context);
  mocks.gate.mockResolvedValue({ rows });
  mocks.load.mockResolvedValue({ available: false, actorId: "reader" });
});
describe("run-detail server boundary", () => {
  it("requires the agent capability before delegating the subject check", async () => {
    await getAgentRunDetailRead({ data: { runId } });
    expect(mocks.context).toHaveBeenCalledTimes(1);
    expect(mocks.gate).toHaveBeenCalledWith(["agents.view"], { context, cacheRowOwners: true });
    expect(mocks.load).toHaveBeenCalledWith({ runId }, context, rows);
    expect(mocks.gate.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.load.mock.invocationCallOrder[0],
    );
  });
  it("reads no run metadata when the base capability is denied", async () => {
    const denial = new Error("denied");
    mocks.gate.mockRejectedValue(denial);
    await expect(getAgentRunDetailRead({ data: { runId } })).rejects.toBe(denial);
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it.each([
    { runId: "bad" },
    { runId, actorId: "forged" },
    { runId, limit: 100000 },
    { runId, cursor: { calledAt: "bad", id: runId } },
  ])("rejects malformed or identity-bearing input: %j", (data) => {
    expect(() => getAgentRunDetailRead({ data } as never)).toThrow();
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.load).not.toHaveBeenCalled();
  });
});
