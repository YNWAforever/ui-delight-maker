import { describe, expect, it, vi } from "vitest";
import {
  CLIENTOPS_SCHEMA_CONTRACT,
  verifyClientOpsDatabase,
} from "../clientops-schema-contract";

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
          rows: Object.entries(CLIENTOPS_SCHEMA_CONTRACT.columns).map(
            ([object, contract]) => {
              const [table_name, column_name] = object.split(".");
              return {
                table_name,
                column_name,
                data_type: columnTypes[`public.${object}`] ?? contract.type,
                is_nullable: contract.nullable ? "YES" : "NO",
              };
            },
          ),
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

      throw new Error(`Unexpected contract query: ${text}`);
    }),
  };
}

describe("verifyClientOpsDatabase", () => {
  it("reports missing relations without throwing raw database output", async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) };

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
});
