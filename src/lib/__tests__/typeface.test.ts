import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The app's typeface is declared where `body` can read it.
 *
 * Plus Jakarta Sans was self-hosted and listed in `@theme inline`, which only inlines a value
 * into utilities. `body { font-family: var(--font-sans) }` therefore read the Neon Auth bundle's
 * system stack and the face never rendered (audit UX-39). Han characters fell back to whatever
 * the OS picks for `lang="en"` (UX-25).
 */
const css = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

function rootBlock(): string {
  const start = css.indexOf(":root {");
  if (start === -1) throw new Error("No :root block in styles.css");
  return css.slice(start, css.indexOf("}", start));
}

function fontStack(body: string): string[] {
  const match = body.match(/--font-sans:\s*([^;]+);/);
  if (!match) throw new Error("No --font-sans declaration");
  return match[1].split(",").map((family) => family.trim().replace(/^"|"$/g, ""));
}

describe("typeface", () => {
  it("declares --font-sans in the unlayered :root, after the Neon Auth import", () => {
    expect(css.indexOf(":root {")).toBeGreaterThan(css.indexOf('@import "@neondatabase/auth-ui'));
    expect(css.slice(0, css.indexOf(":root {"))).not.toMatch(/@layer [a-z-]+ \{\s*:root/);
    expect(fontStack(rootBlock())[0]).toBe("Plus Jakarta Sans");
  });

  it("falls back to Traditional Chinese faces before the system font", () => {
    const stack = fontStack(rootBlock());
    const system = stack.indexOf("system-ui");
    for (const face of ["PingFang HK", "Noto Sans HK", "Microsoft JhengHei"]) {
      expect(stack.indexOf(face)).toBeGreaterThan(0);
      expect(stack.indexOf(face)).toBeLessThan(system);
    }
  });

  it("keeps the utility stack and the variable in step", () => {
    const themeStart = css.indexOf("@theme inline {");
    const theme = css.slice(themeStart, css.indexOf("}", themeStart));
    expect(fontStack(theme)).toEqual(fontStack(rootBlock()));
  });
});
