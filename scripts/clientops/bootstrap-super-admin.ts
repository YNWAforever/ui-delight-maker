import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

type BootstrapEnvironment = Record<string, string | undefined>;

type ProfileRow = {
  id: string;
  email: string;
  role: string;
  status: string;
};

export type BootstrapQueryClient = {
  query(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Array<Record<string, unknown>> }>;
};

export type BootstrapPool = {
  connect(): Promise<BootstrapQueryClient & { release(): void }>;
};

export type BootstrapDatabase = {
  transaction<T>(work: (client: BootstrapQueryClient) => Promise<T>): Promise<T>;
};

/** Transaction-scoped advisory lock key: serializes concurrent bootstrap invocations. */
const BOOTSTRAP_LOCK_KEY = "clientops:bootstrap-super-admin";

function requiredEnvironmentValue(env: BootstrapEnvironment, name: string) {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export async function bootstrapSuperAdmin(
  env: BootstrapEnvironment,
  db: BootstrapDatabase,
): Promise<string> {
  requiredEnvironmentValue(env, "DATABASE_URL");
  const email = requiredEnvironmentValue(
    env,
    "CLIENTOPS_BOOTSTRAP_SUPER_ADMIN_EMAIL",
  ).toLowerCase();

  return db.transaction(async (client) => {
    const result = await client.query(
      `select id, email, role, status
       from profiles
       where lower(email) = $1 and status = 'active'
       for update`,
      [email],
    );

    const profiles = result.rows as ProfileRow[];

    if (profiles.length !== 1) {
      throw new Error(
        `Expected exactly one active profile for bootstrap email; found ${profiles.length}`,
      );
    }

    const profile = profiles[0];
    if (profile.role === "super_admin") {
      return profile.id;
    }

    // This command exists to create the *first* Super Admin. A transaction-scoped advisory
    // lock serializes concurrent invocations, and the guard below refuses to mint a second
    // all-powerful account: later grants belong in the admin UI, where a real authorizer and
    // live actor are recorded.
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      BOOTSTRAP_LOCK_KEY,
    ]);
    const existingSuperAdmins = await client.query(
      `select id from profiles
       where role = 'super_admin' and status = 'active'`,
    );
    if (existingSuperAdmins.rows.length > 0) {
      throw new Error(
        `Refusing to bootstrap a second Super Admin: ${existingSuperAdmins.rows.length} active ` +
          "Super Admin(s) already exist. Use the admin UI for later grants; this one-time " +
          "bootstrap only creates the first.",
      );
    }

    await client.query(
      `update profiles
       set role = 'super_admin', updated_at = now()
       where id = $1`,
      [profile.id],
    );
    // The actor is the script, not the promoted user: passing profile.id as actor_profile_id
    // made a self-approved escalation look like something the user authorised. The column is
    // nullable (migration 007), so a NULL actor plus this marker in the reason keeps the
    // critical row honest. The marker follows scripts/clientops/backfill-accounts.ts.
    await client.query(
      `insert into admin_audit_logs (
         actor_profile_id, target_type, target_id, action, severity,
         reason, before_snapshot, after_snapshot
       ) values (null, 'profile', $1, $2, 'critical', $3, $4::jsonb, $5::jsonb)`,
      [
        profile.id,
        "profile.bootstrap_super_admin",
        "One-time Super Admin bootstrap by script:clientops:bootstrap-super-admin",
        JSON.stringify({ role: profile.role }),
        JSON.stringify({ role: "super_admin" }),
      ],
    );

    return profile.id;
  });
}

export function createBootstrapDatabase(pool: BootstrapPool): BootstrapDatabase {
  return {
    async transaction(work) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const result = await work(client);
        await client.query("commit");
        return result;
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
async function run() {
  const databaseUrl = requiredEnvironmentValue(process.env, "DATABASE_URL");
  const { Pool } = await import("@neondatabase/serverless");
  const pool = new Pool({ connectionString: databaseUrl });
  const db = createBootstrapDatabase(pool as BootstrapPool);

  try {
    const profileId = await bootstrapSuperAdmin(process.env, db);
    console.log(profileId);
  } finally {
    await pool.end();
  }
}

const entrypoint = process.argv[1];
if (entrypoint && resolve(entrypoint) === fileURLToPath(import.meta.url)) {
  await run();
}
