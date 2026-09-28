import { Pool } from "pg";
import { selectClientOpsScriptDriver } from "../../src/lib/clientops-script-pool";

const databaseUrl = process.env.DATABASE_TEST_URL;
if (!databaseUrl || selectClientOpsScriptDriver(databaseUrl, process.env) !== "pg") {
  throw new Error("Demo seed counts require the explicitly guarded local test database");
}

const pool = new Pool({ connectionString: databaseUrl });
try {
  const result = await pool.query<{
    migrations: number;
    profiles: number;
    quotes: number;
    quote_versions: number;
    approvals: number;
  }>(`
    select
      (select count(*)::int from clientops_schema_migrations) as migrations,
      (select count(*)::int from profiles) as profiles,
      (select count(*)::int from quotes) as quotes,
      (select count(*)::int from quote_versions) as quote_versions,
      (select count(*)::int from human_approvals) as approvals
  `);
  console.log(JSON.stringify(result.rows[0]));
} finally {
  await pool.end();
}
