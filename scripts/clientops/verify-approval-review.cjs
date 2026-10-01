// Source-bound synthetic ClientOps UAT. Private material stays under ignored .clientops-perf.
(async () => {
  const fs = require("node:fs"),
    path = require("node:path"),
    assert = require("node:assert/strict");
  const { randomUUID, createHash } = require("node:crypto");
  const { Pool } = require("@neondatabase/serverless");
  const { chromium } = require("playwright");
  const [phase, sha, target, previousReport, capturedTemplate, continuationScope] =
    process.argv.slice(2);
  assert(!continuationScope || (continuationScope === "neighbors" && previousReport));
  assert.equal(
    Boolean(previousReport),
    Boolean(capturedTemplate),
    "Continuation requires both actual report and captured template",
  );
  if (previousReport) assert.equal(phase, "after");
  assert(["before", "after"].includes(phase), "Expected before or after");
  assert.match(sha || "", /^[a-f0-9]{40}$/, "Full source SHA required");
  const root = ".clientops-perf/uat",
    c = JSON.parse(fs.readFileSync(root + "/private-config.json"));
  assert.equal(c.projectId, "polished-forest-15724329");
  assert.equal(c.branchId, "br-solitary-butterfly-b3883kwo");
  assert.equal(new URL(c.directUrl).pathname, "/clientops_uat");
  assert.equal(new URL(target).origin, "https://clientops-uat-20260930.vercel.app");
  assert.equal(new URL(c.appUrl).origin, new URL(target).origin);
  assert.equal(
    createHash("sha256").update(new URL(c.authUrl).origin).digest("hex"),
    "97b089a053f3c9844ea598a8f061b6c5b5abec7c6d64e0700644f6daec1901f1",
  );
  const roles = [
    "super_admin",
    "admin",
    "manager",
    "sales",
    "client_success",
    "accounting",
    "read_only",
  ];
  const users = JSON.parse(fs.readFileSync(root + "/credentials.json"));
  assert.deepEqual(users.map((x) => x.role).sort(), [...roles].sort());
  assert.equal(new Set(users.map((x) => x.authUserId)).size, 7);
  assert.equal(new Set(users.map((x) => x.profileId)).size, 7);
  const dir = path.join(root, "approval-review", phase, String(Date.now()));
  fs.mkdirSync(dir, { recursive: true });
  const report = {
    phase,
    sourceSha: sha,
    startedAt: new Date().toISOString(),
    success: false,
    database: "clientops_uat",
    roles: [],
    samples: [],
    fixtures: [],
    browser: null,
    runtime: { node: process.version, viewport: { width: 1440, height: 900 } },
    providersConfigured: false,
    noProductionOperation: true,
  };
  const pool = new Pool({ connectionString: c.directUrl });
  const browser = await chromium.launch({ channel: "chromium", headless: true });
  report.browser = browser.version();
  const who = (role) => users.find((x) => x.role === role);
  let leadId;
  const read = async (id) =>
    (
      await pool.query("select id,status,row_version,decided_at from human_approvals where id=$1", [
        id,
      ])
    ).rows[0];
  async function fixture(label, version = 0, options = {}) {
    const id = randomUUID(),
      runId = randomUUID(),
      summary = "Synthetic Approval Review " + label + " " + id.slice(0, 8);
    let subjectId = leadId;
    if (options.freshLead) {
      subjectId = randomUUID();
      await pool.query(
        "insert into leads(id,company_name,status,assigned_to) values($1,'Synthetic Approval Review boundary','qualified',$2)",
        [subjectId, who("manager").profileId],
      );
    }
    await pool.query(
      "insert into agent_runs(id,agent_name,workflow_type,trigger_type,subject_type,subject_id,status,human_review_required,created_by) values($1,'Qualification Agent','qualify_lead','manual','lead',$2,'waiting_approval',true,$3)",
      [runId, subjectId, who("manager").profileId],
    );
    await pool.query(
      "insert into human_approvals(id,agent_run_id,approval_type,requested_by,assigned_to,status,row_version,context_summary,context_data) values($1,$2,$6,$3,$7,'pending',$4,$5,$8::jsonb)",
      [
        id,
        runId,
        who("manager").profileId,
        version,
        summary,
        options.approvalType ?? "qualification_review",
        options.assignedTo === undefined ? who("manager").profileId : options.assignedTo,
        JSON.stringify(options.contextData ?? {}),
      ],
    );
    const f = {
      id,
      runId,
      summary,
      version,
      subjectId,
      approvalType: options.approvalType ?? "qualification_review",
    };
    report.fixtures.push(f);
    return f;
  }
  async function ownContext(role) {
    const account = who(role),
      file = root + "/sessions/" + role + ".json";
    let state = JSON.parse(fs.readFileSync(file));
    let ctx = await browser.newContext({ storageState: state, viewport: report.runtime.viewport });
    let res = await ctx.request.get(target + "/api/auth/get-session");
    let session = res.ok() ? await res.json() : {};
    let user = session.user ?? session.data?.user;
    if (user?.id !== account.authUserId) {
      await ctx.close();
      ctx = await browser.newContext({ viewport: report.runtime.viewport });
      const login = await ctx.newPage();
      await login.goto(target + "/login/sign-in");
      await login.getByLabel("Email", { exact: true }).fill(account.email);
      await login.getByLabel("Password", { exact: true }).fill(account.password);
      await login.getByRole("button", { name: "Login", exact: true }).click();
      await login.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
      res = await ctx.request.get(target + "/api/auth/get-session");
      session = await res.json();
      user = session.user ?? session.data?.user;
      assert.equal(user?.id, account.authUserId, "Own role login must match");
      await ctx.storageState({ path: file });
      await login.close();
    }
    assert.equal(user.id, account.authUserId);
    const profile = (
      await pool.query("select id,role,status from profiles where id=$1", [account.profileId])
    ).rows[0];
    assert.equal(profile.role, role);
    assert.equal(profile.status, "active");
    return ctx;
  }
  async function open(ctx, route, f, role = "manager") {
    const p = await ctx.newPage();
    report.stage = "navigate " + route;
    await p.goto(
      target +
        route +
        (route === "/approvals" ? "?type=" + (f.approvalType ?? "qualification_review") : ""),
    );
    if (role === "accounting" && route === "/ai-review") {
      await p.getByText("You do not have this capability", { exact: true }).waitFor();
      return p;
    }
    report.stage = "select row " + route;
    try {
      if (route === "/ai-review") {
        await p.getByRole("heading", { name: "AI Review", exact: true }).waitFor();
        await p.getByRole("row").nth(1).waitFor();
      } else
        await p
          .getByRole("button", { name: new RegExp(f.summary) })
          .first()
          .click();
      report.stage = "settle " + route;
      await p.waitForLoadState("networkidle");
      return p;
    } catch (e) {
      fs.writeFileSync(
        path.join(dir, "open-failure.private.txt"),
        await p.locator("body").innerText(),
      );
      fs.writeFileSync(path.join(dir, "error.private.txt"), String(e.stack));
      await p.screenshot({ path: path.join(dir, "open-failure.png"), fullPage: true });
      throw e;
    }
  }
  const capture = (response) => {
    const q = response.request();
    return {
      url: q.url(),
      body: q.postData(),
      headers: Object.fromEntries(
        Object.entries(q.headers()).filter(([k]) =>
          [
            "accept",
            "content-type",
            "x-tsr-serverfn",
            "origin",
            "referer",
            "sec-fetch-site",
          ].includes(k),
        ),
      ),
    };
  };
  let template;
  let boundaryContinuation;
  if (previousReport) {
    const previous = JSON.parse(fs.readFileSync(previousReport));
    assert.equal(previous.sourceSha, sha);
    assert.equal(previous.phase, "after");
    assert.equal(previous.samples.length, 60);
    for (const route of ["/approvals", "/ai-review"]) {
      const samples = previous.samples.filter((x) => x.route === route);
      assert.equal(samples.length, 30);
      assert(
        samples.every(
          (x) => x.postCount === 1 && x.databaseStatus === "approved" && x.databaseVersion === 1,
        ),
      );
    }
    report.samples = previous.samples;
    report.measurementDatasetBefore = previous.measurementDatasetBefore ?? previous.datasetBefore;
    report.continuation = {
      previousReportSha256: createHash("sha256")
        .update(fs.readFileSync(previousReport))
        .digest("hex"),
      retainedActualMeasurements: 60,
      reason: "Observer-only corrections; served application source unchanged",
    };
    if (continuationScope === "neighbors") {
      assert.equal(previous.boundaries.length, 24);
      assert.equal(previous.syntheticOverrideCleanup, true);
      const counts = previous.boundaries.reduce((counts, row) => {
        counts[row.label] = (counts[row.label] ?? 0) + 1;
        return counts;
      }, {});
      assert.deepEqual(counts, {
        "version7-allowed": 6,
        "own-role-server-denied": 8,
        "scoped-reader-allow": 1,
        "grant-withdrawn-after-dialog": 1,
        "scoped-manager-deny": 1,
        "expired-reader-allow": 1,
        "outside-scoped-allow": 1,
        "native-double-click": 2,
        "explicit-original-payload-retry": 2,
        "two-permitted-actors-opposed": 1,
      });
      assert(
        previous.boundaries
          .filter(
            (x) =>
              x.label === "explicit-original-payload-retry" ||
              x.label === "two-permitted-actors-opposed",
          )
          .every((x) => x.originalReplayUnchanged === true),
      );
      boundaryContinuation = previous.boundaries;
      report.boundaryContinuation = {
        verifiedActualCases: 24,
        previousReportSha256: createHash("sha256")
          .update(fs.readFileSync(previousReport))
          .digest("hex"),
        reason:
          "Validated native cases retained; neighboring workflow observer corrected with served application source and captured Origin transport unchanged",
      };
    }
    template = JSON.parse(fs.readFileSync(capturedTemplate));
    assert.equal(new URL(template.url).origin, new URL(target).origin);
    assert.equal(new URL(template.headers.origin).origin, new URL(target).origin);
  }
  const build = async () =>
    assert.equal(
      (await (await fetch(target + "/api/build")).json()).commitSha,
      sha,
      "UAT source changed",
    );
  try {
    await build();
    const db = (await pool.query("select current_database() name")).rows[0];
    assert.equal(db.name, "clientops_uat");
    report.datasetBefore = (
      await pool.query(
        "select (select count(*)::int from human_approvals) approvals,(select count(*)::int from agent_runs) runs",
      )
    ).rows[0];
    leadId = randomUUID();
    await pool.query(
      "insert into leads(id,company_name,status,assigned_to) values($1,'Synthetic Approval Review runtime','qualified',$2)",
      [leadId, who("manager").profileId],
    );
    const roleFixture = await fixture("role matrix");
    for (const role of roles) {
      const ctx = await ownContext(role);
      try {
        for (const route of ["/approvals", "/ai-review"]) {
          const p = await open(ctx, route, roleFixture, role);
          const allowed = ["super_admin", "admin", "manager"].includes(role);
          const button = p.getByRole("button", { name: "Approve", exact: true });
          const offered = (await button.count()) > 0;
          const enabled = offered && !(await button.first().isDisabled());
          assert.equal(enabled, allowed, role + " " + route + " baseline control");
          await p.screenshot({
            path: path.join(dir, role + route.replace("/", "-") + ".png"),
            fullPage: true,
          });
          report.roles.push({
            role,
            route,
            profileId: who(role).profileId,
            authUserId: who(role).authUserId,
            ownLiveSession: true,
            approveOffered: offered,
            approveEnabled: enabled,
          });
          await p.close();
        }
      } finally {
        await ctx.close();
      }
    }
    // Leave the matrix fixture readable, but unpark this task's run before the next fixture.
    await pool.query("update agent_runs set status='completed' where id=$1", [roleFixture.runId]);
    if (!previousReport) {
      const ctx = await ownContext("manager");
      try {
        for (const route of ["/approvals", "/ai-review"]) {
          for (let index = 0; index < 30; index++) {
            const f = await fixture(route.slice(1) + " sample " + index, 0);
            const p = await open(ctx, route, f),
              started = [];
            const timings = [],
              responseWork = [];
            p.on("request", (req) => {
              if (new URL(req.url()).pathname.startsWith("/_serverFn/"))
                started.push({ req, at: performance.now(), method: req.method() });
            });
            p.on("response", (res) => {
              const event = started.find((x) => x.req === res.request());
              if (event)
                responseWork.push(
                  res.finished().then(() =>
                    timings.push({
                      method: event.method,
                      durationMs: performance.now() - event.at,
                      status: res.status(),
                    }),
                  ),
                );
            });
            report.stage = "open confirmation " + route;
            await p.getByRole("button", { name: "Approve", exact: true }).click();
            const dialog = p.getByRole("alertdialog");
            await dialog.waitFor();
            const response = p.waitForResponse(
              (r) =>
                r.request().method() === "POST" &&
                new URL(r.url()).pathname.startsWith("/_serverFn/"),
            );
            report.stage = "confirm POST " + route;
            const begin = performance.now();
            await dialog.getByRole("button", { name: "Approve", exact: true }).click();
            const r = await response,
              raw = await r.text();
            if (!template) {
              template = { ...capture(r), approvalId: f.id };
              fs.writeFileSync(path.join(dir, "template.private.json"), JSON.stringify(template));
            }
            fs.writeFileSync(path.join(dir, f.id + ".response.private.txt"), raw);
            assert(r.status() < 400 && !/\$TSR\/Error/.test(raw), "Decision response must succeed");
            report.stage = "confirmed final UI " + route;
            try {
              if (route === "/ai-review")
                await p.getByRole("row").nth(1).getByText("Approved", { exact: true }).waitFor();
              else {
                // The terminal record leaves the pending queue; the selected detail stays visible.
                await p.getByText(f.summary, { exact: true }).first().waitFor();
                await p
                  .getByText("Approved", { exact: true })
                  .filter({ visible: true })
                  .first()
                  .waitFor();
              }
            } catch (e) {
              await p.screenshot({ path: path.join(dir, "decision-failure.png"), fullPage: true });
              fs.writeFileSync(
                path.join(dir, "decision-failure.private.txt"),
                await p.locator("body").innerText(),
              );
              fs.writeFileSync(path.join(dir, "error.private.txt"), String(e.stack));
              throw e;
            }
            const uiMs = performance.now() - begin;
            await p.waitForLoadState("networkidle");
            await Promise.all(responseWork);
            const after = await read(f.id);
            assert.equal(after.status, "approved");
            assert.equal(Number(after.row_version), 1);
            assert.equal(started.filter((x) => x.method === "POST").length, 1);
            report.samples.push({
              route,
              index,
              approvalId: f.id,
              fixtureVersion: 0,
              confirmToFinalUiMs: uiMs,
              postCount: 1,
              getCount: started.filter((x) => x.method === "GET").length,
              requests: timings,
              databaseStatus: after.status,
              databaseVersion: Number(after.row_version),
            });
            await p.close();
            if ((index + 1) % 10 === 0)
              console.log(JSON.stringify({ phase, route, samples: index + 1 }));
          }
        }
      } finally {
        await ctx.close();
      }
    }
    if (phase === "after")
      await require("./verify-approval-review-boundaries.cjs")({
        pool,
        dir,
        report,
        fixture,
        open,
        ownContext,
        who,
        capture,
        template,
        target,
        boundaryContinuation,
      });
    await build();
    report.success = true;
  } finally {
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(dir, "report.private.json"), JSON.stringify(report, null, 2));
    await browser.close();
    await pool.end();
    console.log(
      JSON.stringify({
        phase,
        sourceSha: sha,
        success: report.success,
        roles: report.roles.length,
        samples: report.samples.length,
        privateOutput: dir,
      }),
    );
  }
})().catch((e) => {
  console.error(JSON.stringify({ error: e.name, code: e.code ?? null }));
  process.exitCode = 1;
});
