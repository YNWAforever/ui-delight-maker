import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Vercel build safety", () => {
  it("packages the app without migrating or seeding an unverified deployment database", () => {
    const config = JSON.parse(
      readFileSync(new URL("../../../vercel.json", import.meta.url), "utf8"),
    ) as { buildCommand: string };

    expect(config.buildCommand).toContain("vite build");
    expect(config.buildCommand).toContain("scripts/vercel-build.mjs");
    expect(config.buildCommand).not.toMatch(/bun run build|migrate|seed|db:push/i);
  });
});
