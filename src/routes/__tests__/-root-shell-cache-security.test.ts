import { readFileSync } from "node:fs";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";

const rootSource = readFileSync(new URL("../__root.tsx", import.meta.url), "utf8");

describe("root shell auth cache boundaries", () => {
  it("removes the exact shell cache before invalidating or navigating after sign-out", () => {
    const removeShellCache = rootSource.indexOf("queryClient.removeQueries({");
    const invalidate = rootSource.indexOf("await router.invalidate()", removeShellCache);
    const navigate = rootSource.indexOf('await router.navigate({ to: "/login" })', removeShellCache);

    expect(removeShellCache).toBeGreaterThan(rootSource.indexOf("await signOut()"));
    expect(rootSource.slice(removeShellCache, invalidate)).toContain("crmQueryKeys.shell()");
    expect(rootSource.slice(removeShellCache, invalidate)).toContain("exact: true");
    expect(invalidate).toBeGreaterThan(removeShellCache);
    expect(navigate).toBeGreaterThan(invalidate);
  });

  it("fetches user B after the prior shell cache is removed", async () => {
    const queryClient = new QueryClient();
    const readUserA = vi.fn().mockResolvedValue({ user: { id: "user-a" } });

    await queryClient.ensureQueryData(
      routeQueryOptions({ queryKey: crmQueryKeys.shell(), queryFn: readUserA }),
    );
    queryClient.removeQueries({ queryKey: crmQueryKeys.shell(), exact: true });

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
