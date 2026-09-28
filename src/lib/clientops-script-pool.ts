/**
 * Production scripts retain Neon’s driver. Local build rehearsals opt in to node-postgres
 * only when both database variables identify the same disposable loopback test database.
 */
type ScriptEnv = Record<string, string | undefined>;

export function selectClientOpsScriptDriver(databaseUrl: string, env: ScriptEnv): "neon" | "pg" {
  if (env.CLIENTOPS_SCRIPT_LOCAL_PG !== "1") return "neon";

  if (env.DATABASE_URL !== databaseUrl || env.DATABASE_TEST_URL !== databaseUrl) {
    throw new Error("Local pg rehearsal requires DATABASE_URL and DATABASE_TEST_URL to match");
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("Local pg rehearsal requires a disposable loopback test database");
  }

  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    parsed.hostname !== "127.0.0.1" ||
    !parsed.port ||
    parsed.pathname !== "/clientops_test"
  ) {
    throw new Error("Local pg rehearsal requires a disposable loopback test database");
  }

  return "pg";
}

export async function createClientOpsScriptPool(databaseUrl: string, env: ScriptEnv = process.env) {
  if (selectClientOpsScriptDriver(databaseUrl, env) === "pg") {
    const { Pool } = await import("pg");
    return new Pool({ connectionString: databaseUrl });
  }
  const { Pool } = await import("@neondatabase/serverless");
  return new Pool({ connectionString: databaseUrl });
}
