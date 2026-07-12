import { describe, expect, it, vi } from "vitest";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
import {
  CLIENTOPS_SCHEMA_CONTRACT,
  CLIENTOPS_MIGRATION_PATHS,
  CLIENTOPS_REQUIRED_COLUMNS,
  CLIENTOPS_REQUIRED_TABLES,
  applyClientOpsSchemaMigrations,
  getClientOpsSchemaMigrationDecision,
  verifyClientOpsDatabase,
} from "../clientops-relationship-schema";

describe("getClientOpsSchemaMigrationDecision", () => {
  it("re-exports the database readiness contract", async () => {
    expect(CLIENTOPS_SCHEMA_CONTRACT.relations).toContain("accounts");

    await expect(
      verifyClientOpsDatabase({ query: vi.fn().mockResolvedValue({ rows: [] }) }),
    ).resolves.toMatchObject({
      ready: false,
      mismatches: expect.arrayContaining([
        { category: "missing_relation", object: "public.accounts" },
      ]),
    });
  });

  it("runs the full ordered ClientOps migration set", () => {
    expect(CLIENTOPS_MIGRATION_PATHS).toEqual([
      "neon/migrations/001_clientops_runtime.sql",
      "neon/migrations/002_retention_client_360.sql",
      "neon/migrations/003_client_relationship_360.sql",
      "neon/migrations/004_clientops_schema_hardening.sql",
      "neon/migrations/005_quote_to_cash_accounting_handoff.sql",
      "neon/migrations/006_unified_crm_workspace_foundation.sql",
    ]);
  });

  it("runs the quote-to-cash migration after relationship schema hardening", () => {
    expect(CLIENTOPS_MIGRATION_PATHS).toEqual([
      "neon/migrations/001_clientops_runtime.sql",
      "neon/migrations/002_retention_client_360.sql",
      "neon/migrations/003_client_relationship_360.sql",
      "neon/migrations/004_clientops_schema_hardening.sql",
      "neon/migrations/005_quote_to_cash_accounting_handoff.sql",
      "neon/migrations/006_unified_crm_workspace_foundation.sql",
    ]);
  });

  it("verifies CRM link columns that older existing tables may miss", () => {
    expect(CLIENTOPS_REQUIRED_COLUMNS).toEqual(
      expect.arrayContaining([
        "leads.contact_id",
        "leads.account_id",
        "leads.source_campaign_id",
        "leads.campaign_member_id",
        "clients.account_id",
        "clients.primary_contact_id",
        "quotes.contact_id",
        "quotes.account_id",
        "quotes.deal_id",
        "tasks.contact_id",
        "tasks.account_id",
        "tasks.deal_id",
        "tasks.project_id",
        "engagements.lead_id",
        "engagements.quote_id",
        "touchpoints.contact_id",
      ]),
    );
  });

  it("verifies quote-to-cash handoff tables and columns", () => {
    expect(CLIENTOPS_REQUIRED_TABLES).toEqual(
      expect.arrayContaining([
        "quote_templates",
        "pdf_templates",
        "quote_line_items",
        "quote_versions",
        "job_sheets",
        "job_sheet_portions",
        "job_sheet_activity",
      ]),
    );

    expect(CLIENTOPS_REQUIRED_COLUMNS).toEqual(
      expect.arrayContaining([
        "quotes.quote_template_id",
        "quotes.accepted_version_id",
        "quotes.issued_version_id",
        "quotes.document_sections",
        "quotes.cover_text",
        "quotes.assumptions",
        "quotes.payment_terms",
        "quotes.accepted_at",
        "quotes.accepted_by",
        "quotes.parent_quote_id",
        "quotes.change_order_reason",
        "quote_line_items.quote_id",
        "quote_versions.quote_id",
        "job_sheets.quote_id",
        "job_sheets.accepted_quote_version_id",
        "job_sheet_portions.job_sheet_id",
        "job_sheet_activity.job_sheet_id",
      ]),
    );
  });

  it("verifies unified workspace preference tables", () => {
    expect(CLIENTOPS_REQUIRED_TABLES).toEqual(
      expect.arrayContaining(["workspace_views", "workspace_favorites"]),
    );
  });

  it("skips deploy-time schema migration when DATABASE_URL is absent", () => {
    expect(getClientOpsSchemaMigrationDecision({})).toEqual({
      shouldApply: false,
      reason: "DATABASE_URL is not set",
    });
  });

  it("uses every Neon migration when DATABASE_URL is present", () => {
    expect(
      getClientOpsSchemaMigrationDecision({
        DATABASE_URL: "postgres://user@example/neondb",
      }),
    ).toEqual({
      shouldApply: true,
      databaseUrl: "postgres://user@example/neondb",
      migrationPaths: CLIENTOPS_MIGRATION_PATHS,
    });
  });
});

describe("runClientOpsMigrations", () => {
  it("locks, applies only pending migrations, records them, and unlocks", async () => {
    const calls: string[] = [];
    const db = {
      query: vi.fn(async (text: string) => {
        calls.push(text);
        if (text.includes("select path from clientops_schema_migrations")) {
          return { rows: [{ path: "001_clientops_runtime.sql" }] };
        }
        return { rows: [] };
      }),
    };

    await expect(runClientOpsMigrations(db, [
      { path: "001_clientops_runtime.sql", sql: "select 1" },
      { path: "002_retention_client_360.sql", sql: "select 2" },
    ])).resolves.toEqual({
      applied: ["002_retention_client_360.sql"],
      skipped: ["001_clientops_runtime.sql"],
    });
    expect(calls).toEqual(expect.arrayContaining([
      expect.stringContaining("pg_advisory_lock"),
      "select 2",
      expect.stringContaining("insert into clientops_schema_migrations"),
      expect.stringContaining("pg_advisory_unlock"),
    ]));
  });

  it("rejects unsorted migration paths before touching the database", async () => {
    const db = { query: vi.fn() };
    await expect(runClientOpsMigrations(db, [
      { path: "002.sql", sql: "select 2" },
      { path: "001.sql", sql: "select 1" },
    ])).rejects.toThrow("Migration paths must be unique and sorted");
    expect(db.query).not.toHaveBeenCalled();
  });

  it("runs a pending migration and ledger insert on one transaction client", async () => {
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (text: string) => {
        calls.push(text);
        if (text.includes("select path from clientops_schema_migrations")) {
          return { rows: [] };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const db = {
      query: vi.fn(),
      connect: vi.fn().mockResolvedValue(client),
    };

    await runClientOpsMigrations(db, [
      { path: "001.sql", sql: "select 1" },
    ]);

    expect(client.query).toHaveBeenCalledWith("select pg_advisory_lock($1)", [246813579]);
    expect(client.query).toHaveBeenCalledWith("begin");
    expect(client.query).toHaveBeenCalledWith("select 1");
    expect(client.query).toHaveBeenCalledWith(
      "insert into clientops_schema_migrations(path) values ($1)",
      ["001.sql"],
    );
    expect(client.query).toHaveBeenCalledWith("commit");
    expect(client.release).toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe("applyClientOpsSchemaMigrations", () => {
  it("fails before touching the database when a migration SQL batch is incomplete", async () => {
    const db = {
      query: vi.fn(),
    };

    await expect(
      applyClientOpsSchemaMigrations({
        db,
        migrationSqls: ["-- 001", "-- 002", "-- 003", "-- 004", "-- 005"],
      }),
    ).rejects.toThrow("ClientOps schema migration expected 6 SQL files, received 5");

    expect(db.query).not.toHaveBeenCalled();
  });

  it("applies all migration SQL in order and verifies required tables and columns", async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: CLIENTOPS_REQUIRED_TABLES.map((table_name) => ({ table_name })),
        })
        .mockResolvedValueOnce({
          rows: CLIENTOPS_REQUIRED_COLUMNS.map((column) => {
            const [table_name, column_name] = column.split(".");
            return { table_name, column_name };
          }),
        }),
    };

    await applyClientOpsSchemaMigrations({
      db,
      migrationSqls: ["-- 001", "-- 002", "-- 003", "-- 004", "-- 005", "-- 006"],
    });

    expect(db.query).toHaveBeenNthCalledWith(1, "-- 001");
    expect(db.query).toHaveBeenNthCalledWith(2, "-- 002");
    expect(db.query).toHaveBeenNthCalledWith(3, "-- 003");
    expect(db.query).toHaveBeenNthCalledWith(4, "-- 004");
    expect(db.query).toHaveBeenNthCalledWith(5, "-- 005");
    expect(db.query).toHaveBeenNthCalledWith(6, "-- 006");
    expect(db.query).toHaveBeenNthCalledWith(
      7,
      expect.stringContaining("information_schema.tables"),
      [CLIENTOPS_REQUIRED_TABLES],
    );
    expect(db.query).toHaveBeenNthCalledWith(
      8,
      expect.stringContaining("information_schema.columns"),
      [CLIENTOPS_REQUIRED_COLUMNS],
    );
  });

  it("fails loudly when any required table is missing", async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: CLIENTOPS_REQUIRED_TABLES.filter((table) => table !== "campaigns").map(
            (table_name) => ({ table_name }),
          ),
        }),
    };

    await expect(
      applyClientOpsSchemaMigrations({
        db,
        migrationSqls: [
          "select 1;",
          "select 2;",
          "select 3;",
          "select 4;",
          "select 5;",
          "select 6;",
        ],
      }),
    ).rejects.toThrow("ClientOps schema migration missing required tables: campaigns");
  });

  it("fails loudly when any required column is missing", async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: CLIENTOPS_REQUIRED_TABLES.map((table_name) => ({ table_name })),
        })
        .mockResolvedValueOnce({
          rows: CLIENTOPS_REQUIRED_COLUMNS.filter((column) => column !== "tasks.account_id").map(
            (column) => {
              const [table_name, column_name] = column.split(".");
              return { table_name, column_name };
            },
          ),
        }),
    };

    await expect(
      applyClientOpsSchemaMigrations({
        db,
        migrationSqls: [
          "select 1;",
          "select 2;",
          "select 3;",
          "select 4;",
          "select 5;",
          "select 6;",
        ],
      }),
    ).rejects.toThrow("ClientOps schema migration missing required columns: tasks.account_id");
  });
});
