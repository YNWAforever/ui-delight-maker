import { WfmOAuth, wfmNamespace, type WfmConfig } from "./oauth.server";
import { listWfm, rateLimitedFetch, WfmRateLimiter, type ListOptions } from "./http.server";

export class WfmClient {
  readonly sourceNamespace: string;
  private readonly limiter = new WfmRateLimiter();
  private readonly oauth: WfmOAuth;
  constructor(
    config: WfmConfig,
    options: { onRefreshToken?: (token: string) => Promise<void> } = {},
  ) {
    this.sourceNamespace = wfmNamespace(config.orgId);
    this.oauth = new WfmOAuth(config, { ...options, limiter: this.limiter });
  }

  async get(path: string, params = new URLSearchParams()): Promise<unknown> {
    if (!/^v2\/[a-zA-Z0-9/-]+$/.test(path)) throw new Error("Invalid WFM API path");
    let token = await this.oauth.token();
    for (let attempt = 0; ; attempt++) {
      const response = await rateLimitedFetch(
        () =>
          fetch(`https://api.workflowmax.com/${path}?${params}`, {
            headers: { Authorization: `Bearer ${token}`, "account-id": this.oauth.config.orgId },
            redirect: "error",
            signal: AbortSignal.timeout(30_000),
          }),
        this.limiter,
      );
      if (response.status === 401 && attempt === 0) {
        await response.body?.cancel();
        token = await this.oauth.token(true);
        continue;
      }
      if (!response.ok) throw new Error(`WFM API HTTP ${response.status}`);
      return response.json();
    }
  }

  list(path: string, options: ListOptions = {}) {
    return listWfm((p, params) => this.get(p, params), path, options);
  }
}
