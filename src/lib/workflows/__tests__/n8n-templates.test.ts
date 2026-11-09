import { readFileSync, readdirSync } from "node:fs";
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

/**
 * The n8n Code node mirrors the server-side workflow-token check. A plain `!==` exits at the
 * first differing byte, so a caller who can time the throw can recover the shared token one
 * byte at a time — the same leak fixed in `assert-workflow-token.server.ts`. Code nodes may
 * not `require('crypto')` unless the instance allowlists builtins, so the fix is an inline
 * fixed-work XOR compare: iterate over the longer token, pad the shorter side with 0, and
 * only compare lengths after the loop so the work does not depend on where the mismatch is.
 *
 * These are the five Code-node workflows; `clientops-retention-sweep.json` only *sends* the
 * token outbound and never compares one inbound, so it is intentionally not in `cases`.
 */
function tokenCodeNode(json: WorkflowTemplate) {
  return json.nodes.find(
    (node) =>
      node.type === "n8n-nodes-base.code" &&
      typeof node.parameters?.jsCode === "string" &&
      node.parameters.jsCode.includes("$env.N8N_WORKFLOW_TOKEN"),
  );
}

function executeValidateTrigger(file: string, token: string | undefined, headerToken?: string) {
  const json = JSON.parse(readFileSync(resolve(workflowDir, file), "utf8")) as WorkflowTemplate;
  const code = tokenCodeNode(json)?.parameters?.jsCode;
  if (!code) throw new Error(`${file} has no token-checking Code node`);
  const testCase = cases.find((candidate) => candidate.file === file);
  if (!testCase) throw new Error(`No contract case for ${file}`);

  const headers = headerToken === undefined ? {} : { "x-workflow-token": headerToken };
  const body = {
    trigger: testCase.trigger,
    [testCase.subjectIdField]: "synthetic-subject",
    agent_run_id: "synthetic-run",
  };
  return new Function("$input", "$", "$env", code)(
    { first: () => ({ json: { headers, body } }) },
    () => ({ first: () => ({ json: {} }) }),
    token === undefined ? {} : { N8N_WORKFLOW_TOKEN: token },
  ) as Array<{ json: { trigger: string } }>;
}

describe("n8n workflow token gate", () => {
  it("keeps the comparison helper inline without crypto or a bare secret comparison", () => {
    const files = readdirSync(workflowDir)
      .filter((name) => name.endsWith(".json"))
      .sort();
    const comparing = files.filter((file) => {
      const json = JSON.parse(readFileSync(resolve(workflowDir, file), "utf8")) as WorkflowTemplate;
      return tokenCodeNode(json) !== undefined;
    });

    // Guard on the guard: if the scan silently matches nothing, the assertions below are vacuous.
    expect(comparing).toEqual(cases.map((testCase) => testCase.file).sort());

    for (const file of comparing) {
      const raw = readFileSync(resolve(workflowDir, file), "utf8");
      expect(raw, `${file} still compares the secret with !==`).not.toMatch(
        /!==\s*\$env\.N8N_WORKFLOW_TOKEN/,
      );
      expect(raw, `${file} must not require() in a Code node`).not.toMatch(
        /\brequire\s*\(\s*['"](crypto|node:crypto)['"]\s*\)/,
      );
    }
  });

  it.each(cases)("$name hardens the inbound token comparison", (testCase) => {
    const json = JSON.parse(
      readFileSync(resolve(workflowDir, testCase.file), "utf8"),
    ) as WorkflowTemplate;
    const jsCode = tokenCodeNode(json)?.parameters?.jsCode ?? "";

    expect(jsCode).toContain("const tokenMatches = (actual, expected) => {");
    expect(jsCode).toContain("if (typeof actual !== 'string' || typeof expected !== 'string')");
    expect(jsCode).toContain("Math.max(actual.length, expected.length)");
    expect(jsCode).toMatch(/diff\s*\|=\s*\w+\s*\^\s*\w+/);
    expect(jsCode).toContain("return diff === 0 && actual.length === expected.length;");
    expect(jsCode).toContain("if (!tokenMatches(receivedToken, $env.N8N_WORKFLOW_TOKEN)) {");
    expect(jsCode).toContain("throw new Error('Invalid x-workflow-token');");

    const helper = /const tokenMatches = \(actual, expected\) => \{[\s\S]*?\n\};/.exec(jsCode)?.[0];
    expect(helper, "inline tokenMatches helper").toBeDefined();
    // Fixed work: no early exit inside the comparison loop.
    const loop = helper?.slice(helper.indexOf("for (let index"));
    expect(loop).toContain("diff |= actualCode ^ expectedCode;");
    expect(loop).not.toContain("break");
    expect(loop).not.toContain("return false");
  });

  it.each(cases)(
    "$name accepts the configured token and rejects near-miss/wrong-length tokens",
    (testCase) => {
      const token = "synthetic-workflow-token";

      expect(executeValidateTrigger(testCase.file, token, token)[0]?.json.trigger).toBe(
        testCase.trigger,
      );

      for (const nearMiss of [
        token.slice(0, -1),
        `${token}x`,
        "synthetic-workflow-toke",
        "synthetic-workflow-tokenx",
        "synthetic",
        "x".repeat(512),
        "wrong-token",
      ]) {
        expect(() => executeValidateTrigger(testCase.file, token, nearMiss)).toThrow(
          "Invalid x-workflow-token",
        );
      }

      // Missing header, unset env secret, and empty configured token all fail closed.
      expect(() => executeValidateTrigger(testCase.file, token)).toThrow(
        "Invalid x-workflow-token",
      );
      expect(() => executeValidateTrigger(testCase.file, undefined, token)).toThrow(
        "Invalid x-workflow-token",
      );
      expect(() => executeValidateTrigger(testCase.file, "", "")).toThrow(
        "Invalid x-workflow-token",
      );
    },
  );
});
