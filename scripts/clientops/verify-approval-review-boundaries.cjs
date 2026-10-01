// Real isolated UAT boundaries. Called only after source-bound role and timing capture.
module.exports = async function verifyBoundaries({
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
}) {
  const fs = require("node:fs"),
    path = require("node:path"),
    assert = require("node:assert/strict"),
    { randomUUID } = require("node:crypto");
  report.boundaries = [];
  report.neighbors = {};
  const grants = [];
  const failed = (raw, status = 200) => status >= 400 || /\$TSR\/Error/.test(raw);
  const snapshot = async (f) => ({
    approval: (
      await pool.query(
        "select status,row_version,assigned_to,reviewer_notes,decided_at from human_approvals where id=$1",
        [f.id],
      )
    ).rows[0],
    run: (
      await pool.query("select status,human_review_required from agent_runs where id=$1", [f.runId])
    ).rows[0],
    audits: (
      await pool.query(
        "select count(*)::int n from activity_logs where object_type='approval' and object_id=$1",
        [f.id],
      )
    ).rows[0].n,
    receipts: (
      await pool.query(
        "select count(*)::int n from command_receipts where result->>'id'=$1 or result->'approval'->>'id'=$1",
        [f.id],
      )
    ).rows[0].n,
  });
  const isolatedFixture = (label, version = 0, options = {}) =>
    fixture(label, version, { freshLead: true, ...options });
  function requestFor(f, decision = "approved") {
    const encoded = JSON.parse(template.body);
    function dataNode(node) {
      if (!node || typeof node !== "object") return null;
      if (
        Array.isArray(node.p?.k) &&
        ["id", "decision", "expectedVersion", "idempotencyKey"].every((key) =>
          node.p.k.includes(key),
        )
      )
        return node.p;
      for (const value of Object.values(node)) {
        const found = dataNode(value);
        if (found) return found;
      }
      return null;
    }
    const data = dataNode(encoded);
    assert(data, "Actual TanStack UI command data must be present");
    const value = (key) => data.v[data.k.indexOf(key)];
    assert.equal(value("id").s, template.approvalId);
    assert.equal(value("id").t, 1);
    assert.equal(value("decision").t, 1);
    assert.equal(value("expectedVersion").t, 0);
    assert.equal(value("idempotencyKey").t, 1);
    assert(Number.isSafeInteger(value("expectedVersion").s));
    value("id").s = f.id;
    value("decision").s = decision;
    value("expectedVersion").s = f.version;
    value("idempotencyKey").s = randomUUID();
    return { ...template, body: JSON.stringify(encoded) };
  }
  async function direct(ctx, request, label) {
    assert.equal(new URL(request.url).origin, new URL(target).origin);
    const response = await ctx.request.post(request.url, {
      headers: request.headers,
      data: request.body,
    });
    const raw = await response.text();
    fs.writeFileSync(path.join(dir, label + ".response.private.txt"), raw);
    return { status: response.status(), raw, error: failed(raw, response.status()) };
  }
  async function uiDecision(
    role,
    route,
    f,
    decision = "Approve",
    { doubleClick = false, afterDialog } = {},
  ) {
    const ctx = await ownContext(role),
      p = await open(ctx, route, f, role);
    const posts = [];
    p.on("request", (r) => {
      if (r.method() === "POST" && r.postData()?.includes(f.id)) posts.push(r);
    });
    try {
      await p.getByRole("button", { name: decision, exact: true }).click();
      const dialog = p.getByRole("alertdialog");
      await dialog.waitFor();
      if (afterDialog) await afterDialog();
      const wait = p.waitForResponse(
        (r) => r.request().method() === "POST" && r.request().postData()?.includes(f.id),
      );
      const button = dialog.getByRole("button", { name: decision, exact: true });
      if (doubleClick) await button.dblclick();
      else await button.click();
      const response = await wait,
        raw = await response.text();
      fs.writeFileSync(
        path.join(dir, role + route.replace("/", "-") + "-" + f.id + ".response.private.txt"),
        raw,
      );
      await p.waitForLoadState("networkidle");
      await p.screenshot({
        path: path.join(dir, role + route.replace("/", "-") + "-" + f.id + ".png"),
        fullPage: true,
      });
      assert.equal(posts.length, 1, "One mounted confirmation must produce one POST");
      return {
        error: failed(raw, response.status()),
        raw,
        status: response.status(),
        request: capture(response),
        state: await snapshot(f),
        postCount: posts.length,
      };
    } catch (e) {
      await p.screenshot({ path: path.join(dir, "boundary-failure.png"), fullPage: true });
      fs.writeFileSync(
        path.join(dir, "boundary-failure.private.txt"),
        String(e.stack) + "\n" + (await p.locator("body").innerText()),
      );
      throw e;
    } finally {
      await ctx.close();
    }
  }
  async function grant(role, f, effect, expiry = null) {
    const row = (
      await pool.query(
        "insert into permission_overrides(profile_id,capability,effect,resource_type,resource_id,reason,granted_by,expires_at) values($1,'approvals.decide',$2,'human_approval',$3,'Synthetic Approval Review UAT',$4,$5) returning id",
        [who(role).profileId, effect, f.id, who("super_admin").profileId, expiry],
      )
    ).rows[0];
    grants.push(row.id);
    return row.id;
  }
  const revoke = async (id) =>
    pool.query("update permission_overrides set revoked_at=now(),revoked_by=$2 where id=$1", [
      id,
      who("super_admin").profileId,
    ]);
  const record = (label, data) => {
    report.boundaries.push({ label, ...data });
    console.log(JSON.stringify({ phase: "after", boundary: label, pass: true }));
  };
  try {
    for (const role of ["super_admin", "admin", "manager"])
      for (const route of ["/approvals", "/ai-review"]) {
        report.stage = "version7 " + role + " " + route;
        const f = await isolatedFixture(role + route + " version7", 7),
          r = await uiDecision(role, route, f);
        assert(!r.error);
        assert.equal(r.state.approval.status, "approved");
        assert.equal(Number(r.state.approval.row_version), 8);
        assert.equal(r.state.audits, 1);
        assert.equal(r.state.receipts, 1);
        assert.deepEqual(r.state.run, { status: "completed", human_review_required: false });
        record("version7-allowed", {
          role,
          route,
          version: 8,
          postCount: 1,
          auditCount: 1,
          receiptCount: 1,
          liveUi: true,
        });
      }
    const denied = await isolatedFixture("denied roles", 7),
      before = await snapshot(denied);
    for (const role of ["sales", "client_success", "accounting", "read_only"])
      for (const route of ["/approvals", "/ai-review"]) {
        report.stage = "server denial " + role + " " + route;
        const ctx = await ownContext(role),
          p = await open(ctx, route, denied, role);
        try {
          const button = p.getByRole("button", { name: "Approve", exact: true });
          assert((await button.count()) === 0 || (await button.first().isDisabled()));
          const r = await direct(ctx, requestFor(denied), "deny-" + role + route.replace("/", "-"));
          assert(r.error);
          assert(/FORBIDDEN|do not have this capability|not authorized/i.test(r.raw));
          assert.deepEqual(await snapshot(denied), before);
          const restricted =
            (await p
              .getByText(
                "Restricted. This approval is about a record you do not have permission to view.",
                { exact: true },
              )
              .count()) > 0;
          if (restricted) {
            assert.equal(await p.getByText(denied.summary, { exact: true }).count(), 0);
            assert(/Restricted/.test(await p.locator("details pre").innerText()));
          }
          record("own-role-server-denied", {
            role,
            route,
            dbUnchanged: true,
            controlsBlocked: true,
            restrictedContentHidden: restricted,
            status: r.status,
          });
        } finally {
          await ctx.close();
        }
      }
    const allowed = await isolatedFixture("reader scoped allow"),
      allowId = await grant("read_only", allowed, "allow");
    try {
      const ctx = await ownContext("read_only"),
        p = await open(ctx, "/ai-review", allowed, "read_only");
      assert(await p.getByRole("button", { name: "Approve", exact: true }).isDisabled());
      await ctx.close();
      const r = await uiDecision("read_only", "/approvals", allowed);
      assert(!r.error);
      assert.equal(r.state.approval.status, "approved");
      record("scoped-reader-allow", {
        role: "read_only",
        route: "/approvals",
        liveUi: true,
        aiRoleAdvisoryStillDisabled: true,
        serverAllowed: true,
      });
    } finally {
      await revoke(allowId);
    }
    const revokeFixture = await isolatedFixture("grant removed after dialog"),
      revokeId = await grant("read_only", revokeFixture, "allow"),
      prior = await snapshot(revokeFixture);
    const revoked = await uiDecision("read_only", "/approvals", revokeFixture, "Approve", {
      afterDialog: () => revoke(revokeId),
    });
    assert(revoked.error);
    assert.deepEqual(revoked.state, prior);
    assert(/FORBIDDEN|do not have this capability|not authorized/i.test(revoked.raw));
    record("grant-withdrawn-after-dialog", {
      role: "read_only",
      liveUi: true,
      serverDenied: true,
      dbUnchanged: true,
    });
    for (const [role, effect, expiry, label] of [
      ["manager", "deny", null, "scoped-manager-deny"],
      ["read_only", "allow", new Date(Date.now() - 60000), "expired-reader-allow"],
    ]) {
      const f = await isolatedFixture(label),
        id = await grant(role, f, effect, expiry),
        old = await snapshot(f);
      try {
        const ctx = await ownContext(role);
        try {
          const r = await direct(ctx, requestFor(f), label);
          assert(r.error);
          assert(/FORBIDDEN|do not have this capability|not authorized/i.test(r.raw));
          assert.deepEqual(await snapshot(f), old);
          record(label, { role, serverDenied: true, dbUnchanged: true });
        } finally {
          await ctx.close();
        }
      } finally {
        await revoke(id);
      }
    }
    const f1 = await isolatedFixture("reader allow one row"),
      f2 = await isolatedFixture("reader outside override");
    const scopeId = await grant("read_only", f1, "allow");
    try {
      const ctx = await ownContext("read_only");
      try {
        const old = await snapshot(f2),
          r = await direct(ctx, requestFor(f2), "reader-outside-scope");
        assert(r.error);
        assert.deepEqual(await snapshot(f2), old);
        record("outside-scoped-allow", {
          role: "read_only",
          serverDenied: true,
          dbUnchanged: true,
        });
      } finally {
        await ctx.close();
      }
    } finally {
      await revoke(scopeId);
    }
    for (const route of ["/approvals", "/ai-review"]) {
      const f = await isolatedFixture("double click " + route, 7),
        r = await uiDecision("manager", route, f, "Approve", { doubleClick: true });
      assert(!r.error);
      assert.equal(r.state.approval.row_version, 8);
      assert.equal(r.state.audits, 1);
      assert.equal(r.state.receipts, 1);
      record("native-double-click", {
        route,
        postCount: 1,
        version: 8,
        auditCount: 1,
        receiptCount: 1,
      });
    }
    for (const route of ["/approvals", "/ai-review"]) {
      report.stage = "explicit original retry " + route;
      const f = await isolatedFixture("explicit original retry " + route, 7),
        ctx = await ownContext("manager");
      try {
        const p = await open(ctx, route, f),
          requests = [];
        let original;
        await p.route("**/_serverFn/**", async (intercepted) => {
          const q = intercepted.request();
          if (q.method() === "POST" && q.postData()?.includes(f.id)) {
            const req = capture({ request: () => q });
            requests.push(req);
            if (!original) {
              original = req;
              await intercepted.abort("failed");
              return;
            }
          }
          await intercepted.continue();
        });
        await p.getByRole("button", { name: "Approve", exact: true }).click();
        await p
          .getByRole("alertdialog")
          .getByRole("button", { name: "Approve", exact: true })
          .click();
        await p
          .getByText(
            "The result is unconfirmed. Refresh to check the recorded status before retrying.",
            { exact: true },
          )
          .waitFor();
        await p.waitForLoadState("networkidle");
        const pending = await snapshot(f);
        assert.equal(pending.approval.status, "pending");
        assert.equal(pending.approval.row_version, 7);
        assert.equal(pending.audits, 0);
        assert.equal(pending.receipts, 0);
        await p.getByRole("button", { name: "Approve", exact: true }).click();
        const wait = p.waitForResponse(
          (r) => r.request().method() === "POST" && r.request().postData()?.includes(f.id),
        );
        await p
          .getByRole("alertdialog")
          .getByRole("button", { name: "Approve", exact: true })
          .click();
        const response = await wait;
        assert(!failed(await response.text(), response.status()));
        await p.waitForLoadState("networkidle");
        assert.equal(requests.length, 2);
        assert.equal(requests[1].body, original.body);
        const state = await snapshot(f);
        assert.equal(state.approval.status, "approved");
        assert.equal(state.approval.row_version, 8);
        assert.equal(state.audits, 1);
        assert.equal(state.receipts, 1);
        const replay = await direct(
          ctx,
          original,
          "explicit-retry-original" + route.replace("/", "-"),
        );
        assert(!replay.error);
        assert.deepEqual(await snapshot(f), state);
        await p.screenshot({
          path: path.join(dir, "explicit-retry" + route.replace("/", "-") + ".png"),
          fullPage: true,
        });
        record("explicit-original-payload-retry", {
          route,
          inducedFault: "first actual UI request aborted before forwarding",
          originalPayloadAndKeyPreserved: true,
          onlyOneDatabaseCommit: true,
          version: 8,
          auditCount: 1,
          receiptCount: 1,
          originalReplayUnchanged: true,
        });
      } finally {
        await ctx.close();
      }
    }
    report.stage = "opposed actual actors";
    const race = await isolatedFixture("opposed two-role race", 7),
      actors = [];
    const held = [],
      release = [];
    try {
      for (const [role, route] of [
        ["manager", "/approvals"],
        ["admin", "/ai-review"],
      ]) {
        const ctx = await ownContext(role),
          p = await open(ctx, route, race, role);
        actors.push({ role, route, ctx, p });
      }
      for (const [i, actor] of actors.entries())
        await actor.p.route("**/_serverFn/**", async (route) => {
          const q = route.request();
          if (q.method() === "POST" && q.postData()?.includes(race.id) && !held[i]) {
            held[i] = capture({ request: () => q });
            await new Promise((resolve) => (release[i] = resolve));
          }
          await route.continue();
        });
      const waits = actors.map((x) =>
        x.p.waitForResponse(
          (r) => r.request().method() === "POST" && r.request().postData()?.includes(race.id),
        ),
      );
      for (const [i, x] of actors.entries()) {
        await x.p
          .getByRole("button", { name: i === 0 ? "Approve" : "Reject", exact: true })
          .click();
        await x.p.getByRole("alertdialog").waitFor();
      }
      const clicks = actors.map((x, i) =>
        x.p
          .getByRole("alertdialog")
          .getByRole("button", { name: i === 0 ? "Approve" : "Reject", exact: true })
          .click(),
      );
      const end = Date.now() + 15000;
      while (release.filter(Boolean).length < 2) {
        assert(Date.now() < end, "Two actual requests must reach barrier");
        await new Promise((r) => setTimeout(r, 20));
      }
      release.forEach((r) => r());
      await Promise.all(clicks);
      const responses = await Promise.all(waits),
        raw = await Promise.all(responses.map((r) => r.text()));
      const errors = raw.map((body, i) => failed(body, responses[i].status()));
      assert.equal(errors.filter(Boolean).length, 1);
      assert(
        /STALE_ADMIN_STATE|CONFLICT|changed since|terminal decision/i.test(
          raw[errors.indexOf(true)],
        ),
      );
      const winner = errors.indexOf(false),
        state = await snapshot(race);
      assert.equal(state.approval.status, winner === 0 ? "approved" : "rejected");
      assert.equal(state.approval.row_version, 8);
      assert.equal(state.audits, 1);
      assert.equal(state.receipts, 1);
      const replay = await direct(
        actors[winner].ctx,
        held[winner],
        "opposed-winner-original-replay",
      );
      assert(!replay.error);
      assert.deepEqual(await snapshot(race), state);
      for (const [i, x] of actors.entries()) {
        fs.writeFileSync(path.join(dir, "race-" + x.role + ".response.private.txt"), raw[i]);
        await x.p.screenshot({ path: path.join(dir, "race-" + x.role + ".png"), fullPage: true });
      }
      record("two-permitted-actors-opposed", {
        actors: ["manager", "admin"],
        routes: ["/approvals", "/ai-review"],
        releasedTogether: true,
        winner: actors[winner].role,
        terminal: state.approval.status,
        version: 8,
        auditCount: 1,
        receiptCount: 1,
        originalReplayUnchanged: true,
      });
    } finally {
      release.forEach((r) => r());
      for (const x of actors) await x.ctx.close();
    }
    report.stage = "retained claim and assignment";
    const claim = await isolatedFixture("claim assignment", 7, { assignedTo: null }),
      ctx = await ownContext("manager");
    try {
      const p = await open(ctx, "/approvals", claim);
      await p.getByRole("button", { name: "Claim for review", exact: true }).click();
      await p.waitForLoadState("networkidle");
      let state = await snapshot(claim);
      assert.equal(state.approval.assigned_to, who("manager").profileId);
      assert.equal(state.approval.row_version, 8);
      const name = (
        await pool.query("select name from profiles where id=$1", [who("admin").profileId])
      ).rows[0].name;
      const combo = p.getByRole("combobox", {
        name: "Assign reviewer (inline) search",
        exact: true,
      });
      await combo.fill(name);
      await p.getByRole("button", { name, exact: true }).first().click();
      await p.waitForLoadState("networkidle");
      state = await snapshot(claim);
      assert.equal(state.approval.assigned_to, who("admin").profileId);
      assert.equal(state.approval.row_version, 9);
      assert.equal(state.approval.status, "pending");
      await p.screenshot({ path: path.join(dir, "retained-claim-assignment.png"), fullPage: true });
      report.neighbors.claimAssignment = { claimedVersion: 8, assignedVersion: 9, liveUi: true };
    } finally {
      await ctx.close();
    }
    report.stage = "retained manual handoff";
    const manual = await isolatedFixture("manual draft", 7, {
      approvalType: "message_send",
      contextData: {
        draft_message: "Synthetic Approval Review draft. No customer or provider delivery.",
      },
    });
    const approved = await uiDecision("manager", "/approvals", manual);
    assert(!approved.error);
    const manualCtx = await ownContext("manager");
    try {
      const p = await open(manualCtx, "/approvals", manual);
      await p.getByRole("button", { name: "Copy approved draft", exact: true }).waitFor();
      await p
        .getByRole("textbox", { name: "Manual send reference", exact: true })
        .fill("Synthetic Approval Review statement only");
      const wait = p.waitForResponse(
        (r) =>
          r.request().method() === "POST" && new URL(r.url()).pathname.startsWith("/_serverFn/"),
      );
      await p.getByRole("button", { name: "Record manual send", exact: true }).click();
      const res = await wait;
      assert(!failed(await res.text(), res.status()));
      await p
        .getByText(/Manual send recorded:/)
        .first()
        .waitFor();
      const state = (
        await pool.query("select * from approval_message_handoffs where approval_id=$1", [
          manual.id,
        ])
      ).rows[0];
      assert.equal(state.handoff_status, "manual_send_recorded");
      assert.equal(state.recorded_by, who("manager").profileId);
      const same = await direct(manualCtx, capture(res), "manual-original-key-replay");
      assert(!same.error);
      assert.deepEqual(
        (
          await pool.query("select * from approval_message_handoffs where approval_id=$1", [
            manual.id,
          ])
        ).rows[0],
        state,
      );
      await p.screenshot({ path: path.join(dir, "retained-manual.png"), fullPage: true });
      report.neighbors.manual = {
        liveUi: true,
        copyControlVisible: true,
        statementRecorded: true,
        replayUnchanged: true,
        noDeliveryClaim: true,
        noProviderConfigured: true,
      };
    } finally {
      await manualCtx.close();
    }
    report.stage = "retained original bulk receipt resume";
    const bulk = [];
    for (let i = 0; i < 21; i++) bulk.push(await isolatedFixture("bulk " + i));
    const bulkCtx = await ownContext("manager");
    try {
      const p = await open(bulkCtx, "/approvals", bulk.at(-1));
      for (const f of bulk)
        await p.getByRole("checkbox", { name: "Select row " + f.id, exact: true }).check();
      await p.getByRole("button", { name: "Approve", exact: true }).first().click();
      await p
        .getByRole("alertdialog")
        .getByRole("button", { name: "Approve all", exact: true })
        .click();
      const dialog = p.getByRole("dialog", { name: "Review bulk change" });
      await dialog.waitFor();
      const wait = p.waitForResponse(
        (r) => r.request().method() === "POST" && r.request().postData()?.includes("previewToken"),
      );
      await dialog.getByRole("button", { name: "Process first 20", exact: true }).click();
      const res = await wait;
      assert(!failed(await res.text(), res.status()));
      await p.getByText(/20 of 21 processed; 20 succeeded; 0 need review/).waitFor();
      const saved = await p.evaluate(() => sessionStorage.getItem("clientops:bulk:approvals"));
      assert(saved);
      const operationId = JSON.parse(saved.startsWith("{") ? saved : JSON.stringify(saved));
      assert.equal(typeof operationId, "string");
      const original = (
        await pool.query("select id,state,commit_key from bulk_operations where id=$1", [
          operationId,
        ])
      ).rows[0];
      assert.equal(original.state, "paused");
      assert(original.commit_key);
      await p.reload();
      await p.getByRole("button", { name: "Resume", exact: true }).waitFor();
      const resume = p.waitForRequest(
        (r) => r.method() === "POST" && r.postData()?.includes(operationId),
      );
      await p.getByRole("button", { name: "Resume", exact: true }).click();
      const req = await resume;
      assert(req.postData().includes(operationId));
      await p.getByText(/21 of 21 processed; 21 succeeded; 0 need review/).waitFor();
      const final = (
        await pool.query("select id,state,commit_key from bulk_operations where id=$1", [
          operationId,
        ])
      ).rows[0];
      assert.equal(final.state, "completed");
      assert.equal(final.commit_key, original.commit_key);
      assert.equal(
        await p.evaluate(() => sessionStorage.getItem("clientops:bulk:approvals")),
        operationId,
      );
      const committed = await Promise.all(bulk.map(snapshot));
      const replay = await direct(bulkCtx, capture(res), "bulk-original-commit-key-replay");
      assert(!replay.error);
      assert.deepEqual(await Promise.all(bulk.map(snapshot)), committed);
      for (const f of bulk) assert.equal((await snapshot(f)).approval.row_version, 1);
      await p.screenshot({
        path: path.join(dir, "retained-original-bulk-resume.png"),
        fullPage: true,
      });
      report.neighbors.bulk = {
        items: 21,
        firstStep: 20,
        originalReceiptRetainedAfterReload: true,
        originalCommitKeyPreserved: true,
        originalCommitReplayUnchanged: true,
        resumedOperationIdPreserved: true,
        liveUi: true,
        allApprovedVersion1: true,
      };
    } finally {
      await bulkCtx.close();
    }
  } catch (error) {
    fs.writeFileSync(path.join(dir, "boundary-error.private.txt"), String(error.stack));
    report.boundaryError = {
      name: error.name,
      code: error.code ?? null,
      details: "Private diagnostic retained",
    };
    throw error;
  } finally {
    for (const id of grants) await revoke(id);
    report.syntheticOverrideCleanup = true;
  }
};
