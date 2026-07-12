import type { Queryable } from "./neon.server";

export type DatabaseMismatchCategory =
  | "missing_relation"
  | "missing_column"
  | "incompatible_type"
  | "invalid_nullability"
  | "missing_default"
  | "missing_constraint"
  | "missing_index"
  | "migration_order_error";

export type DatabaseContractMismatch = {
  category: DatabaseMismatchCategory;
  object: string;
  expected?: string;
  actual?: string;
};

export type DatabaseReadinessResult =
  | { ready: true; checkedAt: string; contractVersion: "2026-07-12" }
  | {
      ready: false;
      checkedAt: string;
      contractVersion: "2026-07-12";
      mismatches: DatabaseContractMismatch[];
    };

export const CLIENTOPS_SCHEMA_CONTRACT = {
  relations: [
    "accounts",
    "account_contacts",
    "clients",
    "leads",
    "quotes",
    "tasks",
    "activity_logs",
    "human_approvals",
    "agent_runs",
    "campaign_members",
    "relationship_signals",
    "engagements",
    "touchpoints",
    "job_sheets",
  ] as const,
  columns: {
    "accounts.id": { type: "uuid", nullable: false },
    "account_contacts.account_id": { type: "uuid", nullable: false },
    "clients.account_id": { type: "uuid", nullable: true },
    "leads.account_id": { type: "uuid", nullable: true },
    "quotes.account_id": { type: "uuid", nullable: true },
    "tasks.account_id": { type: "uuid", nullable: true },
    "activity_logs.object_id": { type: "uuid", nullable: false },
    "activity_logs.diff_data": { type: "jsonb", nullable: true },
    "human_approvals.context_data": { type: "jsonb", nullable: true },
    "job_sheets.account_id": { type: "uuid", nullable: true },
  },
  constraints: [
    "account_contacts_account_id_fkey",
    "relationship_signals_account_id_fkey",
  ] as const,
  indexes: [
    "accounts_last_activity_idx",
    "account_contacts_account_id_idx",
    "clients_account_id_idx",
    "leads_account_id_idx",
    "quotes_account_id_idx",
    "tasks_account_id_idx",
    "activity_logs_object_idx",
    "relationship_signals_account_idx",
    "job_sheets_account_id_idx",
  ] as const,
} as const;

type SchemaContract = typeof CLIENTOPS_SCHEMA_CONTRACT;

async function inspectContract(
  db: Queryable,
  contract: SchemaContract,
): Promise<DatabaseContractMismatch[]> {
  const [relations, columns, constraints, indexes] = await Promise.all([
    db.query<{ table_name: string }>(
      `
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_name = any($1::text[])
      `,
      [contract.relations],
    ),
    db.query<{
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: "YES" | "NO";
    }>(
      `
        select table_name, column_name, data_type, is_nullable
        from information_schema.columns
        where table_schema = 'public'
          and (table_name || '.' || column_name) = any($1::text[])
      `,
      [Object.keys(contract.columns)],
    ),
    db.query<{ constraint_name: string }>(
      `
        select con.conname as constraint_name
        from pg_catalog.pg_constraint con
        join pg_catalog.pg_namespace namespace on namespace.oid = con.connamespace
        where namespace.nspname = 'public'
          and con.conname = any($1::text[])
      `,
      [contract.constraints],
    ),
    db.query<{ indexname: string }>(
      `
        select indexname
        from pg_catalog.pg_indexes
        where schemaname = 'public'
          and indexname = any($1::text[])
      `,
      [contract.indexes],
    ),
  ]);

  const mismatches: DatabaseContractMismatch[] = [];
  const existingRelations = new Set(relations.rows.map((row) => row.table_name));
  for (const relation of contract.relations) {
    if (!existingRelations.has(relation)) {
      mismatches.push({ category: "missing_relation", object: `public.${relation}` });
    }
  }

  const existingColumns = new Map(
    columns.rows.map((row) => [`${row.table_name}.${row.column_name}`, row]),
  );
  for (const [column, expected] of Object.entries(contract.columns)) {
    const actual = existingColumns.get(column);
    const object = `public.${column}`;

    if (!actual) {
      mismatches.push({ category: "missing_column", object });
      continue;
    }

    if (actual.data_type !== expected.type) {
      mismatches.push({
        category: "incompatible_type",
        object,
        expected: expected.type,
        actual: actual.data_type,
      });
    }

    const nullable = actual.is_nullable === "YES";
    if (nullable !== expected.nullable) {
      mismatches.push({
        category: "invalid_nullability",
        object,
        expected: expected.nullable ? "nullable" : "not null",
        actual: nullable ? "nullable" : "not null",
      });
    }
  }

  const existingConstraints = new Set(constraints.rows.map((row) => row.constraint_name));
  for (const constraint of contract.constraints) {
    if (!existingConstraints.has(constraint)) {
      mismatches.push({ category: "missing_constraint", object: constraint });
    }
  }

  const existingIndexes = new Set(indexes.rows.map((row) => row.indexname));
  for (const index of contract.indexes) {
    if (!existingIndexes.has(index)) {
      mismatches.push({ category: "missing_index", object: index });
    }
  }

  return mismatches;
}

export async function verifyClientOpsDatabase(db: Queryable): Promise<DatabaseReadinessResult> {
  const checkedAt = new Date().toISOString();
  const mismatches = await inspectContract(db, CLIENTOPS_SCHEMA_CONTRACT);

  return mismatches.length === 0
    ? { ready: true, checkedAt, contractVersion: "2026-07-12" }
    : { ready: false, checkedAt, contractVersion: "2026-07-12", mismatches };
}
