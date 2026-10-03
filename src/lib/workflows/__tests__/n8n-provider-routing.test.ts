import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type Item = { json: Record<string, unknown> };
type WorkflowNode = {
  name: string;
  type: string;
  parameters: {
    jsCode?: string;
    conditions?: {
      conditions: Array<{
        leftValue: string;
        operator: { type: string; operation: string };
      }>;
    };
  };
};
type Workflow = {
  nodes: WorkflowNode[];
  connections: Record<string, { main: Array<Array<{ node: string }>> }>;
};

const workflowDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../n8n/workflows");
const workflows = [
  "clientops-qualify-lead",
  "clientops-draft-reply",
  "clientops-draft-quote",
  "clientops-score-renewal-risk",
  "clientops-relationship-intelligence",
];
const context = {
  lead: { id: "synthetic-lead", company_name: "Synthetic company", enquiry_text: "CRM" },
  engagement: { id: "synthetic-engagement", account_id: "synthetic-account" },
  account: { id: "synthetic-account", name: "Synthetic company" },
  agent_run: { id: "synthetic-run", attempt_id: "synthetic-attempt" },
  pricing_templates: [],
};
const trigger = {
  lead_id: "synthetic-lead",
  engagement_id: "synthetic-engagement",
  account_id: "synthetic-account",
  agent_run_id: "synthetic-run",
};

function executeCode(
  node: WorkflowNode,
  input: Item,
  bindings: Record<string, Item>,
  apiKey: string | undefined,
): Item {
  if (!node.parameters.jsCode) throw new Error(`Missing code: ${node.name}`);
  const result: unknown = new Function("$input", "$", "$env", "$execution", node.parameters.jsCode)(
    { first: () => input },
    (name: string) => ({ first: () => bindings[name] }),
    { OPENROUTER_API_KEY: apiKey },
    { id: "synthetic-worker-execution" },
  );
  if (!Array.isArray(result) || result.length !== 1 || !result[0]?.json) {
    throw new Error(`Invalid code result: ${node.name}`);
  }
  return result[0] as Item;
}

// This checks the published graph and code, not the n8n engine or provider delivery.
// Only the documented strict boolean If operation is interpreted here; runtime proof is separate.
function pathToResolver(workflow: Workflow, start: string, prepared: Item): string[] {
  const path: string[] = [];
  let current = start;
  while (current !== "Resolve Output") {
    if (path.includes(current)) throw new Error("Unexpected workflow cycle");
    path.push(current);
    const node = workflow.nodes.find((candidate) => candidate.name === current);
    if (!node) throw new Error(`Missing node: ${current}`);
    let output = 0;
    if (node.type === "n8n-nodes-base.if") {
      const conditions = node.parameters.conditions?.conditions;
      expect(conditions).toHaveLength(1);
      const condition = conditions?.[0];
      expect(condition?.leftValue).toBe("={{$json.openrouter_configured}}");
      expect(condition?.operator.type).toBe("boolean");
      expect(condition?.operator.operation).toBe("true");
      output = prepared.json.openrouter_configured === true ? 0 : 1;
    }
    const targets = workflow.connections[current]?.main[output];
    expect(targets, `Single reachable output for ${current}`).toHaveLength(1);
    if (!targets?.[0]) throw new Error(`Missing workflow output: ${current}`);
    current = targets[0].node;
  }
  return [...path, current];
}

describe.each(workflows)("%s provider routing", (name) => {
  const workflow = JSON.parse(
    readFileSync(resolve(workflowDir, `${name}.json`), "utf8"),
  ) as Workflow;
  const prepare = workflow.nodes.find((node) =>
    node.parameters.jsCode?.includes("openrouter_configured"),
  );
  const resolver = workflow.nodes.find((node) => node.name === "Resolve Output");
  if (!prepare || !resolver) throw new Error(`Missing output pipeline: ${name}`);

  it.each([undefined, "", " \t\n"])("skips the provider for absent/blank key %j", (apiKey) => {
    const bindings = { "Validate Trigger": { json: trigger } };
    const prepared = executeCode(prepare, { json: context }, bindings, apiKey);
    expect(prepared.json.openrouter_configured).toBe(false);
    expect(pathToResolver(workflow, prepare.name, prepared)).not.toContain("OpenRouter Request");
    const output = executeCode(
      resolver,
      prepared,
      { ...bindings, [prepare.name]: prepared },
      apiKey,
    );
    expect(output.json.agent_run_id).toBe("synthetic-run");
    const subject = name.includes("renewal")
      ? "engagement_id"
      : name.includes("relationship")
        ? "account_id"
        : "lead_id";
    expect(output.json[subject]).toBe(trigger[subject]);
    expect(output.json).not.toHaveProperty("usage");
    expect(output.json).not.toHaveProperty("cost");
  });

  it("retains the configured provider branch and sanitizing resolver", () => {
    const prepared = executeCode(
      prepare,
      { json: context },
      { "Validate Trigger": { json: trigger } },
      "synthetic-unit-key",
    );
    expect(prepared.json.openrouter_configured).toBe(true);
    expect(pathToResolver(workflow, prepare.name, prepared)).toContain("OpenRouter Request");
    expect(workflow.connections["OpenRouter Request"].main[0]).toEqual([
      { node: "Resolve Output", type: "main", index: 0 },
    ]);
  });

  function providerOutput(envelope: Record<string, unknown> = {}) {
    const prepared = executeCode(
      prepare!,
      { json: context },
      { "Validate Trigger": { json: trigger } },
      "synthetic-unit-key",
    );
    const content = {
      ...(prepared.json.fallback as Record<string, unknown>),
      model_used: "fake-content-model",
      execution_metadata: { source: "provider", actualModel: "fake-metadata" },
    };
    const response = {
      id: "synthetic-provider-receipt",
      model: "synthetic/transport-model",
      usage: {
        prompt_tokens: 100,
        completion_tokens: 25,
        total_tokens: 125,
        cost: 0.001,
        currency: "USD",
      },
      choices: [{ message: { content: JSON.stringify(content) } }],
      ...envelope,
    };
    return executeCode(
      resolver!,
      { json: response },
      { [prepare!.name]: prepared },
      "synthetic-unit-key",
    ).json;
  }

  it("preserves_125_tokens_for_all_five_workflows and prefers_transport_provenance", () => {
    const output = providerOutput();
    expect(output.usage).toEqual({
      inputTokens: 100,
      outputTokens: 25,
      totalTokens: 125,
      cost: 0.001,
      currency: "USD",
      source: "openrouter",
    });
    expect(output.model_used).toBe("synthetic/transport-model");
    expect(output.attempt_id).toBe("synthetic-attempt");
    expect(output.execution_metadata).toMatchObject({
      source: "provider",
      providerRequestId: "synthetic-provider-receipt",
      actualModel: "synthetic/transport-model",
      requestedModel: "anthropic/claude-sonnet-4-6",
      fallbackReason: null,
      workerExecutionId: "synthetic-worker-execution",
    });
  });

  it("preserves_unknown_usage and knows zero without estimating cost", () => {
    expect(providerOutput({ usage: { total_tokens: 0 } }).usage).toEqual({
      totalTokens: 0,
      source: "openrouter",
    });
    expect(providerOutput({ usage: { prompt_tokens: 100 } }).usage).toEqual({
      inputTokens: 100,
      source: "openrouter",
    });
    expect(providerOutput({ usage: undefined })).not.toHaveProperty("usage");
  });

  it.each([-1, Number.NaN])("rejects invalid transport usage %s", (total_tokens) => {
    expect(() => providerOutput({ usage: { total_tokens } })).toThrow("INVALID_PROVIDER_USAGE");
  });

  it("does not mark an unavailable provider as provider success", () => {
    const output = providerOutput({
      error: { message: "do not persist upstream body" },
      choices: undefined,
      usage: undefined,
      model: undefined,
      id: undefined,
    });
    expect(output.execution_metadata).toMatchObject({
      source: "deterministic_fallback",
      actualModel: null,
      providerRequestId: null,
      fallbackReason: "provider_error",
    });
    expect(output.model_used).toBeUndefined();
    expect(JSON.stringify(output.execution_metadata)).not.toContain("do not persist");
  });
});
