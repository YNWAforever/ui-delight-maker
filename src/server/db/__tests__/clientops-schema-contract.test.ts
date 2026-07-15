import { describe, expect, it, vi } from "vitest";
import { CLIENTOPS_SCHEMA_CONTRACT, verifyClientOpsDatabase } from "../clientops-schema-contract";

function contractQueryStub(columnTypes: Record<string, string> = {}) {
  return {
    query: vi.fn(async (text: string) => {
      if (text.includes("information_schema.tables")) {
        return {
          rows: CLIENTOPS_SCHEMA_CONTRACT.relations.map((table_name) => ({ table_name })),
        };
      }

      if (text.includes("information_schema.columns")) {
        return {
          rows: Object.entries(CLIENTOPS_SCHEMA_CONTRACT.columns).map(([object, contract]) => {
            const [table_name, column_name] = object.split(".");
            return {
              table_name,
              column_name,
              data_type: columnTypes[`public.${object}`] ?? contract.type,
              is_nullable: contract.nullable ? "YES" : "NO",
            };
          }),
        };
      }

      if (text.includes("pg_constraint")) {
        return {
          rows: CLIENTOPS_SCHEMA_CONTRACT.constraints.map((constraint_name) => ({
            constraint_name,
          })),
        };
      }

      if (text.includes("pg_indexes")) {
        return {
          rows: CLIENTOPS_SCHEMA_CONTRACT.indexes.map((indexname) => ({ indexname })),
        };
      }
      if (text.includes("information_schema.triggers")) {
        return {
          rows: CLIENTOPS_SCHEMA_CONTRACT.triggers.map((trigger_name) => ({ trigger_name })),
        };
      }

      throw new Error(`Unexpected contract query: ${text}`);
    }),
  } as unknown as Parameters<typeof verifyClientOpsDatabase>[0];
}

describe("verifyClientOpsDatabase", () => {
  it("reports missing relations without throwing raw database output", async () => {
    const db = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    } as unknown as Parameters<typeof verifyClientOpsDatabase>[0];

    const result = await verifyClientOpsDatabase(db);

    expect(result.ready).toBe(false);
    expect(result).toMatchObject({
      mismatches: expect.arrayContaining([
        { category: "missing_relation", object: "public.accounts" },
      ]),
    });
    expect(JSON.stringify(result)).not.toContain("DATABASE_URL");
  });

  it("reports an incompatible UUID column", async () => {
    const db = contractQueryStub({ "public.accounts.id": "text" });

    const result = await verifyClientOpsDatabase(db);

    expect(result).toMatchObject({
      ready: false,
      mismatches: expect.arrayContaining([
        {
          category: "incompatible_type",
          object: "public.accounts.id",
          expected: "uuid",
          actual: "text",
        },
      ]),
    });
  });

  it("verifies the admin organization schema and immutable audit trigger", () => {
    expect(CLIENTOPS_SCHEMA_CONTRACT.relations).toEqual(
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
    expect(CLIENTOPS_SCHEMA_CONTRACT.columns).toMatchObject({
      "profiles.status": { type: "text", nullable: false },
      "profiles.primary_department_id": { type: "uuid", nullable: true },
      "profiles.manager_profile_id": { type: "text", nullable: true },
      "profiles.session_invalid_before": {
        type: "timestamp with time zone",
        nullable: true,
      },
    });
    expect(CLIENTOPS_SCHEMA_CONTRACT.constraints).toEqual(
      expect.arrayContaining([
        "profiles_role_check",
        "profiles_status_check",
        "profiles_availability_status_check",
      ]),
    );
    expect(CLIENTOPS_SCHEMA_CONTRACT.triggers).toContain("admin_audit_logs_immutable");
  });
});
