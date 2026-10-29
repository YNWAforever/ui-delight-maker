import { describe, expect, it, vi } from "vitest";
import { orgFromJwt, WfmOAuth, wfmConfigFromEnv, wfmNamespace } from "../oauth.server";
import { WfmRateLimiter } from "../http.server";

const config = {
  clientId: "client",
  clientSecret: "secret",
  refreshToken: "refresh",
  orgId: "fixture-org",
  orgClaim: "account_id",
};
function jwt(org = "fixture-org", exp = 3600) {
  return jwtFromClaims({ account_id: org, exp });
}

function jwtFromClaims(claims: Record<string, unknown>) {
  return `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;
}

describe("orgFromJwt", () => {
  it("extracts a string org_id claim", () => {
    const token = jwtFromClaims({ org_id: "fixture-org", exp: 3600 });
    expect(orgFromJwt(token, "org_id")).toEqual({ orgId: "fixture-org", expiresAt: 3_600_000 });
  });

  it("extracts the first non-empty trimmed string in org_ids", () => {
    const token = jwtFromClaims({
      org_ids: ["", " \t ", null, 0, false, {}, [], " fixture-org ", "other-org"],
      exp: 3600,
    });
    expect(orgFromJwt(token, "org_ids")).toEqual({ orgId: "fixture-org", expiresAt: 3_600_000 });
  });

  it.each([
    { name: "an array without usable strings", value: ["", " \t ", null, 0, false, {}, []] },
    { name: "an empty array", value: [] },
    { name: "a missing claim", value: undefined },
    { name: "a null claim", value: null },
    { name: "a numeric claim", value: 42 },
    { name: "a boolean claim", value: true },
    { name: "an object claim", value: { org_id: "fixture-org" } },
    { name: "an empty string claim", value: "" },
    { name: "a whitespace-only string claim", value: " \t " },
    { name: "an untrimmed string claim", value: " fixture-org " },
    { name: "an invalid string organisation ID", value: "org/../../other" },
    { name: "an invalid first non-empty array entry", value: ["org/../../other", "fixture-org"] },
  ])("rejects $name with a sanitized error", ({ value }) => {
    const token = jwtFromClaims({ org_ids: value, exp: 3600 });
    expect(() => orgFromJwt(token, "org_ids")).toThrow(
      /^WFM access JWT lacks the configured organisation claim or expiry$/,
    );
  });

  it.each([undefined, null, "3600", true])("rejects an invalid expiry %s", (exp) => {
    const token = jwtFromClaims({ org_ids: ["fixture-org"], exp });
    expect(() => orgFromJwt(token, "org_ids")).toThrow(
      /^WFM access JWT lacks the configured organisation claim or expiry$/,
    );
  });

  it("rejects a non-finite numeric expiry", () => {
    const token = `header.${Buffer.from('{"org_ids":["fixture-org"],"exp":1e400}').toString("base64url")}.signature`;
    expect(() => orgFromJwt(token, "org_ids")).toThrow(
      /^WFM access JWT lacks the configured organisation claim or expiry$/,
    );
  });
});

describe("WFM OAuth", () => {
  it("refreshes once for concurrent callers, pins JWT org, and hands off rotated tokens", async () => {
    let now = 0;
    const clock = {
      now: () => now,
      async sleep(ms: number) {
        now += ms;
      },
    };
    const send = vi.fn(
      async () =>
        new Response(JSON.stringify({ access_token: jwt(), refresh_token: "rotated" }), {
          status: 200,
        }),
    );
    const rotated = vi.fn(async () => {});
    const oauth = new WfmOAuth(config, {
      fetch: send as typeof fetch,
      clock,
      limiter: new WfmRateLimiter(clock),
      onRefreshToken: rotated,
    });
    expect(await Promise.all([oauth.token(), oauth.token(), oauth.token()])).toEqual([
      jwt(),
      jwt(),
      jwt(),
    ]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(rotated).toHaveBeenCalledWith("rotated");
    const [url, init] = send.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://oauth.workflowmax.com/oauth/token");
    expect(new URLSearchParams(init.body as URLSearchParams).get("client_secret")).toBe("secret");
    expect(init.redirect).toBe("error");
    await oauth.token(true);
    const body = (send.mock.calls[1] as unknown as [string, RequestInit])[1]
      .body as URLSearchParams;
    expect(body.get("refresh_token")).toBe("rotated");
  });
  it("rejects an org mismatch before an access token can be used", async () => {
    const oauth = new WfmOAuth(config, {
      fetch: vi.fn(
        async () =>
          new Response(
            JSON.stringify({ access_token: jwt("other-org"), refresh_token: "rotated" }),
          ),
      ) as typeof fetch,
      clock: { now: () => 0, async sleep() {} },
    });
    await expect(oauth.token()).rejects.toThrow("does not match");
  });
  it("accepts org_ids when the first non-empty string matches WFM_ORG_ID", async () => {
    const token = jwtFromClaims({
      org_ids: ["", null, " \t ", " fixture-org ", "other-org"],
      exp: 3600,
    });
    const oauth = new WfmOAuth(
      { ...config, orgClaim: "org_ids" },
      {
        fetch: vi.fn(
          async () =>
            new Response(JSON.stringify({ access_token: token, refresh_token: "rotated" })),
        ) as typeof fetch,
        clock: { now: () => 0, async sleep() {} },
      },
    );
    await expect(oauth.token()).resolves.toBe(token);
  });
  it("rejects org_ids when the first non-empty string differs, even if a later entry matches", async () => {
    const token = jwtFromClaims({
      org_ids: ["", null, " \t ", " other-org ", "fixture-org"],
      exp: 3600,
    });
    const oauth = new WfmOAuth(
      { ...config, orgClaim: "org_ids" },
      {
        fetch: vi.fn(
          async () =>
            new Response(JSON.stringify({ access_token: token, refresh_token: "rotated" })),
        ) as typeof fetch,
        clock: { now: () => 0, async sleep() {} },
      },
    );
    await expect(oauth.token()).rejects.toThrow(/^WFM JWT organisation does not match WFM_ORG_ID$/);
  });
  it("sanitizes OAuth errors and rejects malformed JWTs", async () => {
    const oauth = new WfmOAuth(config, {
      fetch: vi.fn(
        async () => new Response("a-secret-and-source-pii", { status: 400 }),
      ) as typeof fetch,
    });
    await expect(oauth.token()).rejects.toThrow(/^WFM OAuth HTTP 400$/);
    expect(() => orgFromJwt("invalid", "account_id")).toThrow("configured organisation");
    expect(() => orgFromJwt(jwt(), "guessedClaim")).toThrow();
    expect(() => wfmNamespace("org/../../other")).toThrow();
  });

  it("sanitizes malformed OAuth JSON instead of exposing token response fragments", async () => {
    const oauth = new WfmOAuth(config, {
      fetch: vi.fn(async () => new Response("fixture-secret-token")) as typeof fetch,
      clock: { now: () => 0, async sleep() {} },
    });
    await expect(oauth.token()).rejects.toThrow(/^Invalid WFM OAuth token response$/);
  });

  it.each([
    { name: "null", body: null },
    { name: "an array", body: [] },
    { name: "an empty refresh token", body: { access_token: jwt(), refresh_token: "" } },
    { name: "a blank refresh token", body: { access_token: jwt(), refresh_token: " \t " } },
  ])("rejects $name before handing off a refresh token", async ({ body }) => {
    const rotated = vi.fn(async () => {});
    const oauth = new WfmOAuth(config, {
      fetch: vi.fn(async () => new Response(JSON.stringify(body))) as typeof fetch,
      clock: { now: () => 0, async sleep() {} },
      onRefreshToken: rotated,
    });
    await expect(oauth.token()).rejects.toThrow(/^Invalid WFM OAuth token response$/);
    expect(rotated).not.toHaveBeenCalled();
  });

  it("does not cache access after a persistence failure and retries with the rotated refresh token", async () => {
    const send = vi.fn(
      async () => new Response(JSON.stringify({ access_token: jwt(), refresh_token: "rotated" })),
    );
    const rotated = vi
      .fn(async () => {})
      .mockRejectedValueOnce(new Error("WFM refresh token persistence failed"));
    const oauth = new WfmOAuth(config, {
      fetch: send as typeof fetch,
      clock: { now: () => 0, async sleep() {} },
      onRefreshToken: rotated,
    });
    await expect(oauth.token()).rejects.toThrow(/^WFM refresh token persistence failed$/);
    await expect(oauth.token()).resolves.toBe(jwt());
    expect(send).toHaveBeenCalledTimes(2);
    expect(rotated).toHaveBeenCalledTimes(2);
    const init = (send.mock.calls[1] as unknown as [string, RequestInit])[1];
    expect((init.body as URLSearchParams).get("refresh_token")).toBe("rotated");
  });
  it("requires explicit env secrets, org and claim with no application DB fallback", () => {
    expect(() => wfmConfigFromEnv({})).toThrow("WFM_CLIENT_ID");
    expect(
      wfmConfigFromEnv({
        WFM_CLIENT_ID: "client",
        WFM_CLIENT_SECRET: "secret",
        WFM_REFRESH_TOKEN: "refresh",
        WFM_ORG_ID: "fixture-org",
        WFM_JWT_ORG_CLAIM: "account_id",
      }),
    ).toEqual(config);
  });
});
