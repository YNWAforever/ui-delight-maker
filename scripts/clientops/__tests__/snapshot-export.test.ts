import { describe, expect, it } from "vitest";
import { reconcileLegacySnapshots } from "../../../src/server/db/legacy-domain-parity";
import { assertLocalSnapshotTarget, maskSnapshotPair, parseSnapshotJson } from "../snapshot-export";
const key = Buffer.alloc(32, 7);
function pairFixture() {
  return {
    tables: {
      profiles: [{ id: "person-a", email: "person@example.invalid", role: "sales" }],
      accounts: [{ id: "account-a", name: "Private Company", phone: 85212345678 }],
      tasks: [
        {
          id: "task-a",
          assigned_to: "person-a",
          account_id: "account-a",
          project_id: "project-a",
          title: "Private task",
          status: "open",
          payload: {
            "person@example.invalid": ["Private message", 1234],
            nested: { note: "secret-value" },
          },
          flag: false,
          empty: "",
          optional: null,
        },
      ],
      projects: [{ id: "project-a", owner: "person-a" }],
      permission_overrides: [
        {
          id: "override-a",
          profile_id: "person-a",
          resource_type: "task",
          resource_id: "task-a",
          capability: "tasks.view",
          effect: "allow",
          reason: "Private reason",
        },
      ],
      customer_success_profiles: [],
      success_touchpoints: [],
      deals: [],
      engagement_events: [],
      channel_identities: [],
      automation_playbooks: [],
      automation_runs: [],
    },
  };
}
describe("T20 pair pseudonymisation", () => {
  it("removes identifying values and nested JSON keys while preserving all ID relationships", () => {
    const raw = pairFixture();
    const original = JSON.stringify(raw);
    const { legacy, neon } = maskSnapshotPair(raw, structuredClone(raw), key);
    const text = JSON.stringify(legacy);
    for (const secret of [
      "person-a",
      "person@example.invalid",
      "Private Company",
      "85212345678",
      "Private task",
      "Private message",
      "secret-value",
      "1234",
      "Private reason",
    ])
      expect(text).not.toContain(secret);
    expect(JSON.stringify(raw)).toBe(original);
    expect(legacy.tables.tasks![0].assigned_to).toBe(legacy.tables.profiles![0].id);
    expect(legacy.tables.tasks![0].account_id).toBe(legacy.tables.accounts![0].id);
    expect(legacy.tables.tasks![0].project_id).toBe(legacy.tables.projects![0].id);
    expect(legacy.tables.permission_overrides![0].resource_id).toBe(legacy.tables.tasks![0].id);
    expect(legacy.tables.permission_overrides![0].resource_type).toBe("task");
    expect(legacy.tables.tasks![0]).toMatchObject({ flag: false, empty: "", optional: null });
    expect(reconcileLegacySnapshots(legacy, neon).ready).toBe(true);
  });
  it("does not hide owner, scope, permission, state or nested-content drift", () => {
    const left = pairFixture();
    const right = pairFixture();
    right.tables.tasks[0].assigned_to = "different-owner";
    right.tables.tasks[0].project_id = "different-project";
    right.tables.tasks[0].status = "closed";
    right.tables.tasks[0].payload.nested.note = "different-note";
    right.tables.permission_overrides[0].effect = "deny";
    const pair = maskSnapshotPair(left, right, key);
    const result = reconcileLegacySnapshots(pair.legacy, pair.neon);
    expect(result.ready).toBe(false);
    expect(result.tables.tasks).toMatchObject({
      status: "mismatch",
      ownerMismatches: 1,
      scopeMismatches: 1,
    });
    expect(result.tables.permission_overrides.overrideMismatches).toBe(1);
    expect(result.foreignKeys.neon).toEqual({ status: "mismatch", violations: 2 });
  });
  it("does not mask a dangling task override into a valid relation", () => {
    const raw = pairFixture();
    raw.tables.permission_overrides[0].resource_id = "absent-task";
    const pair = maskSnapshotPair(raw, structuredClone(raw), key);
    expect(reconcileLegacySnapshots(pair.legacy, pair.neon).foreignKeys.legacy).toEqual({
      status: "mismatch",
      violations: 1,
    });
  });
  it("retains absence and duplicates rather than inventing complete snapshots", () => {
    const raw = { tables: { tasks: [{ id: "duplicate" }, { id: "duplicate" }] } };
    const pair = maskSnapshotPair(raw, structuredClone(raw), key);
    const report = reconcileLegacySnapshots(pair.legacy, pair.neon);
    expect(report.ready).toBe(false);
    expect(report.tables.tasks.duplicateIds).toBe(2);
    expect(report.tables.projects.status).toBe("missing_snapshot");
    expect(pair.legacy.tables).not.toHaveProperty("projects");
  });
  it("uses a different token namespace for each fresh key", () => {
    const raw = pairFixture();
    expect(maskSnapshotPair(raw, raw, key).legacy.tables.tasks![0].id).not.toBe(
      maskSnapshotPair(raw, raw, Buffer.alloc(32, 8)).legacy.tables.tasks![0].id,
    );
  });
  it.each([
    { tables: { tasks: [{ id: "" }] } },
    { tables: { tasks: [{ id: 42 }] } },
    { tables: { tasks: null } },
    { tables: { passwords: [{ id: "secret-row" }] } },
    { tables: { tasks: [{ id: "ok", "private@example.invalid": "secret" }] } },
    { tables: { tasks: [{ id: "ok", count: Number.NaN }] } },
    { tables: { tasks: [{ id: "ok", count: Number.MAX_SAFE_INTEGER + 1 }] } },
  ])("rejects invalid/invented input without exposing its payload", (raw) => {
    expect(() => maskSnapshotPair(raw, raw, key)).toThrow("Snapshot preparation blocked");
  });
  it("rejects a weak key", () => {
    expect(() => maskSnapshotPair(pairFixture(), pairFixture(), Buffer.alloc(4))).toThrow(
      "Snapshot preparation blocked",
    );
  });
});
describe("local-copy target guard", () => {
  const accepted = {
    connectionString: "postgresql://user:secret@127.0.0.1:5432/clientops_snapshot_legacy",
    isolationConfirmed: true,
    sourceRecord: "approved-copy-record",
  };
  it("accepts an explicitly attested loopback copy", () =>
    expect(() => assertLocalSnapshotTarget(accepted)).not.toThrow());
  it("accepts a passwordless local trust fixture without ambient credential fallback", () =>
    expect(() =>
      assertLocalSnapshotTarget({
        ...accepted,
        connectionString: "postgresql://user@127.0.0.1/clientops_snapshot_trust",
      }),
    ).not.toThrow());
  it.each([
    { ...accepted, connectionString: "postgresql://user@127.0.0.1:0/clientops_snapshot_copy" },
    { ...accepted, isolationConfirmed: false },
    { ...accepted, sourceRecord: "" },
    {
      ...accepted,
      connectionString: "postgresql://user:secret@production.example/clientops_snapshot_legacy",
    },
    {
      ...accepted,
      connectionString: "postgresql://user:secret@localhost/clientops_snapshot_legacy",
    },
    { ...accepted, connectionString: "postgresql://user:secret@127.0.0.1/main" },
    { ...accepted, connectionString: accepted.connectionString + "?host=production.example" },
    { ...accepted, connectionString: accepted.connectionString + "#production" },
    { ...accepted, connectionString: "https://127.0.0.1/clientops_snapshot_legacy" },
  ])("refuses unconfirmed, remote, production-named and overriding targets", (target) =>
    expect(() => assertLocalSnapshotTarget(target)).toThrow("Snapshot preparation blocked"),
  );
});

describe("lossless comparison inputs", () => {
  it("does not collapse distinct JSON decimal values through JS number rounding", () => {
    const left = parseSnapshotJson(
      '{"tables":{"tasks":[{"id":"a","amount":0.123456789012345678901}]}}',
    );
    const right = parseSnapshotJson(
      '{"tables":{"tasks":[{"id":"a","amount":0.123456789012345678902}]}}',
    );
    const pair = maskSnapshotPair(left, right, key);
    expect(reconcileLegacySnapshots(pair.legacy, pair.neon).tables.tasks.status).toBe("mismatch");
  });
  it("does not collapse different unpaired Unicode code units in IDs or JSON keys", () => {
    const pair = maskSnapshotPair(
      { tables: { tasks: [{ id: "\ud800" }] } },
      { tables: { tasks: [{ id: "\ud801" }] } },
      key,
    );
    expect(reconcileLegacySnapshots(pair.legacy, pair.neon).tables.tasks.missingIds).toBe(1);
    const keys = maskSnapshotPair(
      { tables: { tasks: [{ id: "a", payload: { "\ud800": "same" } }] } },
      { tables: { tasks: [{ id: "a", payload: { "\ud801": "same" } }] } },
      key,
    );
    expect(reconcileLegacySnapshots(keys.legacy, keys.neon).tables.tasks.status).toBe("mismatch");
  });
});
