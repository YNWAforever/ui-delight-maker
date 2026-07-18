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

    await client.query(
      `update profiles
       set role = 'super_admin', updated_at = now()
       where id = $1`,
      [profile.id],
    );
    await client.query(
      `insert into admin_audit_logs (
         actor_profile_id, target_type, target_id, action, severity,
         reason, before_snapshot, after_snapshot
       ) values ($1, 'profile', $1, $2, 'critical', $3, $4::jsonb, $5::jsonb)`,
      [
        profile.id,
        "profile.bootstrap_super_admin",
        "Initial Super Admin bootstrap",
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
