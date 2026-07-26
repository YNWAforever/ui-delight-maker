import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readSource = (path: string) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

describe("operational queue loading performance", () => {
  it.each([
    ["tasks.tsx", "crmQueryKeys.tasks"],
    ["approvals.tsx", "crmQueryKeys.approvals"],
    ["notifications.tsx", "crmQueryKeys.notifications"],
    ["agents.tsx", "crmQueryKeys.agents"],
  ])("caches %s behind route query keys", (file, key) => {
    const source = readSource(file);
    expect(source).toContain("ensureQueryData");
    expect(source).toContain(key);
    expect(source).not.toContain("router.invalidate");
  });

  it("uses one AI review primary read and targeted approval refresh", () => {
    const source = readSource("ai-review.tsx");
    expect(source).not.toContain("router.invalidate");
  });

  it("paginates agent detail history outside the agent list payload", () => {
    const list = readSource("agents.tsx");
    const detail = readSource("agents.$name.tsx");
    expect(detail).toContain("page:");
    expect(detail).toContain("limit:");
  });
});
