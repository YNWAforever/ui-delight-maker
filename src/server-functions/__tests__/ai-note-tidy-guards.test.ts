import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({
  policy: vi.fn(),
  begin: vi.fn(),
  finish: vi.fn(),
  authorize: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => {
  const chain = { validator: () => chain, handler: (handler: unknown) => handler };
  return { createServerFn: () => chain };
});
vi.mock("@/lib/auth/neon-auth.server", () => ({
  requireNeonAuthSession: async () => ({ profile: { id: "synthetic-note-actor" } }),
}));
vi.mock("@/server/auth/authorization.server", () => ({ requireCapability: api.authorize }));
vi.mock("@/server/repositories/ai-invocations", () => ({
  readNoteTidyPolicy: api.policy,
  beginNoteTidyRun: api.begin,
  finishNoteTidyRun: api.finish,
}));
import { tidyTouchpointNote } from "../ai-note-tidy";
const call = tidyTouchpointNote as unknown as (input: {
  data: { notes: string; idempotencyKey: string };
}) => Promise<{ tidied: string; runId: string }>;
const input = {
  data: { notes: "Synthetic original facts.", idempotencyKey: "local-guard-fixture" },
};
beforeEach(() => {
  vi.resetAllMocks();
  api.authorize.mockResolvedValue(undefined);
  api.policy.mockResolvedValue({ status: "active", versionId: null });
  api.begin.mockResolvedValue({ created: true, runId: "synthetic-run" });
  api.finish.mockResolvedValue(undefined);
  vi.stubEnv("OPENROUTER_API_KEY", "");
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("Note Tidy direct provider guards", () => {
  it("inactive policy creates no run and makes no provider request", async () => {
    api.policy.mockResolvedValue({ status: "inactive", versionId: "version" });
    await expect(call(input)).rejects.toThrow("inactive");
    expect(api.begin).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("missing key makes no provider request and records the actual failed attempt", async () => {
    await expect(call(input)).rejects.toThrow("did not complete");
    expect(fetch).not.toHaveBeenCalled();
    expect(api.finish).toHaveBeenCalledWith(
      "synthetic-run",
      expect.objectContaining({
        status: "failed",
        outcomeCode: "provider_error",
        usage: null,
        model: null,
      }),
    );
  });
  it("denied update permission makes no run or provider request", async () => {
    api.authorize.mockRejectedValue(new Error("Forbidden"));
    await expect(call(input)).rejects.toThrow("Forbidden");
    expect(api.begin).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("provider omitting actual model stays unknown while returning the durable run link", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "synthetic-test-key-not-a-credential");
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "Synthetic suggestion." } }] }),
        { status: 200 },
      ),
    );
    expect(await call(input)).toEqual({ tidied: "Synthetic suggestion.", runId: "synthetic-run" });
    expect(api.finish).toHaveBeenCalledWith(
      "synthetic-run",
      expect.objectContaining({ model: null, usage: null, status: "completed" }),
    );
  });
  it("revalidates a direct handler invocation before run/provider work", async () => {
    await expect(call({ data: { ...input.data, notes: "x".repeat(20001) } })).rejects.toThrow();
    expect(api.begin).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
