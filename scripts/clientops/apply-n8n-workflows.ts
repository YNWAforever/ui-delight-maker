import { readFile } from "node:fs/promises";
import { join } from "node:path";

type N8nWorkflow = {
  id?: string;
  name: string;
  nodes: unknown[];
  connections: Record<string, unknown>;
  settings?: Record<string, unknown>;
};

type N8nClient = { baseUrl: string; apiKey: string };

/**
 * Every workflow definition in n8n/workflows/, kept in step with the dispatch webhooks the app
 * actually calls (see N8N_*_WEBHOOK_URL in .env.example).
 *
 * This listed three of the five. An operator running the documented command got three success
 * lines and exit 0 while `clientops-score-renewal-risk` and
 * `clientops-relationship-intelligence` were never created — so the renewal-risk and
 * relationship-intelligence buttons pointed at webhooks that did not exist, with nothing in the
 * output to say so.
 */
const WORKFLOW_FILES = [
  "clientops-qualify-lead.json",
  "clientops-draft-reply.json",
  "clientops-draft-quote.json",
  "clientops-score-renewal-risk.json",
  "clientops-relationship-intelligence.json",
  "clientops-retention-sweep.json",
];

// A key alone identifies no environment: the same N8N_API_KEY shape reaches a local container,
// a staging instance or production. Requiring a target label here means a mistyped host cannot
// silently push full workflow definitions into the wrong instance.
const N8N_TARGETS = ["staging", "local"] as const;
type N8nTarget = (typeof N8N_TARGETS)[number];

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function readTarget(env: Record<string, string | undefined>): N8nTarget {
  const target = env.N8N_TARGET?.trim();
  if (!target) {
    throw new Error(
      "N8N_TARGET must be set to staging or local; refusing to modify an unlabelled n8n instance",
    );
  }
  if (!N8N_TARGETS.includes(target as N8nTarget)) {
    throw new Error(
      `N8N_TARGET=${target} is not allowed; this script only writes to staging or local instances`,
    );
  }
  return target as N8nTarget;
}

function apiHost(baseUrl: string) {
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("bad protocol");
    return url.host;
  } catch {
    throw new Error("N8N_API_BASE_URL must be an absolute http(s) URL");
  }
}

function parseMode(argv: readonly string[]) {
  const apply = argv.includes("--apply");
  const unknown = argv.filter((arg) => arg !== "--apply" && arg !== "--dry-run");
  if (unknown.length > 0) {
    throw new Error(`Unknown arguments: ${unknown.join(", ")}; only --apply is supported`);
  }
  if (apply && argv.includes("--dry-run")) throw new Error("Choose --apply or --dry-run");
  return apply ? "apply" : "dry-run";
}

async function n8n<T>(client: N8nClient, path: string, init: RequestInit = {}) {
  const response = await fetch(`${client.baseUrl}/api/v1${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-N8N-API-KEY": client.apiKey,
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`n8n ${init.method ?? "GET"} ${path} failed: ${response.status} ${body}`);
  }

  return (await response.json()) as T;
}

function isWorkflow(value: unknown): value is N8nWorkflow {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as N8nWorkflow).name === "string" &&
    Array.isArray((value as N8nWorkflow).nodes) &&
    !!(value as N8nWorkflow).connections &&
    typeof (value as N8nWorkflow).connections === "object"
  );
}

async function loadWorkflow(file: string) {
  const raw = await readFile(join(process.cwd(), "n8n/workflows", file), "utf8");
  const workflow = JSON.parse(raw) as unknown;
  if (!isWorkflow(workflow)) {
    throw new Error(`Invalid n8n workflow JSON: ${file}`);
  }
  return {
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: workflow.settings ?? { executionOrder: "v1" },
  };
}

function workflowItems(payload: unknown): N8nWorkflow[] {
  if (Array.isArray(payload)) return payload as N8nWorkflow[];
  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { data?: unknown }).data)
  ) {
    return (payload as { data: N8nWorkflow[] }).data;
  }
  return [];
}

async function main() {
  const mode = parseMode(process.argv.slice(2));
  const target = readTarget(process.env);
  const baseUrl = requiredEnv("N8N_API_BASE_URL").replace(/\/+$/, "");
  const host = apiHost(baseUrl);

  // Printed before the API key is read or any request is sent, so the resolved destination is
  // visible in the operator's log even when the command later fails.
  console.log(`n8n target: ${target}`);
  console.log(`n8n api host: ${host}`);
  console.log(
    `mode: ${mode}${mode === "dry-run" ? " (read-only; pass --apply to create/update)" : ""}`,
  );

  const client: N8nClient = { baseUrl, apiKey: requiredEnv("N8N_API_KEY") };
  const existingPayload = await n8n<unknown>(client, "/workflows?limit=250");
  const existing = new Map(
    workflowItems(existingPayload).map((workflow) => [workflow.name, workflow]),
  );

  const planned = await Promise.all(
    WORKFLOW_FILES.map(async (file) => {
      const workflow = await loadWorkflow(file);
      return { workflow, current: existing.get(workflow.name) };
    }),
  );

  if (mode === "dry-run") {
    for (const { workflow, current } of planned) {
      console.log(`${current?.id ? "would update" : "would create"} ${workflow.name}`);
    }
    console.log(
      `dry run: ${planned.filter(({ current }) => !current?.id).length} would be created, ` +
        `${planned.filter(({ current }) => current?.id).length} would be updated; nothing was written`,
    );
    return;
  }

  let created = 0;
  let updated = 0;
  for (const { workflow, current } of planned) {
    if (current?.id) {
      await n8n(client, `/workflows/${current.id}`, {
        method: "PUT",
        body: JSON.stringify(workflow),
      });
      console.log(`updated ${workflow.name}`);
      updated += 1;
    } else {
      await n8n(client, "/workflows", {
        method: "POST",
        body: JSON.stringify(workflow),
      });
      console.log(`created ${workflow.name}`);
      created += 1;
    }
  }
  console.log(`applied: ${created} created, ${updated} updated on ${host}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
