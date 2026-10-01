// Native audit acceptance only. See docs/audit-fixes/2026-09-29/native-queue-polling-uat-2026-10-01.md.
// Requires the existing confirmed disposable localhost runtime and private own-role UAT files.
(async () => {
  const fs = require("node:fs"),
    path = require("node:path"),
    cp = require("node:child_process"),
    a = require("node:assert/strict"),
    { chromium } = require("playwright");
  const root = ".clientops-perf/uat",
    dir = root + "/native-queue-polling/" + Date.now(),
    base = "http://localhost:5199",
    sha = process.argv[2],
    nativeChannel = process.argv[3] ?? "chromium";
  a(["chromium", "chrome"].includes(nativeChannel), "Use a known installed native browser channel");
  const browserExecutable =
    nativeChannel === "chrome"
      ? path.join(
          process.env.ProgramFiles ?? "C:\\Program Files",
          "Google",
          "Chrome",
          "Application",
          "chrome.exe",
        )
      : chromium.executablePath();
  a(fs.existsSync(browserExecutable), "Selected native executable must already be installed");
  a.match(
    sha || "",
    /^[0-9a-f]{40}$/,
    "Pass the exact full SHA served by the isolated GET-only runtime",
  );
  fs.mkdirSync(dir, { recursive: true });
  const actors = JSON.parse(fs.readFileSync(root + "/credentials.json")),
    who = actors.find((x) => x.role === "manager"),
    state = JSON.parse(fs.readFileSync(root + "/sessions/manager.json")),
    cookie = state.cookies
      .filter((x) => x.name.startsWith("__Secure-neon-auth."))
      .map((x) => x.name + "=" + x.value)
      .join("; ");
  a(cookie);
  const map = {};
  for (const m of fs
    .readFileSync("dist/server/server.js", "utf8")
    .matchAll(/"([a-f0-9]{64})": \{\s*functionName: "([^"]+)"/g))
    map[m[2]] = m[1];
  const id = map.getApprovalsPage_createServerFn_handler;
  a(id);
  const snapshot = () =>
    JSON.parse(
      cp
        .execFileSync(
          "docker",
          [
            "exec",
            "clientops-quote-uat-pg-20260930",
            "psql",
            "-U",
            "clientops",
            "-d",
            "clientops_perf_r06_20260930",
            "-t",
            "-A",
            "-c",
            "select json_build_object('database',current_database(),'tasks',(select count(*) from tasks),'approvals',(select count(*) from human_approvals),'profiles_hash',(select md5(jsonb_agg(to_jsonb(t) order by id)::text) from profiles t),'tasks_hash',(select md5(jsonb_agg(to_jsonb(t) order by id)::text) from tasks t),'approvals_hash',(select md5(jsonb_agg(to_jsonb(t) order by id)::text) from human_approvals t),'receipts_hash',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'[]')) from command_receipts t),'audit_hash',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'[]')) from activity_logs t))",
          ],
          { encoding: "utf8" },
        )
        .trim(),
    );
  const report = {
    sourceSha: sha,
    startedAt: new Date().toISOString(),
    success: false,
    role: "manager",
    nativeChannel,
    sandboxDisabled: false,
    cases: [],
    responses: [],
    allServerRequests: [],
    visibilityEvents: [],
    launch:
      "headed native Chromium with own fresh profile; connectOverCDP noDefaults=true; no focus/media/download overrides",
    noClockOrVisibilityMocks: true,
  };
  let stage = "dataset",
    child,
    browser,
    ctx,
    p,
    cdp,
    logFd;
  const pending = [];
  const requestPhases = new WeakMap();
  let writes = 0,
    phase = "initial-load";
  try {
    const before = snapshot();
    a.equal(before.tasks, 10000);
    a.equal(before.approvals, 100000);
    report.dataset = {
      database: before.database,
      tasks: before.tasks,
      approvals: before.approvals,
    };
    fs.writeFileSync(dir + "/before.private.json", JSON.stringify(before));
    a.equal((await (await fetch(base + "/api/build")).json()).commitSha, sha);
    const profile = path.resolve(dir + "/profile");
    fs.mkdirSync(profile, { recursive: true });
    logFd = fs.openSync(dir + "/chrome.private.log", "a");
    child = cp.spawn(
      browserExecutable,
      [
        "--remote-debugging-port=0",
        "--remote-debugging-address=127.0.0.1",
        "--user-data-dir=" + profile,
        "--no-first-run",
        "--no-default-browser-check",
        "about:blank",
      ],
      { stdio: ["ignore", logFd, logFd], windowsHide: true },
    );
    let port;
    for (let n = 0; n < 100; n++) {
      const f = profile + "/DevToolsActivePort";
      if (fs.existsSync(f)) {
        port = fs.readFileSync(f, "utf8").trim().split("\n")[0];
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    a.match(port || "", /^[0-9]+$/);
    browser = await chromium.connectOverCDP("http://127.0.0.1:" + port, { noDefaults: true });
    ctx = browser.contexts()[0];
    await ctx.setExtraHTTPHeaders({ cookie });
    p = ctx.pages()[0];
    cdp = await ctx.newCDPSession(p);
    report.browser = await cdp.send("Browser.getVersion");
    stage = "native foreground before app mount";
    const initialWindow = await cdp.send("Browser.getWindowForTarget");
    await cdp.send("Browser.setWindowBounds", {
      windowId: initialWindow.windowId,
      bounds: { windowState: "normal" },
    });
    await p.bringToFront();
    await p.waitForFunction(() => document.visibilityState === "visible");
    report.foregroundBeforeAppMount = await p.evaluate(() => ({
      visibility: document.visibilityState,
      hasFocus: document.hasFocus(),
    }));
    stage = "own-manager-binding";
    a.equal(
      (await (await ctx.request.get(base + "/api/auth/get-session")).json()).user.id,
      who.authUserId,
    );
    report.ownIndependentAuthBinding = true;
    p.on("request", (q) => {
      requestPhases.set(q, phase);
      if (q.method() === "POST") writes++;
      if (new URL(q.url()).pathname.startsWith("/_serverFn/"))
        report.allServerRequests.push({
          at: Date.now(),
          phase,
          method: q.method(),
          functionId: new URL(q.url()).pathname.split("/").at(-1),
        });
    });
    function find(x, key) {
      if (!x || typeof x !== "object") return;
      const z = Array.isArray(x.k) ? x : Array.isArray(x.p?.k) ? x.p : null;
      if (z) {
        const i = z.k.indexOf(key);
        if (i >= 0) return z.v[i];
      }
      for (const v of Object.values(x))
        if (v && typeof v === "object") {
          const found = find(v, key);
          if (found !== undefined) return found;
        }
    }
    p.on("response", (res) => {
      if (new URL(res.url()).pathname !== "/_serverFn/" + id) return;
      const responsePhase = requestPhases.get(res.request()) ?? "unobserved-request";
      pending.push(
        (async () => {
          const u = new URL(res.url()),
            payload = decodeURIComponent(u.searchParams.get("payload") || ""),
            group = payload.includes("history")
              ? "history"
              : payload.includes("pending")
                ? "pending"
                : "unknown",
            raw = await res.text(),
            items = find(JSON.parse(raw), "items");
          report.responses.push({
            phase: responsePhase,
            group,
            at: Date.now(),
            status: res.status(),
            bytes: Buffer.byteLength(raw),
            contextDataInList: raw.includes("context_data"),
            rows: Array.isArray(items?.a) ? items.a.length : null,
          });
          fs.writeFileSync(dir + "/response-" + report.responses.length + ".private.json", raw);
        })().catch((e) => {
          report.observerError = e.name;
        }),
      );
    });
    await p.goto(base + "/approvals?type=all");
    await p.getByRole("heading", { name: "Approval Desk", exact: true }).waitFor();
    await p.waitForLoadState("networkidle");
    await Promise.all(pending);
    report.foregroundAfterAppMount = await p.evaluate(() => ({
      visibility: document.visibilityState,
      hasFocus: document.hasFocus(),
    }));
    await p.evaluate(() => {
      window.__clientopsVisibilityEvidence = [];
      document.addEventListener("visibilitychange", () =>
        window.__clientopsVisibilityEvidence.push({
          at: Date.now(),
          visibility: document.visibilityState,
          hidden: document.hidden,
        }),
      );
    });
    const observe = async (name, visibility, minimumPending) => {
      stage = name;
      phase = name;
      await p.waitForFunction((expected) => document.visibilityState === expected, visibility, {
        timeout: 10000,
      });
      const firstPending =
        visibility === "visible"
          ? p.waitForResponse(
              (res) =>
                new URL(res.url()).pathname === "/_serverFn/" + id &&
                requestPhases.get(res.request()) === name &&
                decodeURIComponent(new URL(res.url()).searchParams.get("payload") || "").includes(
                  "pending",
                ),
              { timeout: 60000 },
            )
          : null;
      const start = Date.now(),
        mark = report.responses.length,
        requestMark = report.allServerRequests.length;
      await new Promise((r) => setTimeout(r, 35000));
      if (firstPending) await (await firstPending).finished();
      await Promise.all(pending);
      a.equal(await p.evaluate(() => document.visibilityState), visibility);
      const rows = report.responses.slice(mark).filter((x) => x.phase === name);
      a.equal(rows.filter((x) => x.group === "history").length, 0);
      a(rows.every((x) => x.status === 200 && x.rows === 50 && !x.contextDataInList));
      if (visibility === "hidden") {
        a.equal(rows.length, 0);
        a.equal(report.allServerRequests.length, requestMark);
      } else {
        a(rows.filter((x) => x.group === "pending").length >= minimumPending);
      }
      const result = {
        case: name,
        nativeVisibility: visibility,
        realElapsedMs: Date.now() - start,
        pendingRequests: rows.filter((x) => x.group === "pending").length,
        historyRequests: 0,
        allServerFunctionRequests: report.allServerRequests.length - requestMark,
        fiftyRowMinimalList: rows.every((x) => x.rows === 50 && !x.contextDataInList),
        pass: true,
      };
      report.cases.push(result);
      console.log(JSON.stringify(result));
    };
    await p.bringToFront();
    await observe("visible-pending-refresh", "visible", 1);
    await p.screenshot({ path: dir + "/manager-native-queue.png" });
    const other = await ctx.newPage();
    await other.goto("about:blank");
    await other.bringToFront();
    await observe("native-background-tab-stops-polling", "hidden", 0);
    phase = "foreground-focus-catchup";
    const catchupMark = report.responses.length;
    const catchups = ["history", "pending"].map((group) =>
      p.waitForResponse(
        (res) =>
          new URL(res.url()).pathname === "/_serverFn/" + id &&
          requestPhases.get(res.request()) === "foreground-focus-catchup" &&
          decodeURIComponent(new URL(res.url()).searchParams.get("payload") || "").includes(group),
        { timeout: 30000 },
      ),
    );
    await p.bringToFront();
    await p.waitForFunction(() => document.visibilityState === "visible");
    await Promise.all((await Promise.all(catchups)).map((res) => res.finished()));
    await Promise.all(pending);
    report.foregroundFocusCatchup = report.responses
      .slice(catchupMark)
      .map((x) => ({ group: x.group, status: x.status, rows: x.rows, at: x.at }));
    await observe("native-foreground-resumes-pending-only", "visible", 1);
    const windowId = (await cdp.send("Browser.getWindowForTarget")).windowId;
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "minimized" } });
    report.actualMinimizedWindow = (
      await cdp.send("Browser.getWindowBounds", { windowId })
    ).bounds.windowState;
    await observe("native-minimized-window-stops-polling", "hidden", 0);
    a.equal(report.actualMinimizedWindow, "minimized");
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } });
    await p.bringToFront();
    await p.waitForFunction(() => document.visibilityState === "visible");
    report.visibilityEvents = await p.evaluate(() => window.__clientopsVisibilityEvidence);
    a(report.visibilityEvents.some((x) => x.visibility === "hidden"));
    a.equal(writes, 0);
    a(!report.observerError);
    const after = snapshot();
    fs.writeFileSync(dir + "/after.private.json", JSON.stringify(after));
    a.deepEqual(after, before);
    report.noMutationPosts = true;
    report.databaseHashesUnchanged = true;
    report.success = true;
  } catch (e) {
    fs.writeFileSync(dir + "/error.private.txt", String(e.stack));
    report.error = { stage, name: e.name, details: "Private error retained" };
    process.exitCode = 1;
  } finally {
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(dir + "/result.json", JSON.stringify(report, null, 2));
    if (cdp) await cdp.send("Browser.close").catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (child) child.kill();
    if (logFd) fs.closeSync(logFd);
    console.log(
      JSON.stringify({ success: report.success, cases: report.cases.length, error: report.error }),
    );
  }
})().catch((e) => {
  console.error(e.name, "Native queue setup failure");
  process.exitCode = 1;
});
