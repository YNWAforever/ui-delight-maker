import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Local template authoring only; never imports or activates a cloud workflow. */
export function syncAIWorkerContracts() {
  const common = readFileSync("n8n/contracts/clientops-output-contracts.js", "utf8").replaceAll(
    "\r\n",
    "\n",
  );
  for (const name of [
    "qualify-lead",
    "draft-reply",
    "draft-quote",
    "score-renewal-risk",
    "relationship-intelligence",
  ]) {
    const file = `n8n/workflows/clientops-${name}.json`;
    const template = JSON.parse(readFileSync(file, "utf8")) as {
      nodes: Array<{ name: string; parameters: { jsCode?: string } }>;
    };
    const resolver = template.nodes.find((node) => node.name === "Resolve Output");
    const code = resolver?.parameters.jsCode,
      marker = code?.indexOf("function transportLabel");
    if (!resolver || !code || marker === undefined || marker < 0)
      throw new Error(`Missing provenance resolver: ${name}`);
    resolver.parameters.jsCode = common + "\n" + code.slice(marker).replaceAll("\r\n", "\n");
    writeFileSync(file, JSON.stringify(template, null, 2) + "\n");
  }
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)
  syncAIWorkerContracts();
