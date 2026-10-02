import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(resolve(directory, entry.name)) : [resolve(directory, entry.name)],
  );
}
describe("Neon-only provider boundary", () => {
  it("has no Supabase SDK dependency or executable application/script import", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(
      Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((name) =>
        name.startsWith("@supabase/"),
      ),
    ).toEqual([]);
    const leaks = files("src")
      .concat(files("scripts"))
      .filter((path) => /\.(ts|tsx|mjs)$/.test(path) && !path.includes("__tests__"))
      .filter((path) =>
        /(?:from\s*["'](?:@supabase\/|@\/legacy-supabase)|createSupabase(?:Server|Service)Client|https:\/\/[\w.-]+\.supabase\.co)/.test(
          readFileSync(path, "utf8"),
        ),
      );
    expect(leaks).toEqual([]);
  });
  it("provides no Supabase runtime or source-toggle environment configuration", () => {
    for (const path of [".env.example", ".env.local.example"])
      expect(readFileSync(path, "utf8")).not.toMatch(/SUPABASE_|CLIENTOPS_LEGACY_.*SOURCE/);
  });
});
