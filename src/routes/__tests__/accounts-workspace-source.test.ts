import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Account company workspace route", () => {
  it("uses the Account workspace loader and renders all workspace sections", () => {
    const source = readFileSync(new URL("../accounts.$id.tsx", import.meta.url), "utf8");

    expect(source).toContain("getAccountWorkspace");
    for (const label of ["Overview", "People", "Activity", "Commercial", "Delivery & Finance"]) {
      expect(source).toContain(label);
    }
  });
});
