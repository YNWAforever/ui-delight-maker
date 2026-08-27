import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * No route may print a thrown value's own text into the page.
 *
 * This is the regression that keeps coming back. Six route files carry a comment naming it
 * — "the root boundary renders `{error.message}` into the page body" — and each of them
 * fixed it locally by adding an `errorComponent` of its own, while the boundary they were
 * describing went on doing it. `ErrorState` and `toSafeErrorMessage` exist so this cannot
 * happen, but nothing stopped a route from bypassing both, and thirty-five route files is
 * more than a review reliably reads.
 *
 * What leaks is not hypothetical: a Neon failure quotes the failing SQL, and Postgres emits
 * `password authentication failed for user "clientops_rw"` — the database role — and
 * `permission denied for table accounts` — a table name. So this guard is source-level. A
 * render test can only cover the routes someone remembered to write one for.
 *
 * ── How the matching works ────────────────────────────────────────────────────────────
 * The file is parsed with the TypeScript compiler rather than grepped, for two reasons.
 *
 * Comments are not part of the AST at all, so the six files that *discuss* `{error.message}`
 * in prose — including this rule's own explanations — are invisible to the scan for free.
 * A regex would have to strip line comments, block comments and JSX's brace-wrapped block
 * comment form itself before it could say anything true.
 *
 * And it lets the check be about position rather than text. Only two positions are
 * flagged: a `{…}` interpolation among a JSX element's *children*, which is page body text,
 * and an attribute on an intrinsic element such as `<p title={…}>`, which the DOM renders
 * directly. An attribute on a component — `<ErrorState description={…}>` — is deliberately
 * not flagged, because that component filters its own props; that guarantee is tested in
 * `src/components/sales/__tests__/states.test.tsx`.
 *
 * Within those positions a `.message` read is a finding only when its receiver looks like a
 * caught value (`error`, `err`, `e`, `queryError`, `(error as Error)` …), so a real domain
 * field such as `notification.message` is left alone; and it is exempt when it is already
 * inside a `toSafeErrorMessage(…)` call, which is the sanctioned way to render one.
 */

const ROUTES_DIR = fileURLToPath(new URL("../", import.meta.url));

/** The sanctioned filter. Anything passing through it is safe by construction. */
const SANITISER = "toSafeErrorMessage";

/** Identifiers that name a caught value rather than a domain record. */
const ERROR_RECEIVER = /^(e|ex|err|error|caught|cause|failure|thrown)$/i;

function routeSourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__tests__" || entry.name === "node_modules") continue;
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) routeSourceFiles(full, found);
    else if (entry.name.endsWith(".tsx")) found.push(full);
  }
  return found;
}

/** `error`, `err`, `queryError`, and the identifiers inside `(error as Error)`. */
function readsLikeCaughtValue(receiver: ts.Node): boolean {
  let errorish = false;
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) && (ERROR_RECEIVER.test(node.text) || /error$/i.test(node.text))) {
      errorish = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(receiver);
  return errorish;
}

function isInsideSanitiser(node: ts.Node, stopAt: ts.Node): boolean {
  for (let current = node.parent; current && current !== stopAt.parent; current = current.parent) {
    if (
      ts.isCallExpression(current) &&
      ts.isIdentifier(current.expression) &&
      current.expression.text === SANITISER
    ) {
      return true;
    }
  }
  return false;
}

/** A `.message` or `["message"]` read anywhere under `root`. */
function unsanitisedMessageReads(root: ts.Node): ts.Node[] {
  const hits: ts.Node[] = [];
  const visit = (node: ts.Node) => {
    const receiver = ts.isPropertyAccessExpression(node)
      ? node.name.text === "message"
        ? node.expression
        : null
      : ts.isElementAccessExpression(node) &&
          ts.isStringLiteralLike(node.argumentExpression) &&
          node.argumentExpression.text === "message"
        ? node.expression
        : null;

    if (receiver && readsLikeCaughtValue(receiver) && !isInsideSanitiser(node, root)) {
      hits.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return hits;
}

/** The two positions whose contents the user actually reads off the screen. */
function rendersToTheUser(expression: ts.JsxExpression): boolean {
  const parent = expression.parent;
  if (ts.isJsxElement(parent) || ts.isJsxFragment(parent)) return true;

  if (ts.isJsxAttribute(parent)) {
    // JsxAttribute → JsxAttributes → the opening or self-closing element that owns it.
    const { tagName } = parent.parent.parent;
    // Lowercase tag names are intrinsic DOM elements; a capitalised one is a component that
    // owns what it does with the prop.
    return ts.isIdentifier(tagName) && /^[a-z]/.test(tagName.text);
  }

  return false;
}

type Finding = { file: string; line: number; text: string };

export function findRawErrorRenders(fileName: string, source: string): Finding[] {
  const parsed = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const findings: Finding[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isJsxExpression(node) && node.expression && rendersToTheUser(node)) {
      for (const hit of unsanitisedMessageReads(node.expression)) {
        findings.push({
          file: fileName,
          line: parsed.getLineAndCharacterOfPosition(hit.getStart(parsed)).line + 1,
          text: hit.getText(parsed),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);

  return findings;
}

describe("no route renders a thrown value's own text", () => {
  const files = routeSourceFiles(ROUTES_DIR.replace(/\/$/, ""));

  it("scans every route file, so a broken glob cannot pass as a clean result", () => {
    // The failure mode of a source guard is finding nothing because it looked nowhere.
    expect(files.length).toBeGreaterThan(30);
    expect(files.some((file) => file.endsWith("__root.tsx"))).toBe(true);
  });

  it("flags a bare interpolation and clears the sanctioned forms", () => {
    // The detector is tested before it is trusted. Each of these is a shape that has either
    // appeared in this codebase or is the thing a fix looks like.
    const flagged = (source: string) => findRawErrorRenders("sample.tsx", source).length;

    expect(flagged("const A = () => <p>{error.message}</p>;")).toBe(1);
    expect(flagged("const A = () => <p>{err?.message}</p>;")).toBe(1);
    expect(flagged("const A = () => <p>{(error as Error).message}</p>;")).toBe(1);
    expect(flagged('const A = () => <p>{error.message ?? "Failed"}</p>;')).toBe(1);
    expect(flagged('const A = () => <p>{e instanceof Error ? e.message : "Failed"}</p>;')).toBe(1);
    expect(flagged("const A = () => <p>{queryError.message}</p>;")).toBe(1);
    expect(flagged("const A = () => <p title={error.message}>x</p>;")).toBe(1);

    expect(flagged("const A = () => <p>{toSafeErrorMessage(error)}</p>;")).toBe(0);
    expect(flagged("const A = () => <p>{toSafeErrorMessage(error.message)}</p>;")).toBe(0);
    // A real domain field that happens to be called `message`.
    expect(flagged("const A = () => <p>{notification.message}</p>;")).toBe(0);
    // Prose about the rule, which is how six of these files describe the bug they fixed.
    expect(flagged("// renders {error.message}\nconst A = () => <p>ok</p>;")).toBe(0);
    expect(flagged("/** boundary renders `{error.message}` */\nconst A = () => <p>ok</p>;")).toBe(
      0,
    );
    // A component's own prop is the component's business — ErrorState filters everything it
    // is handed, which is what makes `error={error}` the recommended call.
    expect(flagged("const A = () => <ErrorState description={error.message} />;")).toBe(0);
    // Not rendered: a toast argument is not JSX, and is out of this guard's scope.
    expect(flagged("const A = () => { toast.error(error.message); return <p>ok</p>; };")).toBe(0);
  });

  it("finds no raw error text in any route", () => {
    const findings = files.flatMap((file) =>
      findRawErrorRenders(file, readFileSync(file, "utf8")).map((finding) => {
        // Reported repo-relative so the failure message points at the file to open.
        const path = finding.file.replace(/\\/g, "/");
        return `${path.slice(path.lastIndexOf("src/"))}:${finding.line} — ${finding.text}`;
      }),
    );

    expect(findings).toEqual([]);
  });
});
