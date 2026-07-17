import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { adminOrganizationSearchSchema } from "@/lib/admin/schemas";

const routeSource = readFileSync(new URL("../admin.teams.tsx", import.meta.url), "utf8");
const detailSource = readFileSync(new URL("../admin.teams.$id.tsx", import.meta.url), "utf8");

describe("admin organization URL state", () => {
  it("normalizes unit kind, tab, query, status, and selection", () => {
    const parsed = adminOrganizationSearchSchema.parse({
      kind: "team",
      tab: "members",
      q: "  Growth ",
      status: "archived",
      unit: "team-1",
    });

    expect(parsed.kind).toBe("team");
    expect(parsed.tab).toBe("members");
    expect(parsed.q).toBe("Growth");
    expect(parsed.status).toBe("archived");
    expect(parsed.unit).toBe("team-1");
  });

  it("keeps the directory and detail routes URL-driven", () => {
    expect(routeSource).toContain("validateSearch: adminOrganizationSearchSchema");
    expect(routeSource).toContain("Route.useSearch()");
    expect(routeSource).toContain("replace: true");
    expect(routeSource).toContain("selectedUnitId");

    expect(detailSource).toContain("validateSearch: adminOrganizationSearchSchema");
    expect(detailSource).toContain("Route.useSearch()");
    expect(detailSource).toContain("activeTab={search.tab}");
  });
});
