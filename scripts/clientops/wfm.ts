import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { Pool } from "pg";
import { z } from "zod";
import { WfmClient } from "../../src/server/workflowmax/client.server";
import { assertDate, type WfmObject } from "../../src/server/workflowmax/http.server";
import { importWfmHistory, type WfmSource } from "../../src/server/workflowmax/importer.server";
import { wfmConfigFromEnv, wfmNamespace } from "../../src/server/workflowmax/oauth.server";
import { WFM_PLAN } from "../../src/server/workflowmax/plan.server";
import { persistRefreshToken } from "../../src/server/workflowmax/refresh-persist.server";
import { reconcileWfm } from "../../src/server/workflowmax/reconcile.server";
import { WfmHistoryStore, type WfmDatabase } from "../../src/server/workflowmax/store.server";

const fixtureSchema = z.object({
  orgId: z.string(),
  resources: z.record(z.string(), z.array(z.object({ uuid: z.string() }).passthrough())),
});

function databaseUrl() {
  // Deliberately no DATABASE_URL fallback: builds/deploys must not select a target.
  const url = process.env.WFM_DATABASE_URL;
  const target = process.env.WFM_TARGET;
  if (!url || !["local", "uat"].includes(target ?? ""))
    throw new Error("Set WFM_DATABASE_URL and WFM_TARGET=local|uat; production is unsupported");
  const parsed = new URL(url);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol))
    throw new Error("Expected PostgreSQL URL");
  if (target === "local" && !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname))
    throw new Error("WFM_TARGET=local requires a loopback database");
  return url;
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      fixture: { type: "string" },
      live: { type: "boolean" },
      apply: { type: "boolean" },
      "dry-run": { type: "boolean" },
      snapshot: { type: "string" },
      source: { type: "string" },
      "updated-since": { type: "string" },
      "count-threshold": { type: "string" },
      "amount-threshold": { type: "string" },
      "hours-threshold": { type: "string" },
    },
  });
  const command = positionals[0] ?? "plan";
  if (positionals.length > 1) throw new Error("Unexpected positional arguments");
  if (command === "plan") {
    console.log(
      JSON.stringify(
        { stages: WFM_PLAN, defaultMode: "dry-run", hardStop: "WFM_HARD_STOP.md" },
        null,
        2,
      ),
    );
    return;
  }
  if (command === "recon") {
    if (!values.source) throw new Error("recon requires --source <full-source-snapshot.json>");
    const source = JSON.parse(await readFile(values.source, "utf8"));
    const pool = new Pool({ connectionString: databaseUrl() });
    const db = await pool.connect();
    try {
      await db.query("begin isolation level repeatable read read only");
      const report = await reconcileWfm(db, source, {
        count: values["count-threshold"] === undefined ? 0 : Number(values["count-threshold"]),
        amount: values["amount-threshold"],
        hours: values["hours-threshold"],
      });
      await db.query("commit");
      console.log(JSON.stringify(report, null, 2));
      if (!report.ok) process.exitCode = 1;
    } finally {
      db.release();
      await pool.end();
    }
    return;
  }
  if (command !== "import") throw new Error("Expected plan, import, or recon");
  if (Boolean(values.fixture) === Boolean(values.live))
    throw new Error("Choose exactly one of --fixture <file> or --live");
  if (values.apply && values["dry-run"]) throw new Error("Choose --apply or --dry-run");
  const updatedSince = values["updated-since"] ? assertDate(values["updated-since"]) : undefined;
  const currency = process.env.WFM_HISTORY_CURRENCY?.trim() || undefined;
  if (currency && !/^[A-Z]{3}$/.test(currency))
    throw new Error("WFM_HISTORY_CURRENCY must be an ISO currency code");
  let source: WfmSource;
  if (values.fixture) {
    if (updatedSince)
      throw new Error("Fixture snapshots are full; --updated-since is only supported with --live");
    const fixture = fixtureSchema.parse(JSON.parse(await readFile(values.fixture, "utf8")));
    for (const step of WFM_PLAN)
      if (!fixture.resources[step.type]) throw new Error(`Fixture missing resource: ${step.type}`);
    source = {
      sourceNamespace: wfmNamespace(fixture.orgId),
      async *list(path) {
        const step = WFM_PLAN.find((step) => step.path === path)!;
        for (const row of fixture.resources[step.type]) yield row as WfmObject;
      },
    };
  } else {
    if (process.env.WFM_ALLOW_LIVE_PULL !== "1")
      throw new Error(
        "Live pulls require WFM_ALLOW_LIVE_PULL=1 after Willy's P1/OAuth approval; see WFM_HARD_STOP.md",
      );
    source = new WfmClient(wfmConfigFromEnv(process.env), {
      async onRefreshToken(token) {
        if (process.env.WFM_REFRESH_TOKEN === token) return;
        process.env.WFM_REFRESH_TOKEN = token;
        const tokenPath = process.env.WFM_REFRESH_TOKEN_PATH;
        if (tokenPath) {
          // Atomic 0600 write-back (+ .bak). Never log the token value.
          await persistRefreshToken(tokenPath, token);
          console.error(
            "WFM refresh token rotated; persisted atomically to WFM_REFRESH_TOKEN_PATH (0600, .bak kept).",
          );
        } else {
          console.error(
            "WFM refresh token rotated; env updated for this process only. Set WFM_REFRESH_TOKEN_PATH for durable write-back.",
          );
        }
      },
    });
  }
  const pool = values.apply ? new Pool({ connectionString: databaseUrl() }) : undefined;
  let store: WfmHistoryStore | undefined;
  try {
    store = pool
      ? await WfmHistoryStore.open(
          pool as WfmDatabase,
          source.sourceNamespace,
          updatedSince,
          currency,
        )
      : undefined;
    const snapshot = await importWfmHistory({
      source,
      store,
      updatedSince,
      currency,
      onReceipt(receipt) {
        console.log(JSON.stringify(receipt));
      },
    });
    if (values.snapshot)
      await writeFile(values.snapshot, JSON.stringify(snapshot, null, 2) + "\n", {
        mode: 0o600,
        flag: "wx",
      });
    console.log(
      JSON.stringify({
        ok: true,
        mode: store ? "applied" : "dry-run",
        runId: store?.runId,
        sourceNamespace: source.sourceNamespace,
        scope: snapshot.mode,
        sourceIssues: snapshot.issues,
      }),
    );
  } finally {
    await pool?.end();
  }
}

main().catch(() => {
  // Source/API/DB errors can contain PII or credentials. Receipts carry safe codes.
  console.error(
    "WFM command failed. Check required flags/env, source completeness, and row receipts; see docs/workflowmax-history.md.",
  );
  process.exitCode = 1;
});
