import { createSupabaseServerClient } from "@/legacy-supabase/server";
import type { Task } from "@/lib/types";
import { query } from "@/server/db/neon.server";

const LEGACY_DOMAINS = [
  "automation_playbooks",
  "customer_success",
  "deals",
  "engagement_events",
  "projects",
] as const;
export type LegacyDomain = (typeof LEGACY_DOMAINS)[number];
type Environment = Record<string, string | undefined>;
type TaskScope = "account_id" | "project_id" | "deal_id";
type TaskRead = { data: Task[] | null; error: { message: string } | null };

/**
 * All five legacy domains remain in Supabase until a complete local snapshot,
 * owner/override parity and a write-freeze or change-capture cutover are proved.
 * A requested unsupported source fails closed; it cannot turn a read error into [].
 */
export function selectLegacyDomainSource(domain: LegacyDomain, env: Environment = process.env) {
  const value = env[`CLIENTOPS_LEGACY_${domain.toUpperCase()}_SOURCE`] ?? "legacy";
  if (value !== "legacy") {
    throw new Error(`No verified Neon cutover exists for ${domain}`);
  }
  return "legacy" as const;
}

export function createLegacyDomainClient(domain: LegacyDomain) {
  selectLegacyDomainSource(domain);
  return createSupabaseServerClient();
}

/**
 * Only disposable local PostgreSQL may rehearse switching workspace task reads.
 * Production cannot opt in by setting an env flag: source and ownership IDs have
 * to be reconciled before a production cutover is designed.
 */
export function selectLegacyTaskReadSource(env: Environment = process.env) {
  const source = env.CLIENTOPS_LEGACY_TASK_READ_SOURCE ?? "legacy";
  if (source === "legacy") return source;
  if (source !== "neon") throw new Error("Unknown legacy task read source");
  if (env.NODE_ENV === "production") throw new Error("Production Neon task cutover is unverified");
  if (env.CLIENTOPS_LEGACY_TASK_REHEARSAL !== "1") {
    throw new Error("Neon task reads require an explicit local rehearsal");
  }
  let url: URL;
  try {
    url = new URL(env.DATABASE_URL ?? "");
  } catch {
    throw new Error("Neon task rehearsal requires a disposable local database");
  }
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  const isolatedTestDatabase =
    env.NODE_ENV === "test" &&
    env.DATABASE_TEST_URL === env.DATABASE_URL &&
    Boolean(env.DATABASE_TEST_URL) &&
    databaseName.startsWith("clientops_");
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    !(databaseName.startsWith("clientops_t20_") || isolatedTestDatabase)
  ) {
    throw new Error("Neon task rehearsal requires a disposable local database");
  }
  return "neon" as const;
}

export function loadWorkspaceTaskRows(
  scope: TaskScope,
  id: string,
  legacyRead: () => PromiseLike<TaskRead>,
  env: Environment = process.env,
): PromiseLike<TaskRead> {
  // Keep this lazy so Promise.all starts the four legacy reads in declaration
  // order, as before this adapter existed.
  return {
    then<TResult1 = TaskRead, TResult2 = never>(
      onfulfilled?: ((value: TaskRead) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      return Promise.resolve()
        .then(async (): Promise<TaskRead> => {
          if (selectLegacyTaskReadSource(env) === "legacy") return await legacyRead();
          try {
            const rows = await query<Task>(
              `select * from tasks where ${scope} = $1 ${scope === "account_id" ? "order by created_at desc" : ""}`,
              [id],
            );
            return { data: rows, error: null };
          } catch (cause) {
            return {
              data: null,
              error: { message: cause instanceof Error ? cause.message : "Neon task read failed" },
            };
          }
        })
        .then(onfulfilled, onrejected);
    },
  };
}
