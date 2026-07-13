import { Pool } from "@neondatabase/serverless";
import { verifyClientOpsDatabase } from "../../src/server/db/clientops-schema-contract";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for schema verification");
}

const pool = new Pool({ connectionString: databaseUrl });
try {
  const result = await verifyClientOpsDatabase(pool);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ready) {
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
