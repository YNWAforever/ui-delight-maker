import { describe, expect, it, vi } from "vitest";
import {
  applyRelationshipSchemaMigration,
  getRelationshipSchemaMigrationDecision,
} from "../clientops-relationship-schema";

describe("getRelationshipSchemaMigrationDecision", () => {
  it("skips deploy-time schema migration when DATABASE_URL is absent", () => {
    expect(getRelationshipSchemaMigrationDecision({})).toEqual({
      shouldApply: false,
      reason: "DATABASE_URL is not set",
    });
  });

  it("uses the relationship migration when DATABASE_URL is present", () => {
    expect(
      getRelationshipSchemaMigrationDecision({
        DATABASE_URL: "postgres://user@example/neondb",
      }),
    ).toEqual({
      shouldApply: true,
      databaseUrl: "postgres://user@example/neondb",
      migrationPath: "neon/migrations/003_client_relationship_360.sql",
    });
  });
});

describe("applyRelationshipSchemaMigration", () => {
  it("applies the relationship migration SQL and verifies the accounts table exists", async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ accounts_table: "accounts" }] }),
    };

    await applyRelationshipSchemaMigration({
      db,
      migrationSql: "create table if not exists accounts (id uuid primary key);",
    });

    expect(db.query).toHaveBeenNthCalledWith(
      1,
      "create table if not exists accounts (id uuid primary key);",
    );
    expect(db.query).toHaveBeenNthCalledWith(
      2,
      "select to_regclass('public.accounts')::text as accounts_table",
    );
  });

  it("fails loudly when the migration does not create accounts", async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ accounts_table: null }] }),
    };

    await expect(
      applyRelationshipSchemaMigration({
        db,
        migrationSql: "select 1;",
      }),
    ).rejects.toThrow("Relationship schema migration did not create public.accounts");
  });
});
