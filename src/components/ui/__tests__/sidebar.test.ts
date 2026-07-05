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

    expect(appSidebarSource).toContain('renderGroup("Today"');
    expect(appSidebarSource).toContain('renderGroup("Acquire"');
    expect(appSidebarSource).toContain('renderGroup("Convert"');
    expect(appSidebarSource).toContain('renderGroup("Retain"');
    expect(appSidebarSource).toContain('renderGroup("Operate"');
    expect(appSidebarSource).toContain('title: "Revenue Desk", url: "/"');
    expect(appSidebarSource).toContain('title: "AI Review", url: "/ai-review"');
  });
});
