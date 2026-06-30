import { Pool } from "@neondatabase/serverless";

type Check = {
  name: string;
  pass: boolean;
  detail: string;
};

type SmokeEnv = {
  databaseUrl: string;
  leadId: string;
  qualifyRunId: string;
  replyRunId: string;
  quoteRunId: string;
};

type AgentRun = {
  id: string;
  workflow_type: string;
  subject_type: string;
  subject_id: string;
  status: string;
  output_data: unknown;
  quote_id: string | null;
};

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function getSmokeEnv(): SmokeEnv {
  return {
    databaseUrl: requiredEnv("DATABASE_URL"),
    leadId: requiredEnv("CLIENTOPS_SMOKE_LEAD_ID"),
    qualifyRunId: requiredEnv("CLIENTOPS_SMOKE_QUALIFY_RUN_ID"),
    replyRunId: requiredEnv("CLIENTOPS_SMOKE_REPLY_RUN_ID"),
    quoteRunId: requiredEnv("CLIENTOPS_SMOKE_QUOTE_RUN_ID"),
  };
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

function runScopeCheck(run: AgentRun | undefined, workflowType: string, leadId: string): Check {
  return {
    name: `${workflowType} run belongs to lead`,
    pass:
      run?.workflow_type === workflowType &&
      run.subject_type === "lead" &&
      run.subject_id === leadId,
    detail: run
      ? `workflow_type=${run.workflow_type}, subject_type=${run.subject_type}, subject_id=${run.subject_id}`
      : "missing",
  };
}

async function main() {
  const env = getSmokeEnv();
  const pool = new Pool({ connectionString: env.databaseUrl });

  try {
    const leadResult = await pool.query<{
      id: string;
      status: string;
      lead_score: number;
      qualification_data: unknown;
    }>("select id, status, lead_score, qualification_data from leads where id = $1", [env.leadId]);

    const runResult = await pool.query<AgentRun>(
      `
        select
          id,
          workflow_type,
          subject_type,
          subject_id,
          status,
          output_data,
          output_data->>'quote_id' as quote_id
        from agent_runs
        where id = any($1::uuid[])
      `,
      [[env.qualifyRunId, env.replyRunId, env.quoteRunId]],
    );

    const approvalResult = await pool.query<{
      agent_run_id: string;
      approval_type: string;
      total: string;
    }>(
      `
        select agent_run_id, approval_type, count(*)::text as total
        from human_approvals
        where agent_run_id = any($1::uuid[])
        group by agent_run_id, approval_type
      `,
      [[env.replyRunId, env.quoteRunId]],
    );

    const activityResult = await pool.query<{ total: string }>(
      "select count(*)::text as total from activity_logs where actor_id = any($1::text[])",
      [[env.qualifyRunId, env.replyRunId, env.quoteRunId]],
    );

    const lead = leadResult.rows[0];
    const runsById = new Map(runResult.rows.map((run) => [run.id, run]));
    const approvalsByType = new Map(
      approvalResult.rows.map((approval) => [
        `${approval.agent_run_id}:${approval.approval_type}`,
        Number(approval.total),
      ]),
    );

    const qualifyRun = runsById.get(env.qualifyRunId);
    const replyRun = runsById.get(env.replyRunId);
    const quoteRun = runsById.get(env.quoteRunId);
    const quoteId = quoteRun?.quote_id ?? null;
    const quoteResult = quoteId
      ? await pool.query<{ id: string; lead_id: string }>(
          "select id, lead_id from quotes where id = $1",
          [quoteId],
        )
      : { rows: [] };
    const quote = quoteResult.rows[0];

    const replyApprovalCount = approvalsByType.get(`${env.replyRunId}:message_send`) ?? 0;
    const quoteApprovalCount = approvalsByType.get(`${env.quoteRunId}:quote_send`) ?? 0;
    const quoteStatusAllowed =
      quoteRun?.status === "completed" || quoteRun?.status === "waiting_approval";
    const quoteArtifactDetail = quoteId
      ? quote
        ? `quote_id=${quoteId}, lead_id=${quote.lead_id}`
        : `quote_id=${quoteId}, quote missing`
      : "quote_id missing from quote run output_data";

    const checks: Check[] = [
      {
        name: "seeded lead exists",
        pass: Boolean(lead),
        detail: lead ? `status=${lead.status}` : "lead missing",
      },
      runScopeCheck(qualifyRun, "qualify_lead", env.leadId),
      runScopeCheck(replyRun, "draft_reply", env.leadId),
      runScopeCheck(quoteRun, "draft_quote", env.leadId),
      {
        name: "qualification writeback",
        pass:
          qualifyRun?.status === "completed" &&
          (lead ? Boolean(lead.qualification_data) && lead.lead_score > 0 : false),
        detail: lead
          ? `run_status=${qualifyRun?.status ?? "missing"}, lead_score=${lead.lead_score}`
          : "lead missing",
      },
      {
        name: "qualify agent completed",
        pass: qualifyRun?.status === "completed",
        detail: qualifyRun?.status ?? "missing",
      },
      {
        name: "reply approval created once",
        pass: replyApprovalCount === 1,
        detail: `message_send=${replyApprovalCount}`,
      },
      {
        name: "quote run completed or waiting approval",
        pass: quoteStatusAllowed,
        detail: quoteRun?.status ?? "missing",
      },
      {
        name: "quote artifact scoped to lead",
        pass: Boolean(quoteId) && quote?.lead_id === env.leadId,
        detail: quoteArtifactDetail,
      },
      {
        name: "quote approval at most once",
        pass: quoteApprovalCount <= 1,
        detail: `quote_send=${quoteApprovalCount}`,
      },
      {
        name: "activity logged for smoke runs",
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
