import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * BD-3 slice 2, Task 6: the one place the agent policy store design is proven against a real
 * database.
 *
 * `loadAgentPolicies` is asserted only against a mocked `query` elsewhere, which means its
 * `order by ... created_at desc, version_seq desc` has only ever been checked as SQL text — a
 * unit test with `query` mocked cannot prove Postgres actually breaks a tie that way, because
 * fixture order decides the result regardless of what the SQL says. And nothing anywhere
 * exercises `setAgentPolicyFn`'s `requireCapability("agents.configure")` gate: delete that line
 * and every other test in the suite still goes green. Both gaps are closed here.
 *
 * Only the session boundary is mocked. `loadAgentPolicies`, `setAgentPolicy`,
 * `requireCapability` and `resolveDispatchableAgent` all run for real against the migrated
 * schema, because each of them is part of what this file exists to prove.
 */
const holder = vi.hoisted(() => ({
  pool: null as InstanceType<typeof import("pg").Pool> | null,
  session: null as unknown,
}));

// Redirecting this module at the pg driver is what lets the real repositories run against the
// CI Postgres service without touching production code. The SQL text is identical either way,
// and `db` is honoured so a caller's transaction really is one transaction here too.
vi.mock("@/server/db/neon.server", () => {
  type Runner = { query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }> };
  const getPool = (): Runner => {
    if (!holder.pool) throw new Error("test pool not initialised");
    return holder.pool as unknown as Runner;
  };
  const query = async (text: string, values: readonly unknown[] = [], db?: Runner) => {
    const result = await (db ?? getPool()).query(text, values as unknown[]);
    return result.rows;
  };
  const queryOne = async (text: string, values: readonly unknown[] = [], db?: Runner) => {
    const rows = await query(text, values, db);
    return rows[0] ?? null;
  };
  const transaction = async (work: (db: Runner) => Promise<unknown>) => {
    const client = await holder.pool!.connect();
    try {
      await client.query("begin");
      const result = await work({
        query: (text: string, values?: unknown[]) => client.query(text, values),
      });
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  };
  return { query, queryOne, transaction, getDatabaseUrl: () => "test" };
});

const { createServerFnChain } = vi.hoisted(() => {
  const chain = {
    validator() {
      return chain;
    },
    handler<T extends (...args: never[]) => unknown>(handler: T) {
      return handler;
    },
  };
  return { createServerFnChain: chain };
});

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => createServerFnChain,
}));

vi.mock("@/lib/auth/neon-auth.server", () => ({
  requireNeonAuthSession: async () => holder.session,
  getNeonAuthSession: async () => holder.session,
}));

import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
import { AGENT_DEFINITIONS } from "@/lib/agents";
import { setAgentPolicyFn } from "@/server-functions/agent-policy";
import { triggerLeadAgent } from "@/server-functions/leads";
import { loadAgentPolicies } from "@/server/repositories/agent-policy";

const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);

const ADMIN = "policy-admin";
const MANAGER = "policy-manager";
const LEAD_ID = "00000000-0000-4000-8000-0000000c0001";

const ADMIN_SESSION = {
  profile: { id: ADMIN, role: "admin", status: "active", primary_department_id: null },
};
const MANAGER_SESSION = {
  profile: { id: MANAGER, role: "manager", status: "active", primary_department_id: null },
};

/** The handlers are `createServerFn` chains flattened by the stub above, so they take `{ data }`. */
type Handler<In, Out> = (input: { data: In }) => Promise<Out>;
const setAgentPolicy = setAgentPolicyFn as unknown as Handler<
  {
    workflowType: string;
    status: "active" | "inactive";
    humanApproval: boolean;
    reason?: string;
  },
  unknown
>;
const triggerAgent = triggerLeadAgent as unknown as Handler<
  { leadId: string },
  { triggered: boolean; reason?: string }
>;

function db() {
  if (!holder.pool) throw new Error("test pool not initialised");
  return holder.pool;
}

async function policyVersionCount() {
  const { rows } = await db().query<{ count: string }>(
    "select count(*) as count from agent_policy_versions",
  );
  return Number(rows[0]?.count ?? "0");
}

async function agentRunCount(leadId = LEAD_ID) {
  const { rows } = await db().query<{ count: string }>(
    "select count(*) as count from agent_runs where subject_id = $1",
    [leadId],
  );
  return Number(rows[0]?.count ?? "0");
}

/** Inserts a version directly, bypassing `setAgentPolicy`, so `created_at` can be set explicitly. */
async function insertPolicyVersion(input: {
  workflowType: string;
  status: "active" | "inactive";
  humanApproval: boolean;
  changedBy: string;
  createdAt: string;
}) {
  await db().query(
    `
      insert into agent_policy_versions (workflow_type, status, human_approval, changed_by, created_at)
      values ($1, $2, $3, $4, $5)
    `,
    [input.workflowType, input.status, input.humanApproval, input.changedBy, input.createdAt],
  );
}

describe("agent policy store, proven against a real database", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    holder.pool = new Pool({ connectionString: process.env.DATABASE_TEST_URL });
    const migrations = await Promise.all(
      CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({ path, sql: await readFile(path, "utf8") })),
    );
    await runClientOpsMigrations(holder.pool, migrations);
    await holder.pool.query(
      `insert into profiles (id, email, name, role, status) values
         ($1,'policy-admin@fixture.test','Policy Admin','admin','active'),
         ($2,'policy-manager@fixture.test','Policy Manager','manager','active')
       on conflict (id) do update set role = excluded.role, status = excluded.status`,
      [ADMIN, MANAGER],
    );
    process.env.N8N_QUALIFY_LEAD_WEBHOOK_URL = "https://n8n.example/webhook";
    process.env.N8N_WORKFLOW_TOKEN = "test-token";
  }, 60_000);

  afterAll(async () => {
    await holder.pool?.end();
    holder.pool = null;
  });

  beforeEach(async () => {
    if (!hasDatabase) return;
    // TRUNCATE, not DELETE: migration 009 puts an append-only trigger on this table that
    // rejects UPDATE and DELETE (`agent_policy_versions are append-only`). TRUNCATE fires a
    // different trigger event and is what actually resets the table between tests.
    await db().query("truncate agent_policy_versions");
    await db().query("delete from agent_runs where subject_id = $1", [LEAD_ID]);
    holder.session = ADMIN_SESSION;
  });

  it.runIf(hasDatabase)(
    "an empty table is the code default for every catalogue workflow",
    async () => {
      const policies = await loadAgentPolicies();

      for (const agent of AGENT_DEFINITIONS) {
        expect(
          policies.get(agent.workflow_type),
          `${agent.workflow_type} must read as the code default with no stored rows`,
        ).toEqual({ status: agent.status, humanApproval: agent.human_approval });
      }
    },
  );

  it.runIf(hasDatabase)(
    "a stored override takes effect end to end: dispatch refuses and writes no run",
    async () => {
      await setAgentPolicy({
        data: {
          workflowType: "qualify_lead",
          status: "inactive",
          humanApproval: false,
          reason: "paused for maintenance",
        },
      });

      const result = await triggerAgent({ data: { leadId: LEAD_ID } });

      expect(result).toEqual({ triggered: false, reason: "agent_inactive" });
      // Asserted on the write, not only the return value: a sentinel returned after a row was
      // created would still be a lie about what happened.
      expect(
        await agentRunCount(),
        "an inactive-policy refusal must not leave a row in agent_runs",
      ).toBe(0);
    },
  );

  it.runIf(hasDatabase)("the newest created_at governs, not insertion order", async () => {
    // Neither row's values equal the catalogue default for qualify_lead (active / false), so
    // a bug that ignored stored rows entirely would produce a third, visibly wrong answer
    // rather than accidentally matching the "loses" row and passing for the wrong reason.
    //
    // Inserted FIRST but with the LATER created_at, so it must still win. If the code ever
    // read insertion order (or version_seq) ahead of created_at, the second insert below
    // (older clock time, but a higher version_seq) would incorrectly govern instead.
    await insertPolicyVersion({
      workflowType: "qualify_lead",
      status: "inactive",
      humanApproval: true,
      changedBy: ADMIN,
      createdAt: "2024-06-01T00:00:00Z",
    });
    await insertPolicyVersion({
      workflowType: "qualify_lead",
      status: "inactive",
      humanApproval: false,
      changedBy: ADMIN,
      createdAt: "2020-01-01T00:00:00Z",
    });

    const policies = await loadAgentPolicies();

    expect(
      policies.get("qualify_lead"),
      "the row with the later created_at must govern even though it was inserted first",
    ).toEqual({ status: "inactive", humanApproval: true });
  });

  it.runIf(hasDatabase)(
    "writes are gated: a manager (agents.run, not agents.configure) is refused and writes no row",
    async () => {
      holder.session = MANAGER_SESSION;

      await expect(
        setAgentPolicy({
          data: { workflowType: "qualify_lead", status: "inactive", humanApproval: false },
        }),
      ).rejects.toThrow("You do not have this capability");

      expect(
        await policyVersionCount(),
        "a refused write must leave the append-only table untouched",
      ).toBe(0);
    },
  );

  it.runIf(hasDatabase)(
    "version_seq breaks a tie among rows sharing one created_at",
    async () => {
      const tiedCreatedAt = "2024-03-15T12:00:00Z";
      // Neither row's values equal the catalogue default for qualify_lead (active / false), for
      // the same reason as the created_at case above: a bug that dropped stored rows entirely
      // must not be able to pass this by accident.
      //
      // Same created_at for both, so only version_seq can decide. Inserted in this order, the
      // first row gets the LOWER version_seq — which is what would win with no tiebreak, since
      // an ORDER BY with no tiebreak column tends to return equal-created_at rows in the heap
      // scan order a freshly inserted, unvacuumed table shares with insertion order. Proving
      // the HIGHER version_seq (the second insert) governs instead is what proves the tiebreak
      // is real, not merely present in the SQL text.
      await insertPolicyVersion({
        workflowType: "qualify_lead",
        status: "inactive",
        humanApproval: false,
        changedBy: ADMIN,
        createdAt: tiedCreatedAt,
      });
      await insertPolicyVersion({
        workflowType: "qualify_lead",
        status: "inactive",
        humanApproval: true,
        changedBy: ADMIN,
        createdAt: tiedCreatedAt,
      });

      const policies = await loadAgentPolicies();

      expect(
        policies.get("qualify_lead"),
        "the higher version_seq must govern the tie",
      ).toEqual({ status: "inactive", humanApproval: true });
    },
  );
});
