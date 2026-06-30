import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workflowDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../n8n/workflows");

type WorkflowTemplate = {
  name: string;
  nodes: Array<{
    name?: string;
    type?: string;
    parameters?: {
      path?: string;
      httpMethod?: string;
      responseMode?: string;
    };
  }>;
  connections: Record<string, unknown>;
  settings: Record<string, unknown>;
};

const cases = [
  {
    file: "clientops-qualify-lead.json",
    name: "clientops-qualify-lead",
    trigger: "lead.qualify_requested",
    writebackEndpoint: "/api/workflows/qualify-lead",
  },
  {
    file: "clientops-draft-reply.json",
    name: "clientops-draft-reply",
    trigger: "lead.reply_draft_requested",
    writebackEndpoint: "/api/workflows/draft-reply",
  },
  {
    file: "clientops-draft-quote.json",
    name: "clientops-draft-quote",
    trigger: "quote.draft_requested",
    writebackEndpoint: "/api/workflows/draft-quote",
  },
] as const;

describe("ClientOps n8n workflow templates", () => {
  it.each(cases)("$name is importable and follows the workflow contract", (testCase) => {
    const raw = readFileSync(resolve(workflowDir, testCase.file), "utf8");
    const json = JSON.parse(raw) as WorkflowTemplate;

    expect(json.name).toBe(testCase.name);
    expect(Array.isArray(json.nodes)).toBe(true);
    expect(json.connections).toBeDefined();
    expect(json.settings).toBeDefined();

    const webhookNode = json.nodes.find((node) => node.type === "n8n-nodes-base.webhook");
    expect(webhookNode).toBeDefined();
    expect(webhookNode?.parameters?.path).toBe(testCase.name);
    expect(webhookNode?.parameters?.httpMethod).toBe("POST");
    expect(webhookNode?.parameters?.responseMode).toBe("responseNode");

    expect(json.nodes.some((node) => node.type === "n8n-nodes-base.httpRequest")).toBe(true);
    expect(json.nodes.some((node) => node.type === "n8n-nodes-base.respondToWebhook")).toBe(true);

    expect(raw).toContain(testCase.trigger);
    expect(raw).toContain("/api/workflows/context/lead");
    expect(raw).toContain(testCase.writebackEndpoint);
    expect(raw).toContain("x-workflow-token");
    expect(raw).toContain("N8N_WORKFLOW_TOKEN");
    expect(raw).toContain("OPENROUTER_API_KEY");
    expect(raw).toContain("OPENROUTER_MODEL");
    expect(raw).toContain("https://openrouter.ai/api/v1/chat/completions");
    expect(raw).toContain("deterministic-fallback");
    expect(raw).not.toContain("workflow_token");
  });
});
