import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  applyClientOpsSchemaMigrations,
  getClientOpsSchemaMigrationDecision,
} from "../../src/lib/clientops-relationship-schema";

const decision = getClientOpsSchemaMigrationDecision(process.env);

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
  const migrationSqls = await Promise.all(
    decision.migrationPaths.map((migrationPath) =>
      readFile(resolve(process.cwd(), migrationPath), "utf8"),
    ),
  );
  const pool = new Pool({ connectionString: decision.databaseUrl });

  try {
    await applyClientOpsSchemaMigrations({ db: pool, migrationSqls });
    console.log(
      JSON.stringify(
        {
          ok: true,
          applied: decision.migrationPaths,
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}
