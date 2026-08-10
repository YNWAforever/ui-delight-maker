import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("ClientOps database build commands", () => {
  it("runs migration, verification, build, and seed in that order", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts["clientops:verify-schema"]).toBe(
      "bun scripts/clientops/verify-clientops-schema.ts",
    );
    expect(packageJson.scripts.build).toBe(
      "bun run clientops:migrate-schema && bun run clientops:verify-schema && vite build && bun scripts/clientops/seed-on-deploy.ts",
    );
  });

  it("uses the ledger-backed migration runner", async () => {
    const source = await readFile("scripts/clientops/apply-client-relationship-schema.ts", "utf8");
    expect(source).toContain("runClientOpsMigrations");
  });

  it("uses the standard PostgreSQL driver for the local contract database", async () => {
    const source = await readFile(
      "src/server/db/__tests__/clientops-schema.integration.test.ts",
      "utf8",
    );
    expect(source).toContain('from "pg"');
    expect(source).not.toContain('from "@neondatabase/serverless"');
  });

  it("runs the contract database with the required pgvector extension", async () => {
    const workflow = await readFile(".github/workflows/database-contract.yml", "utf8");
    expect(workflow).toContain("image: pgvector/pgvector:pg17");
  });

  it("enforces the build and the route performance budgets on every pull request", async () => {
    // Without this job the budgets only ever ran by hand, which is how a bundle check that
    // measured nothing stayed green. `bun run build` cannot stand in for it here — its
    // migrate/verify/seed steps need a reachable Neon endpoint.
    const workflow = await readFile(".github/workflows/checks.yml", "utf8");
    expect(workflow).toContain("bunx vite build");
    expect(workflow).toContain("bun run performance:verify");
  });
});
