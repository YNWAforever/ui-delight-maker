import { Client } from "pg";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertLocalSnapshotTarget } from "./snapshot-export";
import {
  loadAgentReconciliation,
  withAgentReconciliationRead,
} from "../../src/server/read-models/agent-reconciliation";

/** Config path only; never accepts a connection string or a mutate option on the command line. */
export async function auditAgentReconciliation(configPath: string) {
  const target: unknown = JSON.parse(await readFile(resolve(configPath), "utf8"));
  assertLocalSnapshotTarget(target);
  const client = new Client({ connectionString: target.connectionString });
  try {
    await client.connect();
    const items = await withAgentReconciliationRead(client, () => loadAgentReconciliation(client));
    const artifact =
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          source: "operator_attested_local_snapshot",
          sourceRecordSha256: createHash("sha256").update(target.sourceRecord).digest("hex"),
          readOnly: true,
          ownerDisposition: "blocked",
          items,
        },
        null,
        2,
      ) + "\n";
    const root = resolve(".clientops-perf/ai-reconciliation");
    await mkdir(root, { recursive: true, mode: 0o700 });
    const output = resolve(root, new Date().toISOString().replaceAll(":", "-") + ".private.json");
    await writeFile(output, artifact, { flag: "wx", mode: 0o600 });
    return {
      output,
      rows: items.length,
      readOnly: true,
      sha256: createHash("sha256").update(artifact).digest("hex"),
    };
  } finally {
    await client.end();
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--config")
    throw new Error("Use --config <approved-local-target-file>");
  try {
    console.log(JSON.stringify(await auditAgentReconciliation(args[1])));
  } catch {
    console.error("Read-only reconciliation blocked; inspect approved local target and schema.");
    process.exitCode = 1;
  }
}
