import { Pool, types as pgTypes } from "@neondatabase/serverless";

export type Queryable = {
  query<T = unknown>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
};

let pool: Pool | null = null;

/** SQLSTATE-adjacent constant: the OID Postgres uses for `numeric`/`decimal`. */
const NUMERIC_OID = 1700;

/**
 * Postgres hands `numeric` to the driver as a string, and neither node-postgres nor the Neon
 * driver parses it by default — they preserve the text so arbitrary-precision values survive.
 *
 * Every `numeric` column in `neon/migrations/` is money at `numeric(12,2)` or `numeric(10,2)`,
 * so the largest representable value is 9_999_999_999.99 — three orders of magnitude inside
 * `Number.MAX_SAFE_INTEGER` once scaled by 100. There is no precision to lose here, and the
 * string default costs correctness instead: `src/lib/types.ts` declares these columns
 * `number`, so `sum + quote.total_value` concatenated rather than added and the money tiles on
 * the dashboard, /quotes and /clients rendered "HK$NaN" as soon as two rows were in scope.
 *
 * Only 1700 is overridden. `count(*)` is int8 (OID 20) and stays a string on purpose: those
 * call sites already cast with `::int` or coerce through `parseCount`, and widening bigint
 * silently would be the precision loss this comment says is not happening.
 */
const NUMERIC_TYPE_PARSER = {
  getTypeParser: ((oid: number, format?: "text" | "binary") =>
    oid === NUMERIC_OID
      ? Number
      : pgTypes.getTypeParser(oid, format)) as typeof pgTypes.getTypeParser,
};

function normalizeDbValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(normalizeDbValue);
  }

  if (value && typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeDbValue(entry)]),
    );
  }

  return value;
}

function normalizeRows<T>(rows: T[]) {
  return rows.map((row) => normalizeDbValue(row)) as T[];
}

function withNormalizedRows(db: Queryable): Queryable {
  return {
    async query<T = unknown>(text: string, values?: readonly unknown[]) {
      const result = await db.query<T>(text, values);
      return { ...result, rows: normalizeRows(result.rows) };
    },
  };
}

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
    pool = new Pool({ connectionString: getDatabaseUrl(), types: NUMERIC_TYPE_PARSER });
  }

  return pool;
}

export async function query<T>(
  text: string,
  values: readonly unknown[] = [],
  db: Queryable = getPool(),
) {
  const result = await withNormalizedRows(db).query<T>(text, values);
  return result.rows;
}

export async function queryOne<T>(text: string, values: readonly unknown[] = [], db?: Queryable) {
  const rows = await query<T>(text, values, db);
  return rows[0] ?? null;
}

export async function transaction<T>(work: (client: Queryable) => Promise<T>) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await work(withNormalizedRows(client));
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
