import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import { selectClientOpsScriptDriver } from "../../src/lib/clientops-script-pool";

// Executable regression gate for the dedicated disposable seed-rehearsal database.
const databaseUrl = process.env.DATABASE_TEST_URL;
if (!databaseUrl || selectClientOpsScriptDriver(databaseUrl, process.env) !== "pg") {
  throw new Error("Seed integrity requires the explicitly guarded local test database");
}
const pool = new Pool({ connectionString: databaseUrl });
const client = await pool.connect();
try {
  await client.query("begin read only");
  const issues = await client.query(
    "select " +
      "(select count(*)::int from quotes q left join quote_versions v on v.id=q.issued_version_id and v.quote_id=q.id and v.reason='issued' where q.status in ('sent','viewed','accepted') and v.id is null) as missing_issued_version, " +
      "(select count(*)::int from job_sheets j join quotes q on q.id=j.quote_id where j.accepted_at is null or j.accepted_at is distinct from q.accepted_at or j.accepted_quote_version_id is distinct from q.accepted_version_id) as invalid_sheet_acceptance, " +
      "(select count(*)::int from human_approvals a where a.approval_type='quote_send' and not exists(select 1 from quotes q where q.id::text=a.context_data->>'quote_id')) as missing_approval_quote, " +
      "(select count(*)::int from human_approvals where status in ('approved','rejected') and decided_at is null) as missing_decision_time",
  );
  assert.deepEqual(issues.rows[0], {
    missing_issued_version: 0,
    invalid_sheet_acceptance: 0,
    missing_approval_quote: 0,
    missing_decision_time: 0,
  });
  // Financial history and terminal decisions must survive a successful replay unchanged.
  const versions = await client.query(
    "select id,quote_id,version_number,reason,snapshot,created_at from quote_versions order by id",
  );
  assert.equal(versions.rows.length, 2);
  const quotes = await client.query(
    "select id,issued_version_id,accepted_version_id,accepted_at from quotes order by id",
  );
  assert.equal(quotes.rows.length, 5);
  const sheets = await client.query(
    "select id,quote_id,accepted_quote_version_id,accepted_at from job_sheets order by id",
  );
  assert.equal(sheets.rows.length, 1);
  const approvals = await client.query(
    "select id,status,context_data,decided_at from human_approvals order by id",
  );
  assert.equal(approvals.rows.length, 4);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([versions.rows, quotes.rows, sheets.rows, approvals.rows]))
    .digest("hex");
  console.log(JSON.stringify({ issues: issues.rows[0], fingerprint }));
} finally {
  await client.query("rollback");
  client.release();
  await pool.end();
}
