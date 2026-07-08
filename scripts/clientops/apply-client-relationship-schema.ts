import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  applyRelationshipSchemaMigration,
  getRelationshipSchemaMigrationDecision,
} from "../../src/lib/clientops-relationship-schema";

const decision = getRelationshipSchemaMigrationDecision(process.env);

if (decision.shouldApply === false) {
  console.log(
    JSON.stringify(
      {
        ok: true,
        skipped: true,
        reason: decision.reason,
      },
      null,
      2,
    ),
  );
} else {
  const { Pool } = await import("@neondatabase/serverless");
  const migrationPath = resolve(process.cwd(), decision.migrationPath);
  const migrationSql = await readFile(migrationPath, "utf8");
  const pool = new Pool({ connectionString: decision.databaseUrl });

  try {
    await applyRelationshipSchemaMigration({ db: pool, migrationSql });
    console.log(
      JSON.stringify(
        {
          ok: true,
          applied: decision.migrationPath,
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}
