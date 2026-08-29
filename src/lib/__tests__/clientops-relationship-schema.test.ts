import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
import {
  bootstrapSuperAdmin,
  createBootstrapDatabase,
  type BootstrapDatabase,
} from "../../../scripts/clientops/bootstrap-super-admin";
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
      "neon/migrations/007_admin_team_user_management.sql",
      "neon/migrations/008_read_path_indexes.sql",
      "neon/migrations/009_agent_policy_versions.sql",
    ]);
  });

  it("keeps every migration in ascending numeric order", () => {
    // This is the property the list has to hold as it grows — a later migration may only add
    // to what an earlier one created. Asserting the order rather than re-listing the files
    // means adding a migration does not need this test edited to keep passing.
    const numbers = CLIENTOPS_MIGRATION_PATHS.map((path) => {
      const match = /migrations\/(\d+)_/.exec(path);
      expect(match, `${path} is not numbered`).not.toBeNull();
      return Number(match![1]);
    });

    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    expect(new Set(numbers).size).toBe(numbers.length);
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

  it("registers administration and organization schema objects", () => {
    expect(CLIENTOPS_REQUIRED_TABLES).toEqual(
      expect.arrayContaining([
        "departments",
        "teams",
        "team_memberships",
        "user_invitations",
        "permission_overrides",
        "access_requests",
        "work_delegations",
        "admin_audit_logs",
      ]),
    );

    expect(CLIENTOPS_REQUIRED_COLUMNS).toEqual(
      expect.arrayContaining([
        "profiles.status",
        "profiles.primary_department_id",
        "profiles.manager_profile_id",
        "profiles.session_invalid_before",
      ]),
    );
  });
  it("defines the registered administration schema in migration 007", () => {
    const migrationSql = readFileSync(
      new URL("../../../neon/migrations/007_admin_team_user_management.sql", import.meta.url),
      "utf8",
    );

    expect(migrationSql).toContain("update profiles set role = 'client_success' where role = 'cs'");
    expect(migrationSql).toContain("create table if not exists departments");
    expect(migrationSql).toContain("create table if not exists teams");
    expect(migrationSql).toContain("create table if not exists team_memberships");
    expect(migrationSql).toContain("create table if not exists user_invitations");
    expect(migrationSql).toContain("create table if not exists permission_overrides");
    expect(migrationSql).toContain("create table if not exists access_requests");
    expect(migrationSql).toContain("create table if not exists work_delegations");
    expect(migrationSql).toContain("create table if not exists admin_audit_logs");
    expect(migrationSql).toContain("create trigger admin_audit_logs_immutable");
    const normalizedSql = migrationSql.replace(/\s+/g, " ");
    expect(normalizedSql).toContain(
      "role in ('super_admin','admin','manager','sales','client_success','accounting','read_only')",
    );
    expect(normalizedSql).not.toContain("on delete cascade");
  });

  it("uses the fixed profile roles in seed and UI write boundaries", () => {
    const seedData = readFileSync(
      new URL("../../../scripts/clientops/seed-data.ts", import.meta.url),
      "utf8",
    );
    const types = readFileSync(new URL("../types.ts", import.meta.url), "utf8");
    const mockData = readFileSync(new URL("../mock-data.ts", import.meta.url), "utf8");
    const settings = readFileSync(new URL("../../routes/settings.tsx", import.meta.url), "utf8");

    expect(seedData).toContain('role: "client_success"');
    expect(seedData).not.toContain('role: "cs"');
    expect(types.replace(/\s+/g, " ")).toContain(
      '"super_admin" | "admin" | "manager" | "sales" | "client_success" | "accounting" | "read_only"',
    );
    expect(mockData).not.toContain('role: "cs"');
    expect(settings).not.toContain('value="cs"');
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
    } as unknown as Parameters<typeof runClientOpsMigrations>[0];

    await expect(
      runClientOpsMigrations(db, [
        { path: "001_clientops_runtime.sql", sql: "select 1" },
        { path: "002_retention_client_360.sql", sql: "select 2" },
      ]),
    ).resolves.toEqual({
      applied: ["002_retention_client_360.sql"],
      skipped: ["001_clientops_runtime.sql"],
    });
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.stringContaining("pg_advisory_lock"),
        "select 2",
        expect.stringContaining("insert into clientops_schema_migrations"),
        expect.stringContaining("pg_advisory_unlock"),
      ]),
    );
  });

  it("rejects unsorted migration paths before touching the database", async () => {
    const db = { query: vi.fn() } as unknown as Parameters<typeof runClientOpsMigrations>[0];
    await expect(
      runClientOpsMigrations(db, [
        { path: "002.sql", sql: "select 2" },
        { path: "001.sql", sql: "select 1" },
      ]),
    ).rejects.toThrow("Migration paths must be unique and sorted");
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
    } as unknown as Parameters<typeof runClientOpsMigrations>[0];

    await runClientOpsMigrations(db, [{ path: "001.sql", sql: "select 1" }]);

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
  // Derived from CLIENTOPS_MIGRATION_PATHS rather than a hand-written list of "-- 001" strings:
  // the counts here are an implementation detail of how many migrations exist, and hardcoding
  // them meant every new migration broke four unrelated assertions.
  const migrationCount = CLIENTOPS_MIGRATION_PATHS.length;
  const migrationSqls = CLIENTOPS_MIGRATION_PATHS.map((_, index) => `-- ${index + 1}`);
  const okRows = () => ({ rows: [] });

  function dbApplying(...verificationResults: Array<{ rows: unknown[] }>) {
    const query = vi.fn();
    for (let index = 0; index < migrationCount; index += 1) query.mockResolvedValueOnce(okRows());
    for (const result of verificationResults) query.mockResolvedValueOnce(result);
    return { query };
  }

  const allTables = () => ({
    rows: CLIENTOPS_REQUIRED_TABLES.map((table_name) => ({ table_name })),
  });
  const allColumns = () => ({
    rows: CLIENTOPS_REQUIRED_COLUMNS.map((column) => {
      const [table_name, column_name] = column.split(".");
      return { table_name, column_name };
    }),
  });

  it("fails before touching the database when a migration SQL batch is incomplete", async () => {
    const db = { query: vi.fn() };

    await expect(
      applyClientOpsSchemaMigrations({ db, migrationSqls: migrationSqls.slice(0, -1) }),
    ).rejects.toThrow(
      `ClientOps schema migration expected ${migrationCount} SQL files, received ${migrationCount - 1}`,
    );

    expect(db.query).not.toHaveBeenCalled();
  });

  it("applies all migration SQL in order and verifies required tables and columns", async () => {
    const db = dbApplying(allTables(), allColumns());

    await applyClientOpsSchemaMigrations({ db, migrationSqls });

    migrationSqls.forEach((sql, index) => {
      expect(db.query).toHaveBeenNthCalledWith(index + 1, sql);
    });
    expect(db.query).toHaveBeenNthCalledWith(
      migrationCount + 1,
      expect.stringContaining("information_schema.tables"),
      [CLIENTOPS_REQUIRED_TABLES],
    );
    expect(db.query).toHaveBeenNthCalledWith(
      migrationCount + 2,
      expect.stringContaining("information_schema.columns"),
      [CLIENTOPS_REQUIRED_COLUMNS],
    );
  });

  it("fails loudly when any required table is missing", async () => {
    const db = dbApplying({
      rows: CLIENTOPS_REQUIRED_TABLES.filter((table) => table !== "campaigns").map(
        (table_name) => ({ table_name }),
      ),
    });

    await expect(applyClientOpsSchemaMigrations({ db, migrationSqls })).rejects.toThrow(
      "ClientOps schema migration missing required tables: campaigns",
    );
  });

  it("fails loudly when any required column is missing", async () => {
    const db = dbApplying(allTables(), {
      rows: CLIENTOPS_REQUIRED_COLUMNS.filter((column) => column !== "tasks.account_id").map(
        (column) => {
          const [table_name, column_name] = column.split(".");
          return { table_name, column_name };
        },
      ),
    });

    await expect(applyClientOpsSchemaMigrations({ db, migrationSqls })).rejects.toThrow(
      "ClientOps schema migration missing required columns: tasks.account_id",
    );
  });
});

describe("bootstrapSuperAdmin", () => {
  function createDatabase(
    profiles: Array<{ id: string; email: string; role: string; status: string }>,
  ) {
    const calls: Array<{ text: string; values: readonly unknown[] }> = [];
    const query = vi.fn(async (text: string, values: readonly unknown[] = []) => {
      calls.push({ text, values });
      if (text.includes("from profiles")) {
        return { rows: profiles };
      }
      return { rows: [] };
    });
    const db = {
      transaction: vi.fn(async (work: (client: { query: typeof query }) => Promise<unknown>) =>
        work({ query }),
      ),
    };

    return { calls, db: db as unknown as BootstrapDatabase };
  }

  it("requires both bootstrap environment variables before opening a transaction", async () => {
    const missingDatabaseUrl = createDatabase([]);
    await expect(
      bootstrapSuperAdmin(
        { CLIENTOPS_BOOTSTRAP_SUPER_ADMIN_EMAIL: "admin@example.com" },
        missingDatabaseUrl.db,
      ),
    ).rejects.toThrow("DATABASE_URL");
    expect(missingDatabaseUrl.db.transaction).not.toHaveBeenCalled();

    const missingEmail = createDatabase([]);
    await expect(
      bootstrapSuperAdmin({ DATABASE_URL: "postgres://redacted" }, missingEmail.db),
    ).rejects.toThrow("CLIENTOPS_BOOTSTRAP_SUPER_ADMIN_EMAIL");
    expect(missingEmail.db.transaction).not.toHaveBeenCalled();
  });

  it("normalizes the email, promotes one active profile, and audits the promotion in one transaction", async () => {
    const { calls, db } = createDatabase([
      { id: "profile-1", email: "Admin@Example.com", role: "admin", status: "active" },
    ]);

    await expect(
      bootstrapSuperAdmin(
        {
          DATABASE_URL: "postgres://redacted",
          CLIENTOPS_BOOTSTRAP_SUPER_ADMIN_EMAIL: "  ADMIN@EXAMPLE.COM ",
        },
        db,
      ),
    ).resolves.toBe("profile-1");

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(calls[0]).toMatchObject({ values: ["admin@example.com"] });
    expect(
      calls.some(({ text }) => text.includes("update profiles") && text.includes("super_admin")),
    ).toBe(true);
    expect(
      calls.some(
        ({ text, values }) =>
          text.includes("admin_audit_logs") && values.includes("profile.bootstrap_super_admin"),
      ),
    ).toBe(true);
  });

  it.each([
    ["no active profile", []],
    [
      "ambiguous active profiles",
      [
        { id: "profile-1", email: "admin@example.com", role: "admin", status: "active" },
        { id: "profile-2", email: "admin@example.com", role: "admin", status: "active" },
      ],
    ],
  ])("refuses %s without mutating profiles or writing an audit log", async (_label, profiles) => {
    const { calls, db } = createDatabase(profiles);

    await expect(
      bootstrapSuperAdmin(
        {
          DATABASE_URL: "postgres://redacted",
          CLIENTOPS_BOOTSTRAP_SUPER_ADMIN_EMAIL: "admin@example.com",
        },
        db,
      ),
    ).rejects.toThrow();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain("from profiles");
  });

  it("never demotes an existing Super Admin when the target is already promoted", async () => {
    const { calls, db } = createDatabase([
      { id: "profile-1", email: "admin@example.com", role: "super_admin", status: "active" },
    ]);

    await expect(
      bootstrapSuperAdmin(
        {
          DATABASE_URL: "postgres://redacted",
          CLIENTOPS_BOOTSTRAP_SUPER_ADMIN_EMAIL: "admin@example.com",
        },
        db,
      ),
    ).resolves.toBe("profile-1");

    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain("from profiles");
  });

  it("rolls back and releases the connection when the audit insert fails", async () => {
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (text: string) => {
        calls.push(text);
        if (text.includes("from profiles")) {
          return {
            rows: [
              {
                id: "profile-1",
                email: "admin@example.com",
                role: "admin",
                status: "active",
              },
            ],
          };
        }
        if (text.includes("insert into admin_audit_logs")) {
          throw new Error("audit failed");
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = {
      connect: vi.fn().mockResolvedValue(client),
    };

    await expect(
      bootstrapSuperAdmin(
        {
          DATABASE_URL: "postgres://redacted",
          CLIENTOPS_BOOTSTRAP_SUPER_ADMIN_EMAIL: "admin@example.com",
        },
        createBootstrapDatabase(pool),
      ),
    ).rejects.toThrow("audit failed");

    expect(calls).toEqual(
      expect.arrayContaining(["begin", expect.stringContaining("from profiles"), "rollback"]),
    );
    expect(calls).not.toContain("commit");
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
