import type { Pool } from "pg";

const STATEMENTS: string[] = [
  `insert into profiles (id, email, name) values
     ('fixture-user-1','u1@fixture.test','Fixture One'),
     ('fixture-user-2','u2@fixture.test','Fixture Two'),
     ('fixture-user-3','u3@fixture.test','Fixture Three')
     on conflict do nothing`,

  `insert into products (id, name, billing_type, category) values
     ('00000000-0000-4000-8000-000000000101','Fixture Retainer','retainer','CRM'),
     ('00000000-0000-4000-8000-000000000102','Fixture Oneoff','one_off','data'),
     ('00000000-0000-4000-8000-000000000103','Fixture Usage','usage','campaign')
     on conflict do nothing`,

  `insert into accounts (id, name, tier, lifecycle_stage) values
     ('00000000-0000-4000-8000-000000000201','Fixture Account A','SME','active_client'),
     ('00000000-0000-4000-8000-000000000202','Fixture Account B','mid-market','prospect'),
     ('00000000-0000-4000-8000-000000000203','Fixture Account C','enterprise','at_risk')
     on conflict do nothing`,

  // listRelationshipIndexPage inner-joins accounts to relationship_signals (only accounts
  // with an open signal appear in the index), so accounts alone are not enough to make that
  // route return rows. One open signal per fixture account keeps every account visible.
  `insert into relationship_signals (account_id, signal_type, severity, title, reason, source, dedupe_key) values
     ('00000000-0000-4000-8000-000000000201','coverage_gap','high','Fixture Signal A','No decision maker linked','deterministic','fixture-signal-201'),
     ('00000000-0000-4000-8000-000000000202','stale_touchpoint','medium','Fixture Signal B','No contact in 60 days','deterministic','fixture-signal-202'),
     ('00000000-0000-4000-8000-000000000203','high_risk_engagement','high','Fixture Signal C','Renewal at risk','deterministic','fixture-signal-203')
     on conflict do nothing`,

  `insert into clients (id, company_name, tier) values
     ('00000000-0000-4000-8000-000000000301','Fixture Client A','SME'),
     ('00000000-0000-4000-8000-000000000302','Fixture Client B','mid-market'),
     ('00000000-0000-4000-8000-000000000303','Fixture Client C','enterprise')
     on conflict do nothing`,

  `insert into leads (id, company_name, status, source) values
     ('00000000-0000-4000-8000-000000000401','Fixture Lead A','new','website'),
     ('00000000-0000-4000-8000-000000000402','Fixture Lead B','qualified','email'),
     ('00000000-0000-4000-8000-000000000403','Fixture Lead C','won','manual')
     on conflict do nothing`,

  `insert into campaigns (id, name, type, status) values
     ('00000000-0000-4000-8000-000000000501','Fixture Campaign A','campaign','active'),
     ('00000000-0000-4000-8000-000000000502','Fixture Campaign B','webinar','draft'),
     ('00000000-0000-4000-8000-000000000503','Fixture Campaign C','client_event','completed')
     on conflict do nothing`,

  `insert into quotes (id, client_id, status) values
     ('00000000-0000-4000-8000-000000000601','00000000-0000-4000-8000-000000000301','draft'),
     ('00000000-0000-4000-8000-000000000602','00000000-0000-4000-8000-000000000302','sent'),
     ('00000000-0000-4000-8000-000000000603','00000000-0000-4000-8000-000000000303','accepted')
     on conflict do nothing`,

  `insert into quote_versions (id, quote_id, version_number, reason, snapshot) values
     ('00000000-0000-4000-8000-000000000f01','00000000-0000-4000-8000-000000000601',1,'issued','{}'::jsonb),
     ('00000000-0000-4000-8000-000000000f02','00000000-0000-4000-8000-000000000602',1,'issued','{}'::jsonb),
     ('00000000-0000-4000-8000-000000000f03','00000000-0000-4000-8000-000000000603',1,'accepted','{}'::jsonb)
     on conflict do nothing`,

  // job_sheets.accepted_quote_version_id is NOT NULL, so a job sheet needs a quote_versions
  // row first. Without these the job-sheets.$id entry could only budget its not-found path.
  `insert into job_sheets (id, number, quote_id, accepted_quote_version_id, status) values
     ('00000000-0000-4000-8000-000000001001','JS-FIX-001','00000000-0000-4000-8000-000000000601','00000000-0000-4000-8000-000000000f01','draft'),
     ('00000000-0000-4000-8000-000000001002','JS-FIX-002','00000000-0000-4000-8000-000000000602','00000000-0000-4000-8000-000000000f02','accounting_review'),
     ('00000000-0000-4000-8000-000000001003','JS-FIX-003','00000000-0000-4000-8000-000000000603','00000000-0000-4000-8000-000000000f03','accepted')
     on conflict do nothing`,

  `insert into departments (id, name, status) values
     ('00000000-0000-4000-8000-000000001101','Fixture Department A','active'),
     ('00000000-0000-4000-8000-000000001102','Fixture Department B','active'),
     ('00000000-0000-4000-8000-000000001103','Fixture Department C','archived')
     on conflict do nothing`,

  `insert into engagements (id, client_id, product_id, billing_period, status) values
     ('00000000-0000-4000-8000-000000000701','00000000-0000-4000-8000-000000000301','00000000-0000-4000-8000-000000000101','monthly','active'),
     ('00000000-0000-4000-8000-000000000702','00000000-0000-4000-8000-000000000302','00000000-0000-4000-8000-000000000102','annual','active'),
     ('00000000-0000-4000-8000-000000000703','00000000-0000-4000-8000-000000000303','00000000-0000-4000-8000-000000000103','quarterly','paused')
     on conflict do nothing`,

  `insert into tasks (id, title, status, priority) values
     ('00000000-0000-4000-8000-000000000801','Fixture Task A','open','high'),
     ('00000000-0000-4000-8000-000000000802','Fixture Task B','in_progress','medium'),
     ('00000000-0000-4000-8000-000000000803','Fixture Task C','done','low')
     on conflict do nothing`,

  `insert into agent_runs (id, agent_name, workflow_type, subject_type, subject_id, status, human_review_required) values
     ('00000000-0000-4000-8000-000000000901','Qualification Agent','qualify_lead','lead','00000000-0000-4000-8000-000000000401','completed',true),
     ('00000000-0000-4000-8000-000000000902','Quotation Agent','draft_quote','quote','00000000-0000-4000-8000-000000000601','completed',false),
     ('00000000-0000-4000-8000-000000000903','Lead Intake Agent','draft_reply','lead','00000000-0000-4000-8000-000000000402','running',true)
     on conflict do nothing`,

  `insert into human_approvals (id, approval_type, status) values
     ('00000000-0000-4000-8000-000000000a01','quote_send','pending'),
     ('00000000-0000-4000-8000-000000000a02','discount','pending'),
     ('00000000-0000-4000-8000-000000000a03','message_send','approved')
     on conflict do nothing`,

  `insert into notifications (id, user_id, type, title) values
     ('00000000-0000-4000-8000-000000000b01','fixture-user-1','renewal_window','Fixture N1'),
     ('00000000-0000-4000-8000-000000000b02','fixture-user-1','risk_change','Fixture N2'),
     ('00000000-0000-4000-8000-000000000b03','fixture-user-2','approval_pending','Fixture N3')
     on conflict do nothing`,

  `insert into activity_logs (id, action) values
     ('00000000-0000-4000-8000-000000000c01','fixture.created'),
     ('00000000-0000-4000-8000-000000000c02','fixture.updated'),
     ('00000000-0000-4000-8000-000000000c03','fixture.viewed')
     on conflict do nothing`,

  `insert into account_contacts (id, account_id, name) values
     ('00000000-0000-4000-8000-000000000d01','00000000-0000-4000-8000-000000000201','Fixture Contact A'),
     ('00000000-0000-4000-8000-000000000d02','00000000-0000-4000-8000-000000000201','Fixture Contact B'),
     ('00000000-0000-4000-8000-000000000d03','00000000-0000-4000-8000-000000000202','Fixture Contact C')
     on conflict do nothing`,

  `insert into client_contacts (id, client_id, name) values
     ('00000000-0000-4000-8000-000000000e01','00000000-0000-4000-8000-000000000301','Fixture CC A'),
     ('00000000-0000-4000-8000-000000000e02','00000000-0000-4000-8000-000000000301','Fixture CC B'),
     ('00000000-0000-4000-8000-000000000e03','00000000-0000-4000-8000-000000000302','Fixture CC C')
     on conflict do nothing`,
];

/**
 * Idempotent: every statement carries `on conflict do nothing`. Two test files seed the same
 * DATABASE_TEST_URL — this one and route-loader-contract.integration.test.ts — and vitest runs
 * their beforeAll hooks in the same session against the same physical database. Without this,
 * whichever runs second dies on `duplicate key value violates unique constraint "profiles_pkey"`.
 * No target on the conflict clause, so it also absorbs the partial unique index on
 * relationship_signals.dedupe_key, not just the primary keys.
 *
 * Three rows per driving table. Three, not one: a single row cannot distinguish one query
 * from one-query-per-row, which is the whole point of the query budget.
 */
export async function seedRouteLoaderFixture(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const statement of STATEMENTS) {
      await client.query(statement);
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
