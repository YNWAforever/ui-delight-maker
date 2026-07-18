import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getInitialCompanyWorkspaceSectionFetches,
  UNOPENED_OPTIONAL_SECTIONS,
} from "../../../scripts/clientops/measure-company-workspace";

describe("Account company workspace loading contract", () => {
  it("detects optional sections that fetch before their tabs are opened", () => {
    const source = readFileSync(new URL("../accounts.$id.tsx", import.meta.url), "utf8");
    const baseline = getInitialCompanyWorkspaceSectionFetches(source);

    expect(UNOPENED_OPTIONAL_SECTIONS).toEqual([
      "activity",
      "commercial",
      "delivery_finance",
      "intelligence",
    ]);
    expect(baseline.initialFetches).toEqual([
      "commercial",
      "delivery_finance",
      "activity",
      "intelligence",
    ]);
    expect(baseline.unopenedOptionalFetches).toEqual(UNOPENED_OPTIONAL_SECTIONS);
    expect(baseline.meetsUnopenedTabPolicy).toBe(false);
  });
});
