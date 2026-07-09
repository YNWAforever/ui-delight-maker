import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const seedDataSource = readFileSync(
  new URL("../../../scripts/clientops/seed-data.ts", import.meta.url),
  "utf8",
);
const seedScriptSource = readFileSync(
  new URL("../../../scripts/clientops/seed-smoke-data.ts", import.meta.url),
  "utf8",
);

describe("ClientOps relationship demo seed coverage", () => {
  it("seeds accounts, campaigns, and an accounting job sheet for live debugging", () => {
    expect(seedDataSource).toContain("DEMO_ACCOUNTS");
    expect(seedDataSource).toContain("DEMO_CAMPAIGNS");
    expect(seedDataSource).toContain("DEMO_CAMPAIGN_MEMBERS");
    expect(seedDataSource).toContain("DEMO_JOB_SHEETS");

    expect(seedScriptSource).toContain("accountIds: Map<string, string>");
    expect(seedScriptSource).toContain("campaignIds: Map<string, string>");
    expect(seedScriptSource).toContain("jobSheetIds: Map<string, string>");
    expect(seedScriptSource).toContain("async function seedAccounts");
    expect(seedScriptSource).toContain("async function seedCampaigns");
    expect(seedScriptSource).toContain("async function seedJobSheets");
    expect(seedScriptSource).toMatch(
      /await seedAccounts\(db, ctx\);[\s\S]*await seedCampaigns\(db, ctx\);[\s\S]*await seedJobSheets\(db, ctx\);/,
    );
  });
});
