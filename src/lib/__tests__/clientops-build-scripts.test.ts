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
});
