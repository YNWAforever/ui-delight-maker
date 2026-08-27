import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The write contract for the eight administration routes.
 *
 * These are source-level assertions because the properties they protect are properties of
 * *every* write on these screens, and a render test can only cover the handler someone
 * remembered to write one for. The admin slice is where that matters most: a mis-click here
 * removes a colleague's access, and the defects being pinned were all of the same shape —
 * a write with no `catch`, a success reported for a call that threw, an invalidation that
 * missed the cache another admin screen reads from.
 *
 * What each rule is defending:
 *
 * - **`useMutation` stays absent.** This codebase has none, and the guarantees §12.3 asks
 *   for are spelled out by hand instead: an in-flight lock, a `try`/`catch`, feedback, and
 *   invalidation. Introducing one idiom on one screen is how the other eight drift.
 * - **No raw thrown text in a toast.** `-no-raw-error-text-in-routes.test.ts` covers what is
 *   rendered into the page; a toast is not JSX and is out of its scope. Every admin write
 *   reaches `requireCapability`, which runs four raw SQL queries, so a driver failure here
 *   quotes SQL and can name the database role.
 * - **Capability-affecting writes re-resolve the admin rail.** `/admin` resolves its
 *   navigation in a `beforeLoad`, outside the query cache, so no `invalidateQueries` reaches
 *   it and a role change left a now-forbidden tab in the rail until a hard reload.
 * - **The audit export says what it is.** It re-runs the same paginated read, so it is this
 *   page — not the history the file name `fimmick-admin-audit.json` claimed.
 */

const ROUTES_DIR = fileURLToPath(new URL("../", import.meta.url)).replace(/\/$/, "");

const ADMIN_ROUTES = [
  "admin.tsx",
  "admin.index.tsx",
  "admin.people.tsx",
  "admin.people.$id.tsx",
  "admin.teams.tsx",
  "admin.teams.$id.tsx",
  "admin.access.tsx",
  "admin.audit.tsx",
] as const;

/** Routes that perform at least one write. `admin.tsx` and `admin.index.tsx` are read-only. */
const WRITING_ROUTES = [
  "admin.people.tsx",
  "admin.people.$id.tsx",
  "admin.teams.tsx",
  "admin.teams.$id.tsx",
  "admin.access.tsx",
  "admin.audit.tsx",
] as const;

/** Routes whose writes change what somebody is allowed to do. */
const CAPABILITY_AFFECTING_ROUTES = [
  "admin.people.tsx",
  "admin.people.$id.tsx",
  "admin.teams.tsx",
  "admin.teams.$id.tsx",
  "admin.access.tsx",
] as const;

function source(file: string): string {
  return readFileSync(`${ROUTES_DIR}/${file}`, "utf8");
}

/**
 * The file with its comments removed.
 *
 * Every "must not contain" rule below runs against this rather than the raw text, for the
 * reason the sibling raw-error guard spells out at length: the files that fixed these
 * defects *describe* them in prose — "there is no `useMutation` in this codebase", "the old
 * file name was fimmick-admin-audit.json" — so a scan of the raw source flags its own
 * explanation and the only way to pass is to delete the explanation.
 *
 * `://` is protected so a URL in a comment-free line is not mistaken for a line comment.
 */
function code(file: string): string {
  return source(file)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("administration write safety", () => {
  it.each(ADMIN_ROUTES)("%s introduces no useMutation", (file) => {
    expect(code(file)).not.toContain("useMutation");
  });

  it.each(WRITING_ROUTES)("%s sanitizes anything it puts in a toast", (file) => {
    const text = code(file);
    expect(text).toContain("toSafeErrorMessage");
    // The exact shapes that used to reach a toast verbatim on these screens.
    expect(text).not.toMatch(/toast\.error\(\s*error\.message/);
    expect(text).not.toMatch(/toast\.error\(\s*error instanceof Error \? error\.message/);
    expect(text).not.toMatch(/toast\.error\(\s*\w*[Ee]rror instanceof AdminError/);
  });

  it.each(WRITING_ROUTES)("%s guards its writes against re-entry", (file) => {
    const text = code(file);
    // A `useRef` lock, not a `useState` flag: state is asynchronous, so two clicks in the
    // same tick both read the stale `false`.
    expect(text).toMatch(/useRef\(false\)/);
  });

  it.each(CAPABILITY_AFFECTING_ROUTES)("%s re-resolves the admin rail after a write", (file) => {
    expect(source(file)).toContain("refreshAdminCapabilityScope");
  });

  it.each(ADMIN_ROUTES)("%s renders a sanitized boundary rather than the root one", (file) => {
    if (file === "admin.tsx") {
      // The layout route has no loader of its own; its `beforeLoad` redirects a denied actor.
      expect(source(file)).toContain("redirect");
      return;
    }
    expect(source(file)).toContain("errorComponent");
    expect(source(file)).toContain("ErrorState");
  });

  it.each(ADMIN_ROUTES)("%s takes its query keys from crmQueryKeys", (file) => {
    const text = code(file);
    if (!text.includes("queryKey")) return;
    // A literal array key is how two screens end up caching the same read twice and
    // invalidating only one of them.
    expect(text).not.toMatch(/queryKey:\s*\[/);
  });

  it("names the admin workspace as the context on every header", () => {
    for (const file of ADMIN_ROUTES) {
      const text = source(file);
      if (!text.includes("WorkspaceHeader")) continue;
      expect({ file, hasContext: text.includes('context="Administration"') }).toEqual({
        file,
        hasContext: true,
      });
    }
  });

  it("exports the audit log as CSV and does not name it the whole history", () => {
    const text = code("admin.audit.tsx");

    expect(text).toContain('from "@/lib/csv"');
    expect(text).toContain("toCsv(");
    // The old control emitted `JSON.stringify(result.items, null, 2)` under a hardcoded
    // `.json` download name, from a button labelled only "Export audit".
    expect(text).not.toContain("application/json");
    expect(text).not.toMatch(/anchor\.download\s*=\s*["'`]/);
    expect(text).toContain("csvFileName(");
    expect(text).toContain("Export this page (CSV)");
    expect(text).toContain("The full history is not exported");
  });

  it("gates the audit export on the capability the server checks", () => {
    // `audit.export` is Super Admin and Admin only, and the button used to render for anyone
    // who could open the page — including an actor holding only an `audit.view` override.
    expect(source("admin.audit.tsx")).toContain("access.exportAudit ?");
  });
});
