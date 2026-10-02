import { createHmac } from "node:crypto";
import { Client } from "pg";
import { RECONCILED_TABLES, type LegacySnapshot } from "../../src/server/db/legacy-domain-parity";

export const SNAPSHOT_TABLES = [...RECONCILED_TABLES, "profiles", "accounts"] as const;
export const MAX_SNAPSHOT_BYTES = 100 * 1024 * 1024;
const MAX_TABLE_ROWS = 100_000;
const BLOCKED = "Snapshot preparation blocked";
const tableNames = new Set<string>(SNAPSHOT_TABLES);
const columnName = /^[a-z][a-z0-9_]{0,62}$/;
const databaseName = /^clientops_snapshot_[a-z0-9_]{1,44}$/;
type JsonRecord = Record<string, unknown>;
export type SnapshotTarget = {
  connectionString: string;
  isolationConfirmed: true;
  sourceRecord: string;
};
function record(value: unknown): value is JsonRecord {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
class SnapshotNumber {
  constructor(readonly lexeme: string) {}
}

function blocked(): never {
  throw new Error(BLOCKED);
}

// Shared value tokens deliberately do not include table/column names: a profile
// ID must map to the same token as every owner and foreign-key reference.
export function maskSnapshotPair(legacy: unknown, neon: unknown, key: Buffer) {
  if (key.length !== 32) blocked();
  const token = (kind: string, value: string) =>
    kind +
    ":" +
    createHmac("sha256", key)
      .update(kind + "\0" + JSON.stringify(value))
      .digest("hex");
  function maskValue(value: unknown, depth: number): unknown {
    if (depth > 64) blocked();
    if (value === null || typeof value === "boolean" || value === "") return value;
    if (typeof value === "string") return token("s", value);
    if (value instanceof SnapshotNumber) return token("n", value.lexeme);
    if (typeof value === "number") {
      if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) blocked();
      return token("n", JSON.stringify(value));
    }
    if (Array.isArray(value)) return value.map((item) => maskValue(item, depth + 1));
    if (record(value))
      return Object.fromEntries(
        Object.entries(value).map(([name, item]) => [token("k", name), maskValue(item, depth + 1)]),
      );
    return blocked();
  }
  function snapshot(input: unknown): LegacySnapshot {
    if (
      !record(input) ||
      Object.keys(input).some((name) => name !== "tables") ||
      !record(input.tables)
    )
      blocked();
    const tables: LegacySnapshot["tables"] = {};
    for (const [name, rows] of Object.entries(input.tables)) {
      if (!tableNames.has(name) || !Array.isArray(rows) || rows.length > MAX_TABLE_ROWS) blocked();
      const masked = rows.map((row) => {
        if (!record(row) || typeof row.id !== "string" || row.id.length === 0) blocked();
        return Object.fromEntries(
          Object.entries(row).map(([column, value]) => {
            if (!columnName.test(column)) blocked();
            // The existing FK checker uses exactly this discriminator. Keeping it
            // avoids silently skipping dangling task overrides after masking.
            const output =
              name === "permission_overrides" && column === "resource_type" && value === "task"
                ? "task"
                : maskValue(value, 0);
            return [column, output];
          }),
        );
      });
      tables[name as keyof LegacySnapshot["tables"]] = masked;
    }
    return { tables };
  }
  return { legacy: snapshot(legacy), neon: snapshot(neon) };
}

function parseTarget(value: unknown): { target: SnapshotTarget; url: URL } {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") blocked();
  if (
    !record(value) ||
    Object.keys(value).some(
      (name) => !["connectionString", "isolationConfirmed", "sourceRecord"].includes(name),
    ) ||
    value.isolationConfirmed !== true ||
    typeof value.sourceRecord !== "string" ||
    !value.sourceRecord.trim() ||
    value.sourceRecord.length > 512 ||
    typeof value.connectionString !== "string"
  )
    blocked();
  let url: URL;
  try {
    url = new URL(value.connectionString);
  } catch {
    return blocked();
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["127.0.0.1", "[::1]"].includes(url.hostname) ||
    !url.username ||
    url.search ||
    url.hash
  )
    blocked();
  const port = Number(url.port || 5432);
  if (!Number.isInteger(port) || port < 1 || port > 65535) blocked();
  let name: string;
  try {
    name = decodeURIComponent(url.pathname.slice(1));
  } catch {
    return blocked();
  }
  if (!databaseName.test(name)) blocked();
  return { target: value as SnapshotTarget, url };
}
export function assertLocalSnapshotTarget(value: unknown): asserts value is SnapshotTarget {
  parseTarget(value);
}
export function snapshotTargetIdentity(value: unknown) {
  const { url } = parseTarget(value);
  return [url.hostname, url.port || "5432", decodeURIComponent(url.pathname.slice(1))].join("/");
}

// Always end the exporter transaction, including after query/permission failures.
// row_security=off raises an error if RLS would produce an incomplete inventory;
// it does not grant BYPASSRLS or alter policies.
export async function withSnapshotTransaction<T>(
  client: Client,
  operation: (client: Client) => Promise<T>,
): Promise<T> {
  let active = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    active = true;
    await client.query(
      "SET LOCAL statement_timeout = '30s'; SET LOCAL lock_timeout = '10s'; SET LOCAL idle_in_transaction_session_timeout = '30s'; SET LOCAL row_security = off",
    );
    const identity = (
      await client.query(
        "SELECT current_database() AS database, current_setting('transaction_read_only') AS read_only, current_setting('transaction_isolation') AS isolation",
      )
    ).rows[0];
    if (
      !databaseName.test(identity.database) ||
      identity.read_only !== "on" ||
      identity.isolation !== "repeatable read"
    )
      blocked();
    const result = await operation(client);
    await client.query("ROLLBACK");
    active = false;
    return result;
  } catch {
    return blocked();
  } finally {
    if (active) await client.query("ROLLBACK").catch(() => {});
  }
}

export async function exportIsolatedSnapshot(value: unknown): Promise<LegacySnapshot> {
  const { url } = parseTarget(value);
  // Explicit parsed fields prevent libpq URL parameters / ambient PGHOST options
  // from redirecting a validated local-copy URL to another server.
  const client = new Client({
    host: url.hostname === "[::1]" ? "::1" : url.hostname,
    port: Number(url.port || 5432),
    database: decodeURIComponent(url.pathname.slice(1)),
    user: decodeURIComponent(url.username),
    password: () => decodeURIComponent(url.password),
    connectionTimeoutMillis: 5_000,
    application_name: "clientops-snapshot-export",
    ssl: false,
  });
  client.on("error", () => {});
  try {
    await client.connect();
    return await withSnapshotTransaction(client, async (transaction) => {
      const inventory = (
        await transaction.query<{ name: string; kind: string }>(
          "SELECT c.relname AS name, c.relkind AS kind FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])",
          [[...SNAPSHOT_TABLES]],
        )
      ).rows;
      if (inventory.some((item) => !["r", "p"].includes(item.kind))) blocked();
      const present = new Set(inventory.map((item) => item.name));
      const tables: LegacySnapshot["tables"] = {};
      let bytes = 0;
      for (const name of SNAPSHOT_TABLES) {
        if (!present.has(name)) continue;
        const rows = (
          await transaction.query<{ row: string }>(
            'SELECT to_jsonb(t)::text AS row FROM public."' +
              name +
              '" AS t ORDER BY id::text LIMIT ' +
              (MAX_TABLE_ROWS + 1),
          )
        ).rows.map((item) => item.row);
        if (rows.length > MAX_TABLE_ROWS) blocked();
        bytes += rows.reduce((sum, row) => sum + Buffer.byteLength(row, "utf8"), 0);
        if (bytes > MAX_SNAPSHOT_BYTES) blocked();
        tables[name] = rows.map((row) => parseSnapshotJson(row) as JsonRecord);
      }
      return { tables };
    });
  } catch {
    return blocked();
  } finally {
    await client.end().catch(() => {});
  }
}

// Preserve the lexical representation before JSON.parse rounds a numeric value.
// Current Node and Bun provide the standard reviver source context; refuse older
// runtimes rather than claim equality after losing numeric information.
export function parseSnapshotJson(text: string): unknown {
  try {
    return JSON.parse(text, (_name: string, value: unknown, context?: { source?: string }) => {
      if (typeof value !== "number") return value;
      const source = context?.source;
      if (!source || !/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/.test(source))
        blocked();
      return new SnapshotNumber(source);
    });
  } catch {
    return blocked();
  }
}
