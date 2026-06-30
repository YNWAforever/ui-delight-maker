import { Pool } from "@neondatabase/serverless";

export type Queryable = {
  query<T = unknown>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
};

let pool: Pool | null = null;

export function getDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Missing required env var: DATABASE_URL must be set for Neon Postgres");
  }
  return url;
}

function getPool() {
  if (typeof window !== "undefined") {
    throw new Error("Neon database client cannot be used in browser code");
  }

  if (!pool) {
    pool = new Pool({ connectionString: getDatabaseUrl() });
  }

  return pool;
}

export async function query<T>(
  text: string,
  values: readonly unknown[] = [],
  db: Queryable = getPool(),
) {
  const result = await db.query(text, values);
  return result.rows as T[];
}

export async function queryOne<T>(text: string, values: readonly unknown[] = [], db?: Queryable) {
  const rows = await query<T>(text, values, db);
  return rows[0] ?? null;
}

export async function transaction<T>(work: (client: Queryable) => Promise<T>) {
  const client = await getPool().connect();
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
}
