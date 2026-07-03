import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rootSource = readFileSync(new URL("../__root.tsx", import.meta.url), "utf8");

describe("root shell hydration", () => {
  it("allows auth UI theme scripts to update the html element before hydration", () => {
    expect(rootSource).toMatch(/<html\b(?=[^>]*\blang="en")(?=[^>]*\bsuppressHydrationWarning\b)/);
  });
});
