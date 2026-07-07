import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sidebarSource = readFileSync(new URL("../sidebar.tsx", import.meta.url), "utf8");

describe("sidebar responsive display", () => {
  it("does not rely on hidden being overridden for the desktop sidebar layer", () => {
    expect(sidebarSource).toContain("max-md:hidden h-svh");
    expect(sidebarSource).toContain("md:flex");
    expect(sidebarSource).not.toContain("z-10 hidden h-svh");
    expect(sidebarSource).not.toContain("group peer hidden");
  });

  it("groups navigation around the approved sales motions", () => {
    const appSidebarSource = readFileSync(
      new URL("../../app-sidebar.tsx", import.meta.url),
      "utf8",
    );
    const routeTreeSource = readFileSync(
      new URL("../../../routeTree.gen.ts", import.meta.url),
      "utf8",
    );

    expect(appSidebarSource).toContain('renderGroup("Today"');
    expect(appSidebarSource).toContain('renderGroup("Acquire"');
    expect(appSidebarSource).toContain('renderGroup("Convert"');
    expect(appSidebarSource).toContain('renderGroup("Retain"');
    expect(appSidebarSource).toContain('renderGroup("Operate"');
    const expectedItems = [
      { title: "Revenue Desk", url: "/" },
      { title: "Leads", url: "/leads" },
      { title: "AI Review", url: "/ai-review" },
      { title: "Pipeline", url: "/" },
      { title: "Quotes", url: "/quotes" },
      { title: "Approvals", url: "/approvals" },
      { title: "Clients", url: "/clients" },
      { title: "Renewals", url: "/renewals" },
      { title: "Tasks", url: "/tasks" },
      { title: "Agents", url: "/agents" },
      { title: "Reports", url: "/reports" },
      { title: "Settings", url: "/settings" },
    ];

    for (const item of expectedItems) {
      expect(appSidebarSource).toContain(`title: "${item.title}", url: "${item.url}"`);

      if (item.url !== "/") {
        expect(routeTreeSource).toContain(`'${item.url}': {`);
      }
    }
  });

  it("does not mark Pipeline active on the Revenue Desk route", () => {
    const appSidebarSource = readFileSync(
      new URL("../../app-sidebar.tsx", import.meta.url),
      "utf8",
    );

    expect(appSidebarSource).toContain(
      '{ title: "Pipeline", url: "/", icon: LayoutDashboard, activePath: null }',
    );
    expect(appSidebarSource).toContain("const isActive = (item: SidebarItem)");
    expect(appSidebarSource).toContain("isActive(item)");
  });
});
