import { initializeSnapshotExport, prepareSnapshotFiles } from "./snapshot-export-files";

try {
  const argv = process.argv.slice(2);
  if (argv.length === 1 && argv[0] === "--init") {
    process.stdout.write(JSON.stringify(await initializeSnapshotExport(), null, 2) + "\n");
  } else if (argv.length === 1 && argv[0] === "--help") {
    process.stdout.write(
      "bun scripts/clientops/export-legacy-snapshots.ts --init\n" +
        "bun scripts/clientops/export-legacy-snapshots.ts --config=<local-config.json>\n" +
        "bun scripts/clientops/export-legacy-snapshots.ts --legacy=<local-json> --neon=<different-local-json>\n" +
        "Outputs: ignored .clientops-perf/snapshots/pair-*/; exit 2 means blocked/incomplete. Never production.\n",
    );
  } else {
    const args = new Map<string, string>();
    for (const arg of argv) {
      const equal = arg.indexOf("=");
      const name = arg.slice(2, equal);
      const value = arg.slice(equal + 1);
      if (
        !arg.startsWith("--") ||
        equal < 3 ||
        !["config", "legacy", "neon"].includes(name) ||
        !value ||
        args.has(name)
      )
        throw new Error("Invalid arguments");
      args.set(name, value);
    }
    const config = args.get("config");
    const legacy = args.get("legacy");
    const neon = args.get("neon");
    if (config ? args.size !== 1 : args.size !== 2 || !legacy || !neon)
      throw new Error("Invalid mode");
    const summary = await prepareSnapshotFiles(
      config ? { config } : { legacy: legacy!, neon: neon! },
    );
    process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
    if (!summary.parityMatched) process.exitCode = 2;
  }
} catch {
  // No input paths, connection strings, payloads or parser/driver details.
  process.stderr.write(
    "Snapshot preparation blocked: check local copies/config/input; no release acceptance.\n",
  );
  process.exitCode = 2;
}
