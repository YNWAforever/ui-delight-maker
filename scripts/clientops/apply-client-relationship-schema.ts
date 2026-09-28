import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getClientOpsSchemaMigrationDecision } from "../../src/lib/clientops-relationship-schema";
import { createClientOpsScriptPool } from "../../src/lib/clientops-script-pool";
import { runClientOpsMigrations } from "../../src/server/db/clientops-migrations";

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
  const migrations = await Promise.all(
    decision.migrationPaths.map((migrationPath) =>
      readFile(resolve(process.cwd(), migrationPath), "utf8").then((sql) => ({
        path: migrationPath,
        sql,
      })),
    ),
  );
  const pool = await createClientOpsScriptPool(decision.databaseUrl);

  try {
    const result = await runClientOpsMigrations(pool, migrations);
    console.log(
      JSON.stringify(
        {
          ok: true,
          ...result,
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}
