import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const protectedFiles = [
  "accounts.ts",
  "approvals.ts",
  "automation-playbooks.ts",
  "campaigns.ts",
  "client-contacts.ts",
  "client-import.ts",
  "clients.ts",
  "contacts.ts",
  "customer-success.ts",
  "deals.ts",
  "engagement-events.ts",
  "engagements.ts",
  "event-import.ts",
  "job-sheets.ts",
  "leads.ts",
  "products.ts",
  "projects.ts",
  "quotes.ts",
  "accounts.ts",
  "tasks.ts",
  "touchpoints.ts",
  "ai-note-tidy.ts",
] as const;

function serverFunctionBlocks(source: string) {
  return Array.from(
    source.matchAll(
      /export const ([A-Za-z0-9_]+)\s*=\s*createServerFn[\s\S]*?(?=export const [A-Za-z0-9_]+\s*=\s*createServerFn|$)/g,
    ),
  ).map((match) => ({ name: match[1], source: match[0] }));
}

describe("server-function authorization contract", () => {
  it("guards every protected handler with a named capability", () => {
    const unguarded: string[] = [];

    for (const file of protectedFiles) {
      const source = readFileSync(resolve(process.cwd(), "src/server-functions", file), "utf8");
      for (const handler of serverFunctionBlocks(source)) {
        if (!handler.source.includes("requireCapability(")) {
          unguarded.push(file + ":" + handler.name);
        }
      }
    }

    expect(unguarded).toEqual([]);
  });

  it("locks high-risk mutations to their exact capabilities", () => {
    const expectations = [
      ["approvals.ts", "decideApproval", 'requireCapability("approvals.decide"'],
      ["quotes.ts", "approveQuote", 'requireCapability("quotes.approve"'],
      ["quotes.ts", "rejectQuote", 'requireCapability("quotes.approve"'],
      ["quotes.ts", "issueQuoteVersion", 'requireCapability("quotes.issue"'],
      ["quotes.ts", "approveAndIssueQuote", 'requireCapability("quotes.issue"'],
      ["quotes.ts", "acceptQuoteAndCreateJobSheet", 'requireCapability("job_sheets.accept"'],
      ["job-sheets.ts", "acceptJobSheetForAccounting", 'requireCapability("job_sheets.accept"'],
      ["job-sheets.ts", "updateJobSheetPortions", 'requireCapability("job_sheets.update_billing"'],
      [
        "job-sheets.ts",
        "updatePortionXeroReference",
        'requireCapability("job_sheets.update_billing"',
      ],
      ["products.ts", "createProduct", 'requireCapability("products.manage"'],
      ["products.ts", "updateProduct", 'requireCapability("products.manage"'],
      ["products.ts", "deactivateProductFn", 'requireCapability("products.manage"'],
      [
        "automation-playbooks.ts",
        "createAutomationPlaybook",
        'requireCapability("automation.manage"',
      ],
      [
        "automation-playbooks.ts",
        "updateAutomationPlaybook",
        'requireCapability("automation.manage"',
      ],
      ["automation-playbooks.ts", "createAutomationRun", '"automation.manage"'],
      ["automation-playbooks.ts", "updateAutomationRun", 'requireCapability("automation.manage"'],
      ["leads.ts", "triggerLeadAgent", 'requireCapability("agents.run"'],
      ["leads.ts", "triggerLeadReplyDraft", 'requireCapability("agents.run"'],
      ["accounts.ts", "triggerRelationshipIntelligence", 'requireCapability("agents.run"'],
      ["engagements.ts", "triggerRiskScoreAgent", 'requireCapability("agents.run"'],
    ] as const;

    const failures: string[] = [];
    for (const [file, name, expected] of expectations) {
      const source = readFileSync(resolve(process.cwd(), "src/server-functions", file), "utf8");
      const handler = serverFunctionBlocks(source).find((entry) => entry.name === name);
      if (!handler?.source.includes(expected)) failures.push(file + ":" + name);
    }

    expect(failures).toEqual([]);
  });

  it("requires server-derived targets for representative mutations", () => {
    const expectations = [
      ["accounts.ts", "updateAccount", 'resourceType: "account"', "resourceId: data.id"],
      ["leads.ts", "moveLeadStage", 'resourceType: "lead"', "resourceId: data.id"],
      ["quotes.ts", "approveQuote", 'resourceType: "quote"', "resourceId: data.id"],
      [
        "job-sheets.ts",
        "acceptJobSheetForAccounting",
        'resourceType: "job_sheet"',
        "resourceId: data.id",
      ],
      ["products.ts", "updateProduct", 'requireCapability("products.manage"', ""],
      [
        "automation-playbooks.ts",
        "updateAutomationPlaybook",
        'resourceType: "automation_playbook"',
        "resourceId: data.id",
      ],
    ] as const;

    for (const [file, name, targetType, targetId] of expectations) {
      const source = readFileSync(resolve(process.cwd(), "src/server-functions", file), "utf8");
      const handler = serverFunctionBlocks(source).find((entry) => entry.name === name);
      expect(handler?.source).toContain(targetType);
      if (targetId) expect(handler?.source).toContain(targetId);
    }
  });
});
