import { chromium } from "playwright";
import { redactUiDiagnostic } from "./redact-ui-diagnostics.ts";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import { resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import type { BrowserContextOptions, Page } from "playwright";
type Fixture = {
  version: string;
  db: string;
  connectionString: string;
  isolationConfirmed: boolean;
  accounts: { role: string; profileId: string; authUserId: string; email: string }[];
  runs: { id: string; kind: string }[];
};
type Runtime = {
  sha: string;
  workingSourceDiffSha256: string;
  serverEntrySha256: string;
  baseUrl: string;
  database: string;
  fixtureVersion: string;
  productionAccess: boolean;
};
type Post = { url: string; headers: Record<string, string>; body: string };
// Use the role's actual browser fetch so Origin/Sec-Fetch-Site and its own cookies are real.
async function nativePost(page: Page, post: Post) {
  return page.evaluate(async (request) => {
    const response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: request.body,
    });
    return { status: response.status };
  }, post);
}

type State = Exclude<NonNullable<BrowserContextOptions["storageState"]>, string>;
type RoleReceipt = {
  role: string;
  identitySha256: string;
  checks: Record<string, unknown>[];
  errors: string[];
  screenshots: { label: string; path: string; sha256: string }[];
  passed: boolean;
  failure: string | null;
};
/** Actual local SSR + real PostgreSQL + seven own live Auth sessions. No auth/DB result mocks.
 * Requires the operator's approved fixture/runtime/captured valid policy POST under .clientops-perf.
 * Screenshots and cookies stay private; publish only the deidentified receipt after review.
 * This deliberately does not accept a cloud or production target and is not a provider/AT gate. */
import assert from "node:assert/strict";
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
assert.ok(Object.keys(args).every((k) => ["runtime", "config", "policy-post", "out"].includes(k)));
const privateRoot = resolve(".clientops-perf");
const privatePath = (p: string) => {
  const full = resolve(p);
  assert.ok(full.startsWith(privateRoot + sep), "Private paths must be under .clientops-perf");
  return full;
};
const f = privatePath(args.out ?? ".clientops-perf/ai-gpt61-20261003");
const runtime = JSON.parse(
  readFileSync(privatePath(args.runtime ?? f + "/r11-local-runtime-result.json"), "utf8"),
) as Runtime;
const fixture = JSON.parse(
  readFileSync(privatePath(args.config ?? f + "/r11-local-uat.private.json"), "utf8"),
) as Fixture;
const policyPost = JSON.parse(
  readFileSync(privatePath(args["policy-post"] ?? f + "/r11-policy-post.private.json"), "utf8"),
) as Post;
assert.equal(fixture.isolationConfirmed, true);
assert.equal(runtime.productionAccess, false);
assert.equal(runtime.database, fixture.db);
const db = new URL(fixture.connectionString);
assert.equal(db.hostname, "127.0.0.1");
assert.equal(db.port, "64409");
assert.match(db.pathname, /^\/clientops_ai_uat_[a-f0-9]{32}$/);
const target = new URL(runtime.baseUrl);
assert.ok(["localhost", "127.0.0.1"].includes(target.hostname) && target.protocol === "http:");
const head = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
assert.equal(head.status, 0);
assert.equal(head.stdout.trim(), runtime.sha);
const diff = spawnSync("git", ["diff", "--", "src"], { encoding: "utf8" });
assert.equal(diff.status, 0);
assert.equal(
  createHash("sha256").update(diff.stdout).digest("hex"),
  runtime.workingSourceDiffSha256,
);
assert.equal(
  createHash("sha256").update(readFileSync("dist/server/server.js")).digest("hex"),
  runtime.serverEntrySha256,
);
assert.equal(new Set(fixture.accounts.map((a) => a.profileId)).size, 7);
assert.equal(new Set(fixture.accounts.map((a) => a.authUserId)).size, 7);
assert.match(new URL(policyPost.url).pathname, /^\/_serverFn\/[a-f0-9]{64}$/);
assert.ok(
  Object.keys(policyPost.headers).every((key) =>
    ["content-type", "x-tsr-serverfn"].includes(key.toLowerCase()),
  ),
  "Do not carry another actor's Cookie or Authorization header",
);
policyPost.url = runtime.baseUrl + new URL(policyPost.url).pathname;
mkdirSync(resolve(f, "native-ui"), { recursive: true });
const pool = new Pool({ connectionString: fixture.connectionString }),
  browser = await chromium.launch({ headless: true }),
  results: RoleReceipt[] = [],
  identities = new Set(),
  sessionIds = new Set(),
  fingerprints = new Set();
const safe = redactUiDiagnostic;
try {
  for (const role of [
    "super_admin",
    "admin",
    "manager",
    "sales",
    "client_success",
    "accounting",
    "read_only",
  ]) {
    const account = fixture.accounts.find((a) => a.role === role),
      state = JSON.parse(
        readFileSync(".clientops-perf/uat/sessions/" + role + ".json", "utf8"),
      ) as State;
    assert.ok(account);
    fingerprints.add(
      createHash("sha256")
        .update(JSON.stringify(state.cookies.map((c) => [c.name, c.value]).sort()))
        .digest("hex"),
    );
    state.cookies = state.cookies.map((c) => ({ ...c, domain: "localhost" }));
    state.origins = [];
    const context = await browser.newContext({
        storageState: state,
        viewport: { width: 1440, height: 1000 },
      }),
      page = await context.newPage(),
      errors: string[] = [],
      checks: Record<string, unknown>[] = [],
      screenshots: { label: string; path: string; sha256: string }[] = [];
    page.on("pageerror", (e) => errors.push(safe(e.message)));
    const check = (name: string, details: Record<string, unknown> = {}) =>
      checks.push({ name, passed: true, ...details });
    const screenshot = async (label: string) => {
      const file = f + "/native-ui/" + role + "-" + label + ".png";
      await page.screenshot({ path: file, fullPage: true });
      screenshots.push({
        label,
        path: file,
        sha256: createHash("sha256").update(readFileSync(file)).digest("hex"),
      });
    };
    let failure: string | null = null;
    try {
      const auth = await context.request.get(runtime.baseUrl + "/api/auth/get-session");
      assert.equal(auth.status(), 200);
      const payload = await auth.json(),
        user = payload.user ?? payload.data?.user,
        session = payload.session ?? payload.data?.session;
      assert.equal(user?.id, account.authUserId);
      assert.equal(user?.email, account.email);
      assert.ok(session?.id);
      assert.ok(
        Date.parse(session.expiresAt) > Date.now(),
        "Live non-expired own session required",
      );
      identities.add(user.id);
      sessionIds.add(session.id);
      const profile = (
        await pool.query("select role,status from profiles where id=$1", [account.profileId])
      ).rows[0];
      assert.equal(profile.role, role);
      assert.equal(profile.status, "active");
      check("own live Auth identity and persisted role");
      await page.goto(runtime.baseUrl + "/agents", { waitUntil: "networkidle", timeout: 90000 });
      const text = await page.locator("body").innerText();
      if (role === "accounting") {
        assert.ok(/not allowed|permission|access|forbidden|capability/i.test(text));
        check("agents.view denied on direct route");
        await screenshot("desktop-denied");
      } else {
        assert.ok(text.includes("Synthetic " + role));
        assert.ok(text.includes("All accessible AI runs"));
        const total = role === "manager" ? 125 : 129;
        assert.ok(text.includes("/ " + total + " matching runs."));
        check("scoped whole-queue count", { expected: total });
        assert.ok(text.includes("1 / 1 matching invocations"));
        check("own Note Tidy invocation only");
        await screenshot("desktop");
        await page.getByRole("combobox", { name: /Workflow/ }).selectOption("draft_quote");
        const quoteCount = role === "manager" ? 26 : 28;
        await page
          .getByText(new RegExp("This page: 25 / " + quoteCount + " matching runs"))
          .waitFor();
        await page.getByRole("button", { name: "Next run page", exact: true }).click();
        await page
          .getByText(
            new RegExp("This page: " + (quoteCount - 25) + " / " + quoteCount + " matching runs"),
          )
          .waitFor();
        check("legacy and new quote names share complete paginated workflow", {
          matching: quoteCount,
        });
        await page.reload({ waitUntil: "networkidle" });
        assert.ok(
          (await page.locator("body").innerText()).includes("/ " + quoteCount + " matching runs."),
        );
        check("filter/cursor survive native reload");
        if (role === "manager") {
          const foreign = fixture.runs.find((r) => r.kind === "foreign");
          assert.ok(foreign);
          await page.goto(runtime.baseUrl + "/agents?runId=" + foreign.id, {
            waitUntil: "networkidle",
          });
          assert.ok(
            (await page.locator("body").innerText()).includes("This page: 0 / 0 matching runs."),
          );
          check("foreign subject excluded from direct run query");
        }
        await page.goto(runtime.baseUrl + "/agents/draft-quote?tab=governance", {
          waitUntil: "networkidle",
        });
        const section = page.getByRole("region", { name: "Policy governance" });
        await section.getByText(/Stored status:/).waitFor();
        const canConfigure = ["super_admin", "admin"].includes(role);
        assert.equal(
          await section.getByLabel("Policy status", { exact: true }).isEnabled(),
          canConfigure,
        );
        assert.ok((await section.innerText()).includes("Human approval: Required (read-only)"));
        check("policy controls reflect server capability; humanApproval preserved", {
          canConfigure,
        });
        if (canConfigure) {
          const before = (await pool.query("select count(*)::int n from agent_policy_versions"))
            .rows[0].n;
          const authorized = await nativePost(page, policyPost);
          assert.equal(
            authorized.status,
            409,
            "Authorized same-origin stale-CAS control must reach the policy writer",
          );
          assert.equal(
            (await pool.query("select count(*)::int n from agent_policy_versions")).rows[0].n,
            before,
          );
          check("authorized same-origin stale policy POST409; zero writes");
        }
        if (!canConfigure) {
          const before = (await pool.query("select count(*)::int n from agent_policy_versions"))
            .rows[0].n;
          const denied = await nativePost(page, policyPost);
          assert.equal(denied.status, 403);
          const after = (await pool.query("select count(*)::int n from agent_policy_versions"))
            .rows[0].n;
          assert.equal(after, before);
          check("direct policy POST 403; no appended version");
        }
        await page.goto(runtime.baseUrl + "/agents", { waitUntil: "networkidle" });
        await page.setViewportSize({ width: 390, height: 844 });
        await screenshot("mobile390");
        const dims = await page.evaluate(() => ({
          width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
        }));
        assert.ok(
          dims.scrollWidth <= dims.width + 1,
          "390px horizontal overflow " + JSON.stringify(dims),
        );
        check("390px layout", { ...dims });
        await page.setViewportSize({ width: 1440, height: 1000 });
      }
      if (role === "accounting") {
        const before = (await pool.query("select count(*)::int n from agent_policy_versions"))
          .rows[0].n;
        const denied = await nativePost(page, policyPost);
        assert.equal(denied.status, 403);
        assert.equal(
          (await pool.query("select count(*)::int n from agent_policy_versions")).rows[0].n,
          before,
        );
        check("direct policy POST 403; no appended version");
      }
      assert.equal(errors.length, 0);
      check("no uncaught browser errors");
    } catch (e) {
      failure = safe(e instanceof Error ? e.message : e);
      try {
        await screenshot("failure");
      } catch {
        // Keep the original journey failure if the screenshot cannot be written.
      }
    }
    results.push({
      role,
      identitySha256: createHash("sha256").update(account.authUserId).digest("hex"),
      checks,
      errors,
      screenshots,
      passed: failure === null,
      failure,
    });
    writeFileSync(
      f + "/r11-native-browser-post-role-result.json",
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          sha: runtime.sha,
          workingSourceDiffSha256: runtime.workingSourceDiffSha256,
          serverEntrySha256: runtime.serverEntrySha256,
          fixtureVersion: fixture.version,
          database: fixture.db,
          distinctAuthUsers: identities.size,
          distinctSessions: sessionIds.size,
          distinctCookieSets: fingerprints.size,
          roles: results,
          providerReceipts: "not-tested",
          native200PercentZoom: "not-tested",
          manualAssistiveTechnology: "not-tested",
          productionAccess: false,
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ role, passed: failure === null, checks: checks.length, failure }));
    await context.close();
  }
  assert.equal(identities.size, 7);
  assert.equal(sessionIds.size, 7);
  assert.equal(fingerprints.size, 7);
  assert.equal(results.filter((r) => r.passed).length, 7, "Native role UAT failures remain");
} finally {
  await pool.end();
  await browser.close();
}
