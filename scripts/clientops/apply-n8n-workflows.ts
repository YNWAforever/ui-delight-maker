import { readFile } from "node:fs/promises";
import { join } from "node:path";

type N8nWorkflow = {
  id?: string;
  name: string;
  nodes: unknown[];
  connections: Record<string, unknown>;
  settings?: Record<string, unknown>;
};

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

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

const baseUrl = requiredEnv("N8N_API_BASE_URL").replace(/\/+$/, "");
const apiKey = requiredEnv("N8N_API_KEY");

async function n8n<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${baseUrl}/api/v1${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-N8N-API-KEY": apiKey,
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
  const existingPayload = await n8n<unknown>("/workflows?limit=250");
  const existing = new Map(
    workflowItems(existingPayload).map((workflow) => [workflow.name, workflow]),
  );

  for (const file of WORKFLOW_FILES) {
    const workflow = await loadWorkflow(file);
    const current = existing.get(workflow.name);

    if (current?.id) {
      await n8n(`/workflows/${current.id}`, {
        method: "PUT",
        body: JSON.stringify(workflow),
      });
      console.log(`updated ${workflow.name}`);
    } else {
      await n8n("/workflows", {
        method: "POST",
        body: JSON.stringify(workflow),
      });
      console.log(`created ${workflow.name}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
