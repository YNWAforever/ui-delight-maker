import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AGENT_DEFINITIONS, agentNameFor } from "@/lib/agents";

/**
 * The Agents section is a join between a hand-written catalogue and the `agent_runs` table.
 * Nothing used to check the join key, and it broke: the catalogue listed four agents
 * (lead-intake, qualification, quotation, orchestrator) whose `display_name` matched no
 * `agent_name` any dispatch path writes, while the five agents that do run — Lead
 * Qualification, Reply Draft, Quote Draft, Relationship Intelligence, Renewal Risk — appeared
 * in no card.
 *
 * Verified against a migrated database before the fix: five completed runs inserted, and all
 * four cards reported runs_24h 0, avg_confidence null, an empty sparkline, and history total 0.
 * The unfiltered Recent Runs list showed all five by name on the same screen.
 *
 * Two of the stale four — lead-intake and orchestrator — had no webhook, no dispatch path and
 * no inbound route at all. They were never dispatchable; they came from `src/lib/mock-data.ts`.
 *
 * These tests pin the three couplings that have to hold for the section to mean anything.
 */

const MIGRATIONS = resolve(process.cwd(), "neon/migrations");
const WORKFLOW_ROUTES = resolve(process.cwd(), "src/routes/api/workflows");

/**
 * The workflow types Postgres will actually accept, read from the last redefinition of the
 * check constraint across the migrations in order. The database is the authority here: a
 * dispatch path naming a type outside this set fails at insert, so the catalogue must match it
 * exactly — no extra entries that cannot run, no missing entries that already do.
 */
function workflowTypesAllowedBySchema(): string[] {
  const files = readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  let allowed: string[] | null = null;
  for (const file of files) {
    const sql = readFileSync(resolve(MIGRATIONS, file), "utf8");
    for (const [, list] of sql.matchAll(
      /workflow_type\s+text\s+not\s+null\s+check\s*\(\s*workflow_type\s+in\s*\(([^)]*)\)/gi,
    )) {
      allowed = [...list.matchAll(/'([^']+)'/g)].map(([, value]) => value);
    }
    for (const [, list] of sql.matchAll(
      /add\s+constraint\s+agent_runs_workflow_type_check\s+check\s*\(\s*workflow_type\s+in\s*\(([^)]*)\)/gi,
    )) {
      allowed = [...list.matchAll(/'([^']+)'/g)].map(([, value]) => value);
    }
  }
  if (!allowed) throw new Error("Could not read the agent_runs workflow_type constraint");
  return allowed.sort();
}

describe("agent catalogue", () => {
  it("lists exactly the workflow types the database accepts", () => {
    const fromSchema = workflowTypesAllowedBySchema();
    const fromCatalogue = AGENT_DEFINITIONS.map((agent) => agent.workflow_type).sort();

    expect(
      fromCatalogue,
      `The catalogue and the agent_runs check constraint disagree. An entry here that the ` +
        `schema rejects can never run; a type the schema allows but this omits runs with no ` +
        `card and no history.\n  schema:    ${fromSchema.join(", ")}\n  catalogue: ${fromCatalogue.join(", ")}`,
    ).toEqual(fromSchema);
  });

  it("gives every agent an inbound writeback route", () => {
    // n8n reports results back to /api/workflows/<slug>. An agent with no route can be
    // dispatched but its result is dropped, so the run sits pending forever.
    const routes = new Set(
      readdirSync(WORKFLOW_ROUTES)
        .filter((file) => file.endsWith(".ts"))
        .map((file) => file.replace(/\.ts$/, "")),
    );
    const missing = AGENT_DEFINITIONS.filter((agent) => !routes.has(agent.name)).map(
      (agent) => `${agent.name} (expected src/routes/api/workflows/${agent.name}.ts)`,
    );
    expect(missing, `Agents with no writeback route:\n  ${missing.join("\n  ")}`).toEqual([]);
  });

  it("keeps the runs-table join key in one place", () => {
    // Every dispatch path must take agent_name from agentNameFor, never a literal. A literal
    // is how display_name and agent_name drifted apart in the first place, and the drift is
    // invisible — the insert succeeds, the run is recorded, and only the UI silently empties.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = resolve(dir, entry.name);
        // `resolve` emits backslashes on Windows, so every path comparison below is made
        // against a slash-normalised copy. Without it the mock-data exclusion never fired
        // off a Windows checkout and this gate sat permanently red for a fixture file.
        const posixPath = path.replaceAll("\\", "/");
        if (entry.isDirectory()) {
          if (entry.name !== "__tests__") walk(path);
          continue;
        }
        if (!entry.name.endsWith(".ts")) continue;
        // mock-data.ts is fixture text for stories and is not a dispatch path.
        if (posixPath.endsWith("src/lib/mock-data.ts")) continue;
        const source = readFileSync(path, "utf8");
        for (const [match] of source.matchAll(/agent_name:\s*"[^"]+"/g)) {
          offenders.push(
            `${posixPath.replace(process.cwd().replaceAll("\\", "/") + "/", "")}: ${match}`,
          );
        }
      }
    };
    walk(resolve(process.cwd(), "src"));

    expect(
      offenders,
      `Hardcoded agent_name. Use agentNameFor(workflowType) so the catalogue and the runs ` +
        `table cannot drift:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  it("resolves a recordable name for every workflow type", () => {
    for (const agent of AGENT_DEFINITIONS) {
      expect(agentNameFor(agent.workflow_type)).toBe(agent.display_name);
    }
  });

  it("has a dispatch env var per agent, read by code and documented in .env.example", () => {
    // The naming is a convention, not a lookup: N8N_<WORKFLOW_TYPE>_WEBHOOK_URL. Asserting it
    // catches the gap that existed for relationship_intelligence, whose var the code read but
    // neither .env.example nor docs/clientops-activation/environment.md listed — so anyone
    // configuring from the docs set four of five, and the account page's Run intelligence
    // button returned missing_webhook with nothing to explain why.
    const example = readFileSync(resolve(process.cwd(), ".env.example"), "utf8");
    const source = [
      "src/server-functions/leads.ts",
      "src/server-functions/quotes.ts",
      "src/server-functions/accounts.ts",
      "src/server-functions/engagements.ts",
      "src/server/workflows/retention-sweep.server.ts",
    ]
      .map((file) => readFileSync(resolve(process.cwd(), file), "utf8"))
      .join("\n");

    const missing: string[] = [];
    for (const agent of AGENT_DEFINITIONS) {
      const variable = `N8N_${agent.workflow_type.toUpperCase()}_WEBHOOK_URL`;
      if (!source.includes(`process.env.${variable}`)) {
        missing.push(`${variable} — no dispatch path reads it`);
      }
      if (!example.includes(variable)) {
        missing.push(`${variable} — absent from .env.example`);
      }
    }
    expect(missing, `Dispatch configuration gaps:\n  ${missing.join("\n  ")}`).toEqual([]);
  });

  it("keeps slugs unique, since the slug is the route param", () => {
    const slugs = AGENT_DEFINITIONS.map((agent) => agent.name);
    expect(new Set(slugs).size, `Duplicate slug in ${slugs.join(", ")}`).toBe(slugs.length);
  });
});
