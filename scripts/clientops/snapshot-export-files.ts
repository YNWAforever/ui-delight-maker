import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rmdir,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { reconcileLegacySnapshots } from "../../src/server/db/legacy-domain-parity";
import {
  assertLocalSnapshotTarget,
  exportIsolatedSnapshot,
  maskSnapshotPair,
  parseSnapshotJson,
  MAX_SNAPSHOT_BYTES,
  SNAPSHOT_TABLES,
  snapshotTargetIdentity,
} from "./snapshot-export";
const exec = promisify(execFile);
function blocked(): never {
  throw new Error("Snapshot preparation blocked");
}
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
async function readJson(path: string, max: number, lossless = false): Promise<unknown> {
  const info = await stat(path);
  if (!info.isFile() || info.size > max) blocked();
  const text = await readFile(path, "utf8");
  return lossless ? parseSnapshotJson(text) : JSON.parse(text);
}
async function outputRoot() {
  const root = resolve(".clientops-perf/snapshots");
  await exec("git", ["check-ignore", "--quiet", "--", root]);
  for (const path of [resolve(".clientops-perf"), root]) {
    await mkdir(path, { recursive: true, mode: 0o700 });
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink()) blocked();
  }
  return root;
}
export async function initializeSnapshotExport() {
  const root = await outputRoot();
  const path = resolve(root, "export-config.example.json");
  const target = { connectionString: "", isolationConfirmed: false, sourceRecord: "" };
  await writeFile(
    path,
    JSON.stringify({ formatVersion: 1, legacy: target, neon: target }, null, 2) + "\n",
    { flag: "wx", mode: 0o600 },
  );
  return { configPath: path, exported: false };
}
export type SnapshotInputs =
  | { config: string; legacy?: never; neon?: never }
  | { config?: never; legacy: string; neon: string };
export async function prepareSnapshotFiles(input: SnapshotInputs) {
  const root = await outputRoot();
  let legacy: unknown;
  let neon: unknown;
  const sourceRecordHashes: Record<string, string> = {};
  if (input.config) {
    const parsed = (await readJson(resolve(input.config), 64 * 1024)) as {
      formatVersion?: unknown;
      legacy?: unknown;
      neon?: unknown;
    };
    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.formatVersion !== 1 ||
      Object.keys(parsed).some((name) => !["formatVersion", "legacy", "neon"].includes(name))
    )
      blocked();
    assertLocalSnapshotTarget(parsed.legacy);
    assertLocalSnapshotTarget(parsed.neon);
    if (snapshotTargetIdentity(parsed.legacy) === snapshotTargetIdentity(parsed.neon)) blocked();
    // Both targets are validated before either connection is opened.
    sourceRecordHashes.legacy = hash(parsed.legacy.sourceRecord);
    sourceRecordHashes.neon = hash(parsed.neon.sourceRecord);
    legacy = await exportIsolatedSnapshot(parsed.legacy);
    neon = await exportIsolatedSnapshot(parsed.neon);
  } else {
    if (
      !input.legacy ||
      !input.neon ||
      (await realpath(input.legacy)) === (await realpath(input.neon))
    )
      blocked();
    legacy = await readJson(resolve(input.legacy), MAX_SNAPSHOT_BYTES, true);
    neon = await readJson(resolve(input.neon), MAX_SNAPSHOT_BYTES, true);
  }
  const key = randomBytes(32);
  let pair: ReturnType<typeof maskSnapshotPair>;
  try {
    pair = maskSnapshotPair(legacy, neon, key);
  } finally {
    key.fill(0);
  }
  const parity = reconcileLegacySnapshots(pair.legacy, pair.neon);
  const counts = (snapshot: typeof pair.legacy) =>
    Object.fromEntries(
      SNAPSHOT_TABLES.map((name) => [name, snapshot.tables[name]?.length ?? null]),
    );
  const legacyText = JSON.stringify(pair.legacy, null, 2) + "\n";
  const neonText = JSON.stringify(pair.neon, null, 2) + "\n";
  if ([legacyText, neonText].some((text) => Buffer.byteLength(text, "utf8") > MAX_SNAPSHOT_BYTES))
    blocked();
  const reportText =
    JSON.stringify(
      { formatVersion: 1, source: "local_pseudonymised_snapshot_pair", ...parity },
      null,
      2,
    ) + "\n";
  const manifestText =
    JSON.stringify(
      {
        formatVersion: 1,
        generatedAt: new Date().toISOString(),
        mode: input.config ? "operator_attested_local_copies" : "operator_local_json_files",
        masking: "pair_scoped_hmac_sha256",
        numericComparison: "exact_json_lexemes",
        keyPersisted: false,
        sourceRecordHashes,
        sourceProvenanceVerified: false,
        parityMatched: parity.ready,
        releaseAccepted: false,
        tableCounts: { legacy: counts(pair.legacy), neon: counts(pair.neon) },
        hashes: { legacy: hash(legacyText), neon: hash(neonText), report: hash(reportText) },
      },
      null,
      2,
    ) + "\n";
  const directory = await mkdtemp(resolve(root, "pair-"));
  const files = {
    legacy: resolve(directory, "legacy.masked.json"),
    neon: resolve(directory, "neon.masked.json"),
    report: resolve(directory, "reconciliation.json"),
    manifest: resolve(directory, "manifest.json"),
  };
  try {
    for (const [name, text] of [
      ["legacy", legacyText],
      ["neon", neonText],
      ["report", reportText],
      ["manifest", manifestText],
    ] as const) {
      const path = files[name];
      await writeFile(path, text, { flag: "wx", mode: 0o600 });
    }
    return {
      status: parity.ready ? "prepared" : "prepared_incomplete",
      parityMatched: parity.ready,
      releaseAccepted: false,
      files,
    };
  } catch {
    // Only the fixed files in this newly-created directory are eligible cleanup.
    for (const path of Object.values(files)) await unlink(path).catch(() => {});
    await rmdir(directory).catch(() => {});
    return blocked();
  }
}
