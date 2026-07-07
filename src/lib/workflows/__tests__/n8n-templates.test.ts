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
    continueOnFail?: boolean;
    parameters?: {
      path?: string;
      httpMethod?: string;
      responseMode?: string;
      jsCode?: string;
    };
  }>;
  connections: Record<
    string,
    Record<string, Array<Array<{ node?: string; type?: string; index?: number }>>>
  >;
  settings: Record<string, unknown>;
};

const cases = [
  {
    file: "clientops-qualify-lead.json",
    name: "clientops-qualify-lead",
    trigger: "lead.qualify_requested",
    writebackEndpoint: "/api/workflows/qualify-lead",
    subjectIdField: "lead_id",
    contextEndpoint: "/api/workflows/context/lead",
  },
  {
    file: "clientops-draft-reply.json",
    name: "clientops-draft-reply",
    trigger: "lead.reply_draft_requested",
    writebackEndpoint: "/api/workflows/draft-reply",
    subjectIdField: "lead_id",
    contextEndpoint: "/api/workflows/context/lead",
  },
  {
    file: "clientops-draft-quote.json",
    name: "clientops-draft-quote",
    trigger: "quote.draft_requested",
    writebackEndpoint: "/api/workflows/draft-quote",
    subjectIdField: "lead_id",
    contextEndpoint: "/api/workflows/context/lead",
  },
  {
    file: "clientops-score-renewal-risk.json",
    name: "clientops-score-renewal-risk",
    trigger: "engagement.score_renewal_risk_requested",
    writebackEndpoint: "/api/workflows/score-renewal-risk",
    subjectIdField: "engagement_id",
    contextEndpoint: "/api/workflows/context/engagement",
  },
  {
    file: "clientops-relationship-intelligence.json",
    name: "clientops-relationship-intelligence",
    trigger: "account.relationship_intelligence_requested",
    writebackEndpoint: "/api/workflows/relationship-intelligence",
    subjectIdField: "account_id",
    contextEndpoint: "/api/workflows/context/account",
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

    const nodeNames = new Set(json.nodes.map((node) => node.name).filter(Boolean));
    for (const [sourceNodeName, outputs] of Object.entries(json.connections)) {
      expect(nodeNames.has(sourceNodeName)).toBe(true);
      for (const connectionGroups of Object.values(outputs)) {
        for (const connectionGroup of connectionGroups) {
          for (const connection of connectionGroup) {
            expect(nodeNames.has(connection.node)).toBe(true);
          }
        }
      }
    }

    const codeNodes = json.nodes.filter((node) => node.type === "n8n-nodes-base.code");
    expect(codeNodes.length).toBeGreaterThan(0);
    for (const node of codeNodes) {
      const jsCode = node.parameters?.jsCode;
      expect(typeof jsCode).toBe("string");
      if (typeof jsCode !== "string") {
        throw new Error(`${node.name ?? "Code node"} is missing jsCode`);
      }
      expect(() => new Function(jsCode)).not.toThrow();
    }

    const openRouterNode = json.nodes.find((node) => node.name === "OpenRouter Request");
    expect(openRouterNode?.type).toBe("n8n-nodes-base.httpRequest");
    expect(openRouterNode?.continueOnFail).toBe(true);

    const resolveOutputCode = json.nodes.find((node) => node.name === "Resolve Output")?.parameters
      ?.jsCode;
    expect(resolveOutputCode).toContain(
      `${testCase.subjectIdField}: fallback.${testCase.subjectIdField}`,
    );
    expect(resolveOutputCode).toContain("agent_run_id: fallback.agent_run_id");
    expect(resolveOutputCode).not.toContain("...fallback, ...parsed");

    expect(raw).toContain(testCase.trigger);
    expect(raw).toContain(testCase.contextEndpoint);
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
