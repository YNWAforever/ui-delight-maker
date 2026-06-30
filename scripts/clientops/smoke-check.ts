import { Pool } from "@neondatabase/serverless";

type Check = {
  name: string;
  pass: boolean;
  detail: string;
};

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function tableCell(value: string) {
  return value.replace(/\|/g, "/").replace(/\r?\n/g, " ");
}

function printChecks(checks: Check[]) {
  console.log("| Check | Result | Detail |");
  console.log("|---|---:|---|");

  for (const check of checks) {
    const result = check.pass ? "PASS" : "FAIL";
    console.log(`| ${tableCell(check.name)} | ${result} | ${tableCell(check.detail)} |`);
  }
}

async function main() {
  const pool = new Pool({ connectionString: requiredEnv("DATABASE_URL") });

  try {
    const leadId = requiredEnv("CLIENTOPS_SMOKE_LEAD_ID");

    const leadResult = await pool.query<{
      id: string;
      status: string;
      lead_score: number;
      qualification_data: unknown;
    }>("select id, status, lead_score, qualification_data from leads where id = $1", [leadId]);

    const runResult = await pool.query<{
      id: string;
      workflow_type: string;
      status: string;
      output_data: unknown;
    }>(
      `
        select id, workflow_type, status, output_data
        from agent_runs
        where subject_type = 'lead'
          and subject_id = $1
        order by created_at desc
      `,
      [leadId],
    );

    const runIds = runResult.rows.map((row) => row.id);
    const approvalResult = await pool.query<{
      approval_type: string;
      total: string;
    }>(
      `
        select approval_type, count(*)::text as total
        from human_approvals
        where agent_run_id = any($1::uuid[])
        group by approval_type
      `,
      [runIds],
    );

    const quoteResult = await pool.query<{ total: string }>(
      "select count(*)::text as total from quotes where lead_id = $1",
      [leadId],
    );

    const activityResult = await pool.query<{ total: string }>(
      "select count(*)::text as total from activity_logs where object_type = 'lead' and object_id = $1",
      [leadId],
    );

    const lead = leadResult.rows[0];
    const runsByType = new Map(runResult.rows.map((run) => [run.workflow_type, run]));
    const approvalsByType = new Map(
      approvalResult.rows.map((approval) => [approval.approval_type, Number(approval.total)]),
    );

    const checks: Check[] = [
      {
        name: "seeded lead exists",
        pass: Boolean(lead),
        detail: lead ? `status=${lead.status}` : "lead missing",
      },
      {
        name: "qualification writeback",
        pass: lead ? Boolean(lead.qualification_data) && lead.lead_score > 0 : false,
        detail: lead ? `lead_score=${lead.lead_score}` : "lead missing",
      },
      {
        name: "qualify agent completed",
        pass: runsByType.get("qualify_lead")?.status === "completed",
        detail: runsByType.get("qualify_lead")?.status ?? "missing",
      },
      {
        name: "reply approval created once",
        pass: approvalsByType.get("message_send") === 1,
        detail: `message_send=${approvalsByType.get("message_send") ?? 0}`,
      },
      {
        name: "quote draft created",
        pass: Number(quoteResult.rows[0]?.total ?? 0) >= 1,
        detail: `quotes=${quoteResult.rows[0]?.total ?? 0}`,
      },
      {
        name: "quote approval at most once",
        pass: (approvalsByType.get("quote_send") ?? 0) <= 1,
        detail: `quote_send=${approvalsByType.get("quote_send") ?? 0}`,
      },
      {
        name: "activity logged",
        pass: Number(activityResult.rows[0]?.total ?? 0) >= 1,
        detail: `activity=${activityResult.rows[0]?.total ?? 0}`,
      },
    ];

    printChecks(checks);

    if (checks.some((check) => !check.pass)) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
