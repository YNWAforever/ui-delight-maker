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
  return `header.${Buffer.from(JSON.stringify({ account_id: org, exp })).toString("base64url")}.signature`;
}

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
