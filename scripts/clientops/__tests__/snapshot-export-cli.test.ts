import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
const exec = promisify(execFile);
const root = resolve(".clientops-perf/snapshots");
let input: string;
const outputs: string[] = [];
async function run(args: string[]) {
  try {
    const result = await exec("bun", ["scripts/clientops/export-legacy-snapshots.ts", ...args]);
    return { ...result, code: 0 };
  } catch (error) {
    const result = error as { stdout: string; stderr: string; code: number };
    return result;
  }
}
async function resultFiles(stdout: string) {
  const summary = JSON.parse(stdout) as {
    files: { legacy: string; neon: string; report: string; manifest: string };
    parityMatched: boolean;
    releaseAccepted: boolean;
  };
  for (const path of Object.values(summary.files))
    expect(path.startsWith(root + "/") || path.startsWith(root + "\\")).toBe(true);
  outputs.push(resolve(summary.files.manifest, ".."));
  return summary;
}
describe("operator snapshot preparation CLI", () => {
  beforeAll(async () => {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(root, { recursive: true });
    input = await mkdtemp(resolve(root, "fixture-input-"));
  });
  afterAll(async () => {
    for (const path of [...outputs, input])
      if (path?.startsWith(root + "/") || path?.startsWith(root + "\\"))
        await rm(path, { recursive: true, force: true });
  });
  it("creates both masked files and a report that the existing reconciliation CLI accepts", async () => {
    const snapshot = {
      tables: {
        tasks: [{ id: "raw-secret-id", title: "private@example.invalid" }],
        projects: [],
        profiles: [],
        accounts: [],
        permission_overrides: [],
        customer_success_profiles: [],
        success_touchpoints: [],
        deals: [],
        engagement_events: [],
        channel_identities: [],
        automation_playbooks: [],
        automation_runs: [],
      },
    };
    const left = resolve(input, "legacy raw.json");
    const right = resolve(input, "neon raw.json");
    await writeFile(left, JSON.stringify(snapshot));
    await writeFile(right, JSON.stringify(snapshot));
    const runResult = await run(["--legacy=" + left, "--neon=" + right]);
    expect(runResult.code).toBe(0);
    const summary = await resultFiles(runResult.stdout);
    expect(summary).toMatchObject({ parityMatched: true, releaseAccepted: false });
    for (const path of Object.values(summary.files)) {
      const text = await readFile(path, "utf8");
      expect(text).not.toContain("raw-secret-id");
      expect(text).not.toContain("private@example.invalid");
    }
    const report = await exec("bun", [
      "scripts/clientops/reconcile-legacy-domains.ts",
      "--legacy=" + summary.files.legacy,
      "--neon=" + summary.files.neon,
    ]);
    expect(JSON.parse(report.stdout).ready).toBe(true);
    const next = await run(["--legacy=" + left, "--neon=" + right]);
    const nextSummary = await resultFiles(next.stdout);
    expect(nextSummary.files.legacy).not.toBe(summary.files.legacy);
    expect(await readFile(nextSummary.files.legacy, "utf8")).not.toBe(
      await readFile(summary.files.legacy, "utf8"),
    );
  });
  it("writes an incomplete receipt with exit 2 without filling missing tables", async () => {
    const left = resolve(input, "partial-legacy.json");
    const right = resolve(input, "partial-neon.json");
    await writeFile(left, JSON.stringify({ tables: { tasks: [] } }));
    await writeFile(right, JSON.stringify({ tables: { tasks: [] } }));
    const result = await run(["--legacy=" + left, "--neon=" + right]);
    expect(result.code).toBe(2);
    const summary = await resultFiles(result.stdout);
    expect(summary.parityMatched).toBe(false);
    expect(JSON.parse(await readFile(summary.files.legacy, "utf8")).tables).not.toHaveProperty(
      "projects",
    );
    expect(JSON.parse(await readFile(summary.files.report, "utf8")).tables.projects.status).toBe(
      "missing_snapshot",
    );
  });
  it("fails without artifacts or secret/parser/path output on invalid JSON", async () => {
    const file = resolve(input, "secret-file-name.json");
    await writeFile(file, '{"private@example.invalid":');
    const other = resolve(input, "other-valid.json");
    await writeFile(other, '{"tables":{}}');
    const before = await readdir(root);
    const result = await run(["--legacy=" + file, "--neon=" + other]);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toContain("private@example.invalid");
    expect(result.stderr).not.toContain("secret-file-name");
    expect(await readdir(root)).toEqual(before);
  });
  it("denies a remote DSN before connecting and hides credentials", async () => {
    const file = resolve(input, "remote-config.json");
    const target = {
      connectionString:
        "postgres://user:DO_NOT_PRINT_PASSWORD@remote.invalid/clientops_snapshot_copy",
      isolationConfirmed: true,
      sourceRecord: "DO_NOT_PRINT_SOURCE",
    };
    await writeFile(file, JSON.stringify({ formatVersion: 1, legacy: target, neon: target }));
    const result = await run(["--config=" + file]);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toMatch(/DO_NOT_PRINT|remote.invalid|postgres:/);
  });
  it("refuses identical source files and duplicate/mixed CLI arguments", async () => {
    const file = resolve(input, "same.json");
    await writeFile(file, '{"tables":{}}');
    for (const args of [
      ["--legacy=" + file, "--neon=" + file],
      ["--legacy=" + file, "--legacy=" + file, "--neon=" + file],
      ["--config=" + file, "--legacy=" + file, "--neon=" + file],
    ])
      expect((await run(args)).code).toBe(2);
  });
});
