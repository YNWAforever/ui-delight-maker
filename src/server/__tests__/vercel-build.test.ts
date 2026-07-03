import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const scriptSource = readFileSync(
  new URL("../../../scripts/vercel-build.mjs", import.meta.url),
  "utf8",
);

describe("vercel build output", () => {
  it("preserves TanStack Start SSR route match ids", () => {
    expect(scriptSource).not.toContain("fixSsrId");
    expect(scriptSource).not.toMatch(/lastMatchId:"/);
  });
});
