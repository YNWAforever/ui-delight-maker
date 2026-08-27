import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * A registered child route has to be reachable, and its parent has to render it.
 *
 * Two admin routes shipped registered, loading and unreachable. `/admin/people/$id` had its
 * loader run and its component never mount, because `admin.people.tsx` returned a fragment
 * and never rendered an `Outlet` — so "Open full record" cost a full document reload and
 * landed the reader back on the directory with nothing selected. `/admin/teams/$id` was
 * worse: nothing in the product linked to it at all, so it was reachable only by typing a
 * URL, and even then it rendered the parent — which made its own "Back to organization" link
 * dead as well.
 *
 * This is a source-level guard for the same reason `-no-raw-error-text-in-routes.test.ts`
 * is: the existing route-access test stubs `Outlet: () => null`, so a render test cannot
 * tell a rendered Outlet from an absent one, and every other nested parent in the repo
 * already gets this right by convention rather than by anything that checks.
 */

const ROUTES_DIR = fileURLToPath(new URL("../", import.meta.url)).replace(/\/$/, "");
const SRC_DIR = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");

function read(relative: string): string {
  return readFileSync(`${ROUTES_DIR}/${relative}`, "utf8");
}

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "__tests__") continue;
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) sourceFiles(full, found);
    else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) found.push(full);
  }
  return found;
}

/** Every parent route in the repo that has at least one child route file beside it. */
const NESTED_PARENTS = [
  { parent: "admin.people.tsx", path: "/admin/people" },
  { parent: "admin.teams.tsx", path: "/admin/teams" },
  { parent: "accounts.tsx", path: "/accounts" },
  { parent: "leads.tsx", path: "/leads" },
  { parent: "quotes.tsx", path: "/quotes" },
] as const;

describe("nested admin routes", () => {
  it.each(NESTED_PARENTS)("$parent renders an Outlet for its child routes", ({ parent, path }) => {
    const source = read(parent);

    expect(source).toContain("Outlet");
    expect(source).toContain("<Outlet />");
    // The repo's idiom: render the index only on the exact path, otherwise hand over.
    expect(source).toContain(`useIsExactPath("${path}")`);
  });

  it.each([
    { child: "/admin/people/$id", token: 'to="/admin/people/$id"' },
    { child: "/admin/teams/$id", token: 'to="/admin/teams/$id"' },
  ])("$child has at least one inbound router link", ({ token }) => {
    const linked = sourceFiles(SRC_DIR).filter((file) =>
      readFileSync(file, "utf8").includes(token),
    );

    expect(linked.length).toBeGreaterThan(0);
  });

  it("links to those children with Link, not a raw anchor", () => {
    // A raw `<a href>` to an in-app route is a full document reload that re-runs the root
    // shell fetch and the `/admin` navigation fetch. Both admin detail links used to be one.
    for (const file of sourceFiles(`${SRC_DIR}/components/admin`)) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/href=\{?["'`]\/admin/);
    }
  });
});
