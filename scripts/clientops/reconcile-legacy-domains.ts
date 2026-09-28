import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  reconcileLegacySnapshots,
  type LegacySnapshot,
} from "../../src/server/db/legacy-domain-parity";

const MAX_SNAPSHOT_BYTES = 100 * 1024 * 1024;
const args = new Map(
  process.argv.slice(2).map((arg) => {
    const equal = arg.indexOf("=");
    if (!arg.startsWith("--") || equal < 0)
      throw new Error("Use --legacy=, --neon= and optionally --out=");
    return [arg.slice(2, equal), arg.slice(equal + 1)];
  }),
);
for (const key of args.keys()) {
  if (!["legacy", "neon", "out"].includes(key)) throw new Error("Unknown argument: " + key);
}
async function readSnapshot(label: "legacy" | "neon"): Promise<LegacySnapshot> {
  const given = args.get(label);
  if (!given) throw new Error("Missing " + label + " snapshot; cross-database parity is blocked");
  const file = resolve(given);
  const metadata = await stat(file);
  if (!metadata.isFile() || metadata.size > MAX_SNAPSHOT_BYTES) {
    throw new Error(label + " snapshot must be a local JSON file under 100 MiB");
  }
  const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
  if (!parsed || typeof parsed !== "object" || !("tables" in parsed)) {
    throw new Error(label + " snapshot must contain a tables object");
  }
  const tables = (parsed as { tables: unknown }).tables;
  if (!tables || typeof tables !== "object" || Array.isArray(tables)) {
    throw new Error(label + " snapshot tables must be an object");
  }
  for (const [name, rows] of Object.entries(tables)) {
    if (
      !Array.isArray(rows) ||
      rows.some((row) => !row || typeof row !== "object" || typeof row.id !== "string")
    ) {
      throw new Error(label + " snapshot table " + name + " must contain rows with string IDs");
    }
  }
  return parsed as LegacySnapshot;
}

try {
  const legacy = await readSnapshot("legacy");
  const neon = await readSnapshot("neon");
  const result = reconcileLegacySnapshots(legacy, neon);
  const report =
    JSON.stringify(
      {
        formatVersion: 1,
        source: "local_snapshot_pair",
        ready: result.ready,
        tables: result.tables,
        foreignKeys: result.foreignKeys,
      },
      null,
      2,
    ) + "\n";
  if (args.has("out")) await writeFile(resolve(args.get("out")!), report, { flag: "wx" });
  else process.stdout.write(report);
  if (!result.ready) process.exitCode = 2;
} catch {
  // Snapshot paths, rows, parser excerpts and driver details stay out of output.
  process.stderr.write("Reconciliation blocked: local snapshots missing, invalid or incomplete\\n");
  process.exitCode = 2;
}
