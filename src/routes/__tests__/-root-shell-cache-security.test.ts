import { readFileSync } from "node:fs";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";

const rootSource = readFileSync(new URL("../__root.tsx", import.meta.url), "utf8");

describe("root shell auth cache boundaries", () => {
  it("clears every user-scoped query before invalidating or navigating after sign-out", () => {
    const clearUserCache = rootSource.indexOf("queryClient.clear()");
    const invalidate = rootSource.indexOf("await router.invalidate()", clearUserCache);
    const navigate = rootSource.indexOf('await router.navigate({ to: "/login" })', clearUserCache);

    expect(clearUserCache).toBeGreaterThan(rootSource.indexOf("await signOut()"));
    expect(invalidate).toBeGreaterThan(clearUserCache);
    expect(navigate).toBeGreaterThan(invalidate);
  });

  it("fetches user B after the prior shell cache is removed", async () => {
    const queryClient = new QueryClient();
    const readUserA = vi.fn().mockResolvedValue({ user: { id: "user-a" } });

    await queryClient.ensureQueryData(
      routeQueryOptions({ queryKey: crmQueryKeys.shell(), queryFn: readUserA }),
    );
    queryClient.setQueryData(crmQueryKeys.account.detail("me"), { profile: { id: "user-a" } });
    queryClient.clear();
    expect(queryClient.getQueryData(crmQueryKeys.account.detail("me"))).toBeUndefined();

    const readUserB = vi.fn().mockResolvedValue({ user: { id: "user-b" } });
    await expect(
      queryClient.ensureQueryData(
        routeQueryOptions({ queryKey: crmQueryKeys.shell(), queryFn: readUserB }),
      ),
    ).resolves.toEqual({ user: { id: "user-b" } });
    expect(readUserA).toHaveBeenCalledOnce();
    expect(readUserB).toHaveBeenCalledOnce();
  });

  it("reuses fresh shell data for ordinary same-user navigation", async () => {
    const queryClient = new QueryClient();
    const readShell = vi.fn().mockResolvedValue({ user: { id: "user-a" } });
    const options = routeQueryOptions({ queryKey: crmQueryKeys.shell(), queryFn: readShell });

    await queryClient.ensureQueryData(options);
    await queryClient.ensureQueryData(options);

    expect(readShell).toHaveBeenCalledOnce();
  });
});
