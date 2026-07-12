import { readFile } from "node:fs/promises";
import { Pool } from "@neondatabase/serverless";
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
        await expect(verifyClientOpsDatabase(pool)).resolves.toMatchObject({ ready: true });
      } finally {
        await pool.end();
      }
    },
  );
});
