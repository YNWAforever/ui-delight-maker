import { createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { getSsrStatus } from "@tanstack/router-core/ssr/server";
import { describe, expect, it } from "vitest";
import { AdminError } from "@/lib/admin/errors";
import { authorizationSsrResponse } from "../ssr-authorization-response.server";

describe("SSR authorization response", () => {
  it.each(["FORBIDDEN", "OUTSIDE_SCOPE"] as const)(
    "returns 403 for an actual Router loader %s denial",
    async (code) => {
      const root = createRootRoute();
      const denied = createRoute({
        getParentRoute: () => root,
        path: "/private",
        loader: () => {
          throw new AdminError(code, "You do not have this capability");
        },
      });
      const router = createRouter({
        routeTree: root.addChildren([denied]),
        history: createMemoryHistory({ initialEntries: ["/private"] }),
        isServer: true,
      });
      await router.load();
      expect(getSsrStatus(router)).toBe(500);
      const error = router.state.matches.find((match) => match.status === "error")?.error;
      const original = new Response("existing safe denial page", { status: getSsrStatus(router) });
      const mapped = authorizationSsrResponse(original, error);
      expect(mapped.status).toBe(403);
      expect(await mapped.text()).toBe("existing safe denial page");
    },
  );

  it.each([
    new Error("database unavailable"),
    new Error("FORBIDDEN"),
    { code: "FORBIDDEN" },
    new AdminError("CONFLICT", "State changed"),
    new AdminError("UNAUTHENTICATED", "Sign in required"),
    undefined,
  ])("preserves an unrelated server failure %#", (error) => {
    const original = new Response("safe error page", { status: 500 });
    expect(authorizationSsrResponse(original, error)).toBe(original);
  });

  it.each([200, 302, 403, 404, 503])("preserves an existing HTTP %i response", (status) => {
    const original = new Response(null, { status });
    expect(authorizationSsrResponse(original, new AdminError("FORBIDDEN", "Denied"))).toBe(
      original,
    );
  });

  it("preserves headers, streaming body and cancellation ownership", async () => {
    let cancelled = false;
    const body = new ReadableStream({
      cancel() {
        cancelled = true;
      },
    });
    const original = new Response(body, {
      status: 500,
      headers: { "content-type": "text/html", vary: "Cookie", "x-request-id": "synthetic" },
    });
    const mapped = authorizationSsrResponse(original, new AdminError("FORBIDDEN", "Denied"));
    expect(mapped.body).toBe(original.body);
    expect(mapped.headers.get("content-type")).toBe("text/html");
    expect(mapped.headers.get("vary")).toBe("Cookie");
    expect(mapped.headers.get("x-request-id")).toBe("synthetic");
    expect(mapped.headers.get("cache-control")).toBe("private, no-store");
    await mapped.body?.cancel();
    expect(cancelled).toBe(true);
  });
});
