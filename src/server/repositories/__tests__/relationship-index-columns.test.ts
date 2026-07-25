import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The relationship index select listed columns that do not exist on `accounts`:
// health_score lives on clients (neon/migrations/001) and engagements (002), and
// renewal_date / arr belong to engagements. Postgres rejected the query with
// `column a.health_score does not exist`, which is what broke /relationships.
//
// The live accounts table has exactly these 18 columns.
const ACCOUNTS_COLUMNS = new Set([
  "id",
  "name",
  "website",
  "domain",
  "industry",
  "region",
  "tier",
  "lifecycle_stage",
  "account_owner",
  "cs_owner",
  "source",
  "tags",
  "notes",
  "relationship_health",
  "last_activity_at",
  "next_action",
  "created_at",
  "updated_at",
]);

const source = readFileSync(new URL("../relationship-signals.ts", import.meta.url), "utf8");

describe("relationship index account columns", () => {
  it("selects only columns that exist on accounts", () => {
    // Ignore commented-out lines so the explanatory comment above the select, which
    // names the removed columns, cannot satisfy or break this assertion.
    const selected = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .match(/\ba\.([a-z_]+)/g)
      ?.map((match) => match.slice(2));

    expect(selected, "expected the accounts alias to be used").toBeTruthy();

    const invalid = [...new Set(selected)].filter((column) => !ACCOUNTS_COLUMNS.has(column));
    expect(invalid).toEqual([]);
  });

  it("does not reference the columns that caused the outage", () => {
    const active = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");

    expect(active).not.toContain("a.health_score");
    expect(active).not.toContain("a.renewal_date");
    expect(active).not.toContain("a.arr");
  });

  it("still selects the relationship_health column accounts actually has", () => {
    expect(source).toContain("a.relationship_health");
  });
});
