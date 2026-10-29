import { rateLimitedFetch, systemClock, WfmRateLimiter, type Clock } from "./http.server";

export type WfmConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  orgId: string;
  orgClaim: string;
};

export function wfmConfigFromEnv(env: Record<string, string | undefined>): WfmConfig {
  const required = (key: string) => {
    if (!env[key]?.trim()) throw new Error(`Missing required env var: ${key}`);
    return env[key]!.trim();
  };
  return {
    clientId: required("WFM_CLIENT_ID"),
    clientSecret: required("WFM_CLIENT_SECRET"),
    refreshToken: required("WFM_REFRESH_TOKEN"),
    orgId: required("WFM_ORG_ID"),
    // The documented JWT org claim name is not specified. Pin it explicitly.
    orgClaim: required("WFM_JWT_ORG_CLAIM"),
  };
}

export function wfmNamespace(orgId: string): string {
  if (!/^[a-zA-Z0-9-]+$/.test(orgId)) throw new Error("Invalid WFM organisation ID");
  return `workflowmax:${orgId}`;
}

/** Decode only for routing; the API validates the token, this is not app authentication. */
export function orgFromJwt(token: string, claim: string): { orgId: string; expiresAt: number } {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error();
    const body = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    const orgClaim = body[claim];
    const orgId = Array.isArray(orgClaim)
      ? orgClaim.find((org): org is string => typeof org === "string" && org.trim() !== "")?.trim()
      : orgClaim;
    if (typeof orgId !== "string" || typeof body.exp !== "number" || !Number.isFinite(body.exp))
      throw new Error();
    wfmNamespace(orgId);
    return { orgId, expiresAt: body.exp * 1_000 };
  } catch {
    throw new Error("WFM access JWT lacks the configured organisation claim or expiry");
  }
}

export class WfmOAuth {
  private access: { token: string; expiresAt: number } | undefined;
  private refresh: string;
  private pending: Promise<string> | undefined;
  constructor(
    readonly config: WfmConfig,
    private readonly options: {
      fetch?: typeof fetch;
      clock?: Clock;
      limiter?: WfmRateLimiter;
      onRefreshToken?: (refreshToken: string) => Promise<void>;
    } = {},
  ) {
    wfmNamespace(config.orgId);
    this.refresh = config.refreshToken;
  }

  token(forceRefresh = false): Promise<string> {
    const now = (this.options.clock ?? systemClock).now();
    if (!forceRefresh && this.access && this.access.expiresAt > now + 60_000)
      return Promise.resolve(this.access.token);
    if (!this.pending) {
      this.pending = this.exchange().finally(() => {
        this.pending = undefined;
      });
    }
    return this.pending;
  }

  private async exchange(): Promise<string> {
    const clock = this.options.clock ?? systemClock;
    const send = this.options.fetch ?? fetch;
    const response = await rateLimitedFetch(
      () =>
        send("https://oauth.workflowmax.com/oauth/token", {
          method: "POST",
          redirect: "error",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: this.refresh,
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
            scope: "openid email profile workflowmax offline_access",
          }),
          signal: AbortSignal.timeout(30_000),
        }),
      this.options.limiter ?? new WfmRateLimiter(clock),
      clock,
    );
    // Never include response bodies, credentials, or tokens in diagnostics.
    if (!response.ok) throw new Error(`WFM OAuth HTTP ${response.status}`);
    const body = (await response.json()) as Record<string, unknown>;
    if (typeof body.access_token !== "string" || typeof body.refresh_token !== "string")
      throw new Error("Invalid WFM OAuth token response");
    this.refresh = body.refresh_token;
    await this.options.onRefreshToken?.(this.refresh);
    const claims = orgFromJwt(body.access_token, this.config.orgClaim);
    if (claims.orgId !== this.config.orgId)
      throw new Error("WFM JWT organisation does not match WFM_ORG_ID");
    if (claims.expiresAt <= clock.now() + 60_000)
      throw new Error("WFM JWT is expired or near expiry");
    this.access = { token: body.access_token, expiresAt: claims.expiresAt };
    return this.access.token;
  }
}
