import { describe, expect, it } from "vitest";
import { CRM_STALE_TIME_MS } from "../lib/performance/query-policy";
import { getRouter } from "../router";

describe("app router query setup", () => {
  it("creates an isolated query client for each router", () => {
    const firstRouter = getRouter();
    const secondRouter = getRouter();

    expect(firstRouter.options.context.queryClient).not.toBe(
      secondRouter.options.context.queryClient,
    );
  });

  it("preloads on intent using the shared freshness window", () => {
    const router = getRouter();

    expect(router.options.defaultPreload).toBe("intent");
    expect(router.options.defaultPreloadStaleTime).toBe(CRM_STALE_TIME_MS);
  });
});
