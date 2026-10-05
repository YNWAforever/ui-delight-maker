import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Status text must stay readable in both themes.
 *
 * Badges and amber helper text put `tone-*-fg` text on a 12 % tint of the tone over the card,
 * or straight on the page. The dark warning pair once measured 1.33:1 and three light pairs
 * 3.77–4.16:1 (audit UX-02, UX-04). This reads the real tokens from `src/styles.css` and holds
 * every pair to WCAG AA for small text, 4.5:1.
 */
const css = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`No ${selector} block in styles.css`);
  return css.slice(start, css.indexOf("}", start));
}

function token(body: string, name: string): [number, number, number] {
  const match = body.match(new RegExp(`--${name}:\\s*oklch\\(([\\d.]+) ([\\d.]+) ([\\d.]+)\\)`));
  if (!match) throw new Error(`--${name} is not a plain oklch() value`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function toSrgb([L, C, h]: [number, number, number]): number[] {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => {
    const c = Math.min(1, Math.max(0, v));
    return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  });
}

function luminance(rgb: number[]): number {
  const [r, g, b] = rgb.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: number[], b: number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const over = (fg: number[], alpha: number, bg: number[]) =>
  fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));

const TONES = [
  ["info", "info"],
  ["success", "success"],
  ["warning", "warning"],
  ["danger", "destructive"],
] as const;

describe.each([
  ["light", ":root"],
  ["dark", ".dark"],
])("%s theme status text", (_theme, selector) => {
  const body = block(selector);
  const card = toSrgb(token(body, "card"));
  const page = toSrgb(token(body, "background"));

  it.each(TONES)("%s text is at least 4.5:1 on its tint and on the page", (fg, tint) => {
    const text = toSrgb(token(body, `tone-${fg}-fg`));
    const tinted = over(toSrgb(token(body, tint)), 0.12, card);
    expect(contrast(text, tinted)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(text, page)).toBeGreaterThanOrEqual(4.5);
  });

  it("neutral text is at least 4.5:1 on the muted surface", () => {
    const text = toSrgb(token(body, "tone-neutral-fg"));
    expect(contrast(text, toSrgb(token(body, "muted")))).toBeGreaterThanOrEqual(4.5);
  });
});

describe.each([
  ["light", ":root"],
  ["dark", ".dark"],
])("%s theme controls", (_theme, selector) => {
  const body = block(selector);

  it("draws field boundaries at 3:1 or more on the card and the page", () => {
    // WCAG 1.4.11. The input border measured 1.31:1 light and 1.56:1 dark (UX-21).
    const input = toSrgb(token(body, "input"));
    expect(contrast(input, toSrgb(token(body, "card")))).toBeGreaterThanOrEqual(3);
    expect(contrast(input, toSrgb(token(body, "background")))).toBeGreaterThanOrEqual(3);
  });

  it("keeps text readable on the hover and menu-highlight surface", () => {
    const surface = toSrgb(token(body, "accent"));
    expect(contrast(toSrgb(token(body, "accent-foreground")), surface)).toBeGreaterThanOrEqual(4.5);
    // Ghost buttons and menu items keep their own text colour on hover, so it must hold too.
    expect(contrast(toSrgb(token(body, "foreground")), surface)).toBeGreaterThanOrEqual(4.5);
  });
});

describe.each([
  ["light", ":root"],
  ["dark", ".dark"],
])("%s theme solid chips and buttons", (_theme, selector) => {
  const body = block(selector);

  // Solid fills carry their own foreground: severity chips, job-sheet badges, primary and
  // destructive buttons. axe measured the dark destructive pair at 3.25:1 (Phase 4).
  it.each(["primary", "destructive", "success", "warning", "info"])(
    "%s-foreground is at least 4.5:1 on its fill",
    (tone) => {
      const fill = toSrgb(token(body, tone));
      const text = toSrgb(token(body, `${tone}-foreground`));
      expect(contrast(text, fill)).toBeGreaterThanOrEqual(4.5);
    },
  );
});

it("uses a quiet, low-chroma hover surface in the light theme", () => {
  // UX-22: --accent was a saturated blue, so every ghost and outline button flashed blue.
  const [lightness, chroma] = token(block(":root"), "accent");
  expect(lightness).toBeGreaterThan(0.9);
  expect(chroma).toBeLessThan(0.03);
});
