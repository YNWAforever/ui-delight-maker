import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const holder = vi.hoisted(() => ({ pool: null as Pool | null }));
vi.mock("@/server/db/neon.server", () => ({
  query: async (sql: string, values: readonly unknown[] = []) =>
    (await holder.pool!.query(sql, [...values])).rows,
}));
import { loadNoteTidyRuns } from "../note-tidy-runs";
import { CLIENTOPS_MIGRATION_PATHS } from "@/lib/clientops-relationship-schema";
import { runClientOpsMigrations } from "@/server/db/clientops-migrations";
const enabled = Boolean(process.env.DATABASE_TEST_URL),
  databaseName = "clientops_ai_note_" + randomUUID().replaceAll("-", "");
const actor = "note-fixture-owner",
  other = "note-fixture-other",
  otherRun = randomUUID();
let admin: Pool;
describe("metadata-only note history in physical PostgreSQL", () => {
  beforeAll(async () => {
    if (!enabled) return;
    const url = new URL(process.env.DATABASE_TEST_URL!);
    if (url.hostname === "localhost") url.hostname = "127.0.0.1";
    if (url.hostname !== "127.0.0.1") throw new Error("Disposable loopback PostgreSQL required");
    admin = new Pool({ connectionString: url.toString() });
    await admin.query(`create database "${databaseName}"`);
    url.pathname = "/" + databaseName;
    holder.pool = new Pool({ connectionString: url.toString() });
    await runClientOpsMigrations(
      holder.pool,
      await Promise.all(
        CLIENTOPS_MIGRATION_PATHS.map(async (path) => ({
          path,
          sql: await readFile(path, "utf8"),
        })),
      ),
    );
    await holder.pool.query(
      "insert into profiles(id,email,name,role) values($1,'note-owner@fixture.invalid','Owner','sales'),($2,'note-other@fixture.invalid','Other','admin')",
      [actor, other],
    );
    await holder.pool.query(
      `insert into agent_runs(agent_name,workflow_type,subject_type,subject_id,created_by,status,input_data,output_data) select 'Note Tidy','note_tidy','note',gen_random_uuid(),$1,'completed','{"original":"private original"}','{"tidied":"private output"}' from generate_series(1,27)`,
      [actor],
    );
    await holder.pool.query(
      "insert into agent_runs(id,agent_name,workflow_type,subject_type,subject_id,created_by,status,output_data) values($1,'Note Tidy','note_tidy','note',$2,$3,'completed','{\"tidied\":\"someone else\"}')",
      [otherRun, randomUUID(), other],
    );
  }, 60000);
  afterAll(async () => {
    await holder.pool?.end();
    holder.pool = null;
    if (admin) {
      if (!/^clientops_ai_note_[a-f0-9]{32}$/.test(databaseName))
        throw new Error("Owned name required");
      await admin.query(`drop database if exists "${databaseName}"`);
      await admin.end();
    }
  });
  it.runIf(enabled)("scopes_note_history_to_authorized_actor", async () => {
    const page = await loadNoteTidyRuns(actor, { page: 1, limit: 25 });
    expect(page.total).toBe(27);
    expect(page.items).toHaveLength(25);
    expect(page.items.map((v) => v.id)).not.toContain(otherRun);
    expect(await loadNoteTidyRuns(actor, { page: 1, limit: 25, runId: otherRun })).toMatchObject({
      total: 0,
      items: [],
    });
  });
  it.runIf(enabled)("omits_note_bodies_from_list_payload", async () => {
    const page = await loadNoteTidyRuns(actor, { page: 1, limit: 25 });
    for (const value of [
      "private original",
      "private output",
      "input_data",
      "output_data",
      "subject_id",
      "created_by",
    ])
      expect(JSON.stringify(page)).not.toContain(value);
  });
  it.runIf(enabled)("reaches own history after the first 25 metadata rows", async () => {
    const first = await loadNoteTidyRuns(actor, { page: 1, limit: 25 }),
      second = await loadNoteTidyRuns(actor, { page: 2, limit: 25 });
    expect(second.items).toHaveLength(2);
    expect(new Set([...first.items, ...second.items].map((v) => v.id)).size).toBe(27);
    const selected = await loadNoteTidyRuns(actor, {
      page: 1,
      limit: 25,
      runId: second.items[0].id,
    });
    expect(selected.items).toHaveLength(1);
  });
});
