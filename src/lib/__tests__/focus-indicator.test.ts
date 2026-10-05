import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Keyboard focus and the current page are visible without editing src/components/ui/.
 *
 * The primitives pair `focus-visible:outline-none` with a 1 px ring (UX-22), and the active
 * sidebar item differed from the rail by 1.13:1 (UX-21). Both are fixed by unlayered rules in
 * src/styles.css, which outrank Tailwind's layered utilities. These checks keep the rules
 * present and unlayered: inside any `@layer` they would lose to the utilities again.
 */
const css = readFileSync(resolve(__dirname, "../../styles.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** The rule body for `selector`, and the brace depth it is declared at. */
function rule(selector: string): { body: string; depth: number } {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`No rule for ${selector}`);
  const before = css.slice(0, start);
  const depth = (before.match(/\{/g)?.length ?? 0) - (before.match(/\}/g)?.length ?? 0);
  return { body: css.slice(start, css.indexOf("}", start)), depth };
}

describe("focus indicator", () => {
  it("outlines keyboard focus with a 2 px ring-coloured outline, unlayered", () => {
    const { body, depth } = rule(':focus-visible:not([tabindex="-1"])');
    expect(depth).toBe(0);
    expect(body).toMatch(/outline:\s*2px solid var\(--ring\)/);
    expect(body).toMatch(/outline-offset:\s*2px/);
  });

  it("marks the current page in the sidebar with more than a background, unlayered", () => {
    const { body, depth } = rule('[data-sidebar="menu-button"][data-active="true"]');
    expect(depth).toBe(0);
    expect(body).toMatch(/box-shadow:\s*inset 3px 0 0 var\(--sidebar-primary\)/);
    expect(body).toMatch(/font-weight:\s*600/);
  });
});
