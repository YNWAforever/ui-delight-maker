import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Screens colour themselves through theme tokens, so both themes stay correct.
 *
 * The notification bell and the role dialog used raw palette classes (`text-amber-500`,
 * `text-emerald-700`, …) that ignore dark mode and the contrast-checked tone tokens (UX-27).
 * The quote PDF and its print route are exempt on purpose: they render fixed colours on white
 * paper. `src/components/ui/` is exempt because it may not be hand-edited.
 */
const SRC = resolve(__dirname, "../..");
const EXEMPT = new Set(["components/quotes/quote-pdf-preview.tsx", "routes/quotes.$id_.pdf.tsx"]);
const RAW_PALETTE =
  /\b(?:bg|text|border|ring|fill|stroke)-(?:red|green|blue|amber|yellow|orange|emerald|sky|violet|purple|slate|gray|zinc|neutral|stone|rose|pink|teal|cyan|lime|indigo|fuchsia)-\d{2,3}\b/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === "__tests__" || name === "ui" ? [] : sourceFiles(path);
    }
    return path.endsWith(".tsx") ? [path] : [];
  });
}

describe("theme colour tokens", () => {
  it("uses no raw palette colour classes outside the print document", () => {
    const offenders = sourceFiles(SRC)
      .map((path) => relative(SRC, path).split("\\").join("/"))
      .filter((path) => !EXEMPT.has(path))
      .flatMap((path) =>
        [...readFileSync(join(SRC, path), "utf8").matchAll(RAW_PALETTE)].map(
          ([match]) => `${path}: ${match}`,
        ),
      );

    expect(offenders).toEqual([]);
  });
});
