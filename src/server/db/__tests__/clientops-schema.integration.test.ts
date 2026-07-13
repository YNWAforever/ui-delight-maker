import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import { runClientOpsMigrations } from "../clientops-migrations";
import { verifyClientOpsDatabase } from "../clientops-schema-contract";

describe("ClientOps PostgreSQL contract", () => {
  it.runIf(Boolean(process.env.DATABASE_TEST_URL))(
    "migrates an empty PostgreSQL database to a ready contract",
    async () => {
      const pool = new Pool({ connectionString: process.env.DATABASE_TEST_URL });
      try {
        const migrations = await Promise.all(
          CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({
            path,
            sql: await readFile(path, "utf8"),
          })),
        );
        await runClientOpsMigrations(pool, migrations);
        const readiness = await verifyClientOpsDatabase(pool);
        expect(readiness.ready, JSON.stringify(readiness, null, 2)).toBe(true);
      } finally {
        await pool.end();
      }
    },
  );
});
