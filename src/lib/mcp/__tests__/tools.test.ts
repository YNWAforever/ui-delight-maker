import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AdminError } from "@/lib/admin/errors";
import type { PermissionOverride } from "@/lib/admin/types";
import type { AppSession } from "@/lib/auth/neon-auth.server";
import { MCP_TOKEN_SCOPE_LABELS, mcpTokenScopeLabel } from "@/lib/mcp/types";
import {
  executeMcpTool,
  mcpToolScopeAllows,
  mcpToolDefinitions,
  MCP_TOOLS,
  MCP_TOOL_ERROR_MESSAGES,
  type McpTool,
  type McpToolContext,
  type McpToolResult,
} from "../tools.server";
import type { RequestAuthorization } from "@/server/auth/authorization.server";

const mocks = vi.hoisted(() => ({
  requireNeonAuthSession: vi.fn(),
  query: vi.fn(),
  listAccountsPage: vi.fn(),
  getAccount: vi.fn(),
  listLeadsPage: vi.fn(),
  getLeadWithActivity: vi.fn(),
  listJobSheetsPage: vi.fn(),
  getJobSheet: vi.fn(),
  getQuote: vi.fn(),
  listTaskQueuePage: vi.fn(),
  searchWorkspace: vi.fn(),
  proposeAgentActionCommand: vi.fn(),
  listAgentActionProposalsForProfile: vi.fn(),
}));

vi.mock("@/lib/auth/neon-auth.server", () => ({
  requireNeonAuthSession: mocks.requireNeonAuthSession,
}));

vi.mock("@/server/db/neon.server", () => ({ query: mocks.query }));

vi.mock("@/server/commands/agent-action-proposal.server", () => ({
  proposeAgentActionCommand: mocks.proposeAgentActionCommand,
}));

vi.mock("@/server/repositories/agent-action-proposals", () => ({
  listAgentActionProposalsForProfile: mocks.listAgentActionProposalsForProfile,
}));

vi.mock("@/server/repositories/accounts", () => ({
  listAccountsPage: mocks.listAccountsPage,
  getAccount: mocks.getAccount,
}));
vi.mock("@/server/repositories/leads", () => ({
  listLeadsPage: mocks.listLeadsPage,
  getLeadWithActivity: mocks.getLeadWithActivity,
}));
vi.mock("@/server/repositories/job-sheets", () => ({
  listJobSheetsPage: mocks.listJobSheetsPage,
  getJobSheet: mocks.getJobSheet,
}));
vi.mock("@/server/repositories/quotes", () => ({ getQuote: mocks.getQuote }));
vi.mock("@/server/repositories/tasks", () => ({
  listTaskQueuePage: mocks.listTaskQueuePage,
}));
vi.mock("@/server/repositories/workspace-search", () => ({
  searchWorkspace: mocks.searchWorkspace,
}));

const QUOTE_ID = "9f461e2c-5f3a-4d3f-9c2b-7a8e6d5c4b3a";
const APPROVAL_ID = "c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f";

const EXPECTED_TOOL_NAMES = [
  "whoami",
  "search",
  "list_accounts",
  "get_account",
  "list_leads",
  "get_lead",
  "list_job_sheets",
  "get_job_sheet",
  "list_tasks",
  "get_quote",
  "propose_manual_message_sent",
  "list_my_proposals",
];

function testProfile(overrides: Partial<AppSession["profile"]> = {}): AppSession["profile"] {
  return {
    id: "profile-1",
    email: "maker@example.com",
    name: "Maker One",
    role: "sales",
    status: "active",
    avatar_url: null,
    job_title: null,
    phone: null,
    locale: "en",
    timezone: "Asia/Hong_Kong",
    primary_department_id: "department-1",
    manager_profile_id: null,
    last_active_at: null,
    session_invalid_before: null,
    suspended_at: null,
    suspended_by: null,
    suspension_reason: null,
    deactivated_at: null,
    deactivated_by: null,
    deactivation_reason: null,
    availability_status: "available",
    leave_starts_at: null,
    leave_ends_at: null,
    created_at: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

function testContext(
  options: {
    profile?: Partial<AppSession["profile"]>;
    overrides?: PermissionOverride[];
    directReportIds?: string[];
  } = {},
): McpToolContext {
  const profile = testProfile(options.profile);
  const session: AppSession = {
    user: { id: "auth-user-1", email: profile.email ?? undefined, emailVerified: true },
    session: { id: "session-1", createdAt: "2026-11-01T00:00:00.000Z" },
    profile,
  };
  const authorization: RequestAuthorization = {
    session,
    actor: {
      profileId: profile.id,
      role: profile.role,
      status: profile.status,
      departmentId: profile.primary_department_id,
      managedDepartmentIds: [],
      managedTeamIds: [],
      directReportIds: options.directReportIds ?? [],
    },
    overrides: options.overrides ?? [],
    now: new Date("2026-11-12T00:00:00.000Z"),
  };
  return {
    authorization,
    session,
    tokenId: "token-1",
    tokenName: "Claude Code",
    tokenPrefix: "fmcp_aaaaaaaa",
    scopes: ["read"],
  };
}

function toolNamed(name: string): McpTool {
  const tool = MCP_TOOLS.find((entry) => entry.definition.name === name);
  if (!tool) throw new Error(`Missing tool ${name}`);
  return tool;
}

/** A token that can read and propose, i.e. the normal write-scoped token. */
function writeContext(): McpToolContext {
  return { ...testContext(), scopes: ["read", "write"] as const };
}

async function run(
  name: string,
  args: Record<string, unknown>,
  context: McpToolContext = testContext(),
): Promise<{ result: McpToolResult; errorCode: string | null }> {
  return executeMcpTool(toolNamed(name), context, args);
}

function textPayload(result: McpToolResult): unknown {
  return JSON.parse(result.content[0].text);
}

/**
 * Dummy write-required tool used only by the generic scope-gating tests.
 *
 * It is intentionally not in `MCP_TOOLS`: the real write-scoped tool is
 * `propose_manual_message_sent`, and this fixture keeps the gating contract testable without
 * coupling it to a specific proposal schema.
 */
const writeRequiredTool: McpTool = {
  definition: {
    name: "propose_dummy",
    title: "Propose dummy action",
    description: "Write-scope placeholder used only by scope-gating tests.",
  },
  inputSchema: z.strictObject({}),
  requiredScope: "write",
  async handler() {
    return { status: "pending_approval" };
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockResolvedValue([]);
  mocks.searchWorkspace.mockResolvedValue([]);
  mocks.listAccountsPage.mockResolvedValue({ items: [], total: 0, page: 1, limit: 10 });
  mocks.listLeadsPage.mockResolvedValue({ items: [], total: 0, page: 1, limit: 10 });
  mocks.listJobSheetsPage.mockResolvedValue({ items: [], total: 0, page: 1, limit: 10 });
  mocks.listTaskQueuePage.mockResolvedValue({ items: [], nextCursor: null, total: 0 });
  mocks.getAccount.mockResolvedValue({ id: "account-1", name: "Acme" });
  mocks.getLeadWithActivity.mockResolvedValue({ lead: { id: "lead-1" }, activity: [] });
  mocks.getJobSheet.mockResolvedValue({ jobSheet: { id: "job-sheet-1" }, portions: [] });
  mocks.getQuote.mockResolvedValue({ id: QUOTE_ID, number: "Q-2026-001" });
  mocks.proposeAgentActionCommand.mockResolvedValue({
    status: "pending_approval",
    approvalId: "approval-proposal-1",
    targetApprovalId: APPROVAL_ID,
    requiresApproval: true,
    message: "Proposal recorded. It is waiting for a person with approval authority.",
  });
  mocks.listAgentActionProposalsForProfile.mockResolvedValue([]);
});

describe("MCP token scope contracts", () => {
  it("labels the two mintable presets for the settings UI", () => {
    expect(MCP_TOKEN_SCOPE_LABELS).toEqual({
      read: "Read-only",
      write: "Read + propose writes",
    });
    expect(mcpTokenScopeLabel(["read"])).toBe("Read-only");
    expect(mcpTokenScopeLabel(["read", "write"])).toBe("Read + propose writes");
    // Defensive: a stored write-only row can never be minted, but the label must not mislead.
    expect(mcpTokenScopeLabel(["write"])).toBe("Read + propose writes");
  });
});

describe("MCP tool registry", () => {
  it("exposes the ten read tools plus the governed proposal and personal list tools", () => {
    expect(MCP_TOOLS.map((tool) => tool.definition.name)).toEqual(EXPECTED_TOOL_NAMES);

    const writeTools = MCP_TOOLS.filter((tool) => tool.requiredScope === "write");
    expect(writeTools.map((tool) => tool.definition.name)).toEqual(["propose_manual_message_sent"]);
    expect(MCP_TOOLS.length).toBe(12);

    for (const tool of MCP_TOOLS) {
      expect(tool.definition.name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(tool.definition.title.length).toBeGreaterThan(0);
      if (tool.requiredScope === "write") {
        expect(tool.definition.description).not.toMatch(/read-only/i);
        expect(tool.definition.description).toMatch(/write scope|human approver/i);
      } else {
        expect(tool.definition.description).toMatch(/read-only/i);
      }
    }
  });

  it("generates object JSON Schemas from the same zod schemas handlers use", () => {
    const definitions = mcpToolDefinitions();

    expect(definitions.map((definition) => definition.name)).toEqual(EXPECTED_TOOL_NAMES);
    for (const definition of definitions) {
      expect(definition.inputSchema).toMatchObject({ type: "object" });
      expect(definition.inputSchema).not.toHaveProperty("outputSchema");
    }
    const search = definitions.find((definition) => definition.name === "search");
    expect(search?.inputSchema).toHaveProperty("properties.query");
  });

  it("rejects unknown arguments and out-of-range values for every tool", () => {
    for (const tool of MCP_TOOLS) {
      expect(tool.inputSchema.safeParse({ unexpected_argument: true }).success).toBe(false);
    }

    const search = toolNamed("search").inputSchema;
    expect(search.safeParse({}).success).toBe(false);
    expect(search.safeParse({ query: "ab" }).success).toBe(false);
    expect(search.safeParse({ query: "acme" }).success).toBe(true);
    expect(search.parse({ query: "acme" })).toEqual({ query: "acme", limit: 20 });
    expect(search.safeParse({ query: "a".repeat(201) }).success).toBe(false);
    expect(search.safeParse({ query: "acme", limit: 0 }).success).toBe(false);
    expect(search.safeParse({ query: "acme", limit: 21 }).success).toBe(false);

    const getQuote = toolNamed("get_quote").inputSchema;
    expect(getQuote.safeParse({ id: "not-a-uuid" }).success).toBe(false);
    expect(getQuote.safeParse({ id: QUOTE_ID }).success).toBe(true);

    const listAccounts = toolNamed("list_accounts").inputSchema;
    expect(listAccounts.safeParse({}).success).toBe(true);
    expect(listAccounts.safeParse({ limit: 101 }).success).toBe(false);
  });

  it("refuses every read tool when the token lacks the read scope", async () => {
    const context: McpToolContext = { ...testContext(), scopes: ["write"] as const };
    const readTools = MCP_TOOLS.filter((tool) => tool.requiredScope !== "write");

    for (const tool of readTools) {
      const { result, errorCode } = await executeMcpTool(tool, context, {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/do not have permission/i);
      expect(errorCode).toBe("forbidden");
    }

    // The write tool is the only one a write-only credential could still run.
    const proposal = toolNamed("propose_manual_message_sent");
    expect(mcpToolScopeAllows(proposal, ["write"])).toBe(true);
    expect(mcpToolScopeAllows(toolNamed("list_my_proposals"), ["write"])).toBe(false);
  });

  it("allows read tools for a token that also carries the write scope", async () => {
    const context: McpToolContext = { ...testContext(), scopes: ["read", "write"] as const };

    const { result, errorCode } = await run("whoami", {}, context);

    expect(errorCode).toBeNull();
    expect(result.isError).toBeFalsy();
    expect(textPayload(result)).toMatchObject({ profile: { id: "profile-1" } });
  });

  it("refuses a write-required tool for a read-only token with the safe error", async () => {
    const { result, errorCode } = await executeMcpTool(writeRequiredTool, testContext(), {});

    expect(errorCode).toBe("forbidden");
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(MCP_TOOL_ERROR_MESSAGES.forbidden);
  });

  it("runs a write-required tool for a token with the write scope", async () => {
    const context: McpToolContext = { ...testContext(), scopes: ["read", "write"] as const };

    const { result, errorCode } = await executeMcpTool(writeRequiredTool, context, {});

    expect(errorCode).toBeNull();
    expect(textPayload(result)).toEqual({ status: "pending_approval" });
  });

  it("treats an unspecified requiredScope as the read scope", () => {
    expect(mcpToolScopeAllows(toolNamed("whoami"), ["read"])).toBe(true);
    expect(mcpToolScopeAllows(toolNamed("whoami"), ["write"])).toBe(false);
    expect(mcpToolScopeAllows(writeRequiredTool, ["read"])).toBe(false);
    expect(mcpToolScopeAllows(writeRequiredTool, ["read", "write"])).toBe(true);
  });

  it("only imports read functions from the repositories (writes stay in the supervised command)", () => {
    const source = readFileSync(new URL("../tools.server.ts", import.meta.url), "utf8");
    const importBlocks = [
      ...source.matchAll(/import \{([^}]+)\} from "@\/server\/repositories\/[^"]+"/g),
    ];
    const importedNames = importBlocks
      .flatMap((match) => match[1].split(","))
      .map((name) => name.trim())
      .filter(Boolean);

    expect(importedNames.length).toBeGreaterThan(0);
    for (const name of importedNames) {
      expect(name).toMatch(/^(get|list|search)/);
    }
    expect(source).toContain('from "@/server/commands/agent-action-proposal.server"');
    for (const tool of MCP_TOOLS) {
      expect(tool.definition.name).not.toMatch(
        /(create|update|delete|remove|revoke|approve|reject|send|convert|move|accept)_/,
      );
    }
  });
});

describe("whoami", () => {
  it("projects the profile, capabilities and token metadata without secrets", async () => {
    const context = testContext({ profile: { role: "accounting" } });
    const { result, errorCode } = await run("whoami", {}, context);
    const data = textPayload(result) as {
      profile: Record<string, unknown>;
      capabilities: string[];
      token: Record<string, unknown>;
    };

    expect(errorCode).toBeNull();
    expect(result.isError).toBeFalsy();
    expect(data.profile).toMatchObject({ id: "profile-1", name: "Maker One", role: "accounting" });
    expect(data.capabilities).toContain("accounts.view");
    expect(data.capabilities).toContain("job_sheets.accept");
    expect(data.token).toEqual({
      id: "token-1",
      name: "Claude Code",
      prefix: "fmcp_aaaaaaaa",
      scopes: ["read"],
    });
    expect(JSON.stringify(data)).not.toMatch(/token_hash|tokenHash|fmcp_aaaaaaaaaaaa/);
  });
});

describe("search", () => {
  it("delegates to the visibility-aware workspace search with the caller context", async () => {
    const context = testContext();
    mocks.searchWorkspace.mockResolvedValue([
      { id: "account-1", type: "Company", title: "Acme", subtitle: "", href: "/accounts/1" },
    ]);

    const { result, errorCode } = await run("search", { query: "acme", limit: 5 }, context);

    expect(errorCode).toBeNull();
    expect(mocks.searchWorkspace).toHaveBeenCalledWith("acme", 5, context.authorization);
    expect(textPayload(result)).toHaveLength(1);
  });

  it("returns a safe forbidden result when an override denies every search capability", async () => {
    const overrides: PermissionOverride[] = [
      "accounts.view",
      "contacts.view",
      "leads.view",
      "quotes.view",
      "tasks.view",
    ].map((capability) => ({
      profileId: "profile-1",
      capability: capability as PermissionOverride["capability"],
      effect: "deny",
    }));
    const context = testContext({ overrides });

    const { result, errorCode } = await run("search", { query: "acme" }, context);

    expect(errorCode).toBe("forbidden");
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(MCP_TOOL_ERROR_MESSAGES.forbidden);
    expect(mocks.searchWorkspace).not.toHaveBeenCalled();
  });
});

describe("list tools reuse the BFF read paths", () => {
  it("calls the same account list function with bounded pagination", async () => {
    await run("list_accounts", { query: "acme" });

    expect(mocks.listAccountsPage).toHaveBeenCalledWith({
      query: "acme",
      page: 1,
      limit: 10,
    });
  });

  it("passes the authorization context to the row-scoped job-sheet and task lists", async () => {
    const context = testContext();

    await run("list_job_sheets", { status: "accepted", limit: 20 }, context);
    await run("list_tasks", { status: "open" }, context);

    expect(mocks.listJobSheetsPage).toHaveBeenCalledWith(
      { status: "accepted", page: 1, limit: 20 },
      context.authorization,
    );
    expect(mocks.listTaskQueuePage).toHaveBeenCalledWith(
      { status: "open", limit: 10 },
      context.authorization,
    );
  });

  it("calls the lead list function with its filters", async () => {
    await run("list_leads", { status: "new", source: "website" });

    expect(mocks.listLeadsPage).toHaveBeenCalledWith({
      status: "new",
      source: "website",
      page: 1,
      limit: 10,
    });
  });

  it("denies a list call when a manager override removes its capability", async () => {
    const context = testContext({
      overrides: [{ profileId: "profile-1", capability: "accounts.view", effect: "deny" }],
    });

    const { errorCode, result } = await run("list_accounts", {}, context);

    expect(errorCode).toBe("forbidden");
    expect(result.content[0].text).toBe(MCP_TOOL_ERROR_MESSAGES.forbidden);
    expect(mocks.listAccountsPage).not.toHaveBeenCalled();
  });
});

describe("row-scoped detail tools", () => {
  it("reads a quote after the targeted capability check passes", async () => {
    const { result, errorCode } = await run(
      "get_quote",
      { id: QUOTE_ID },
      testContext({ profile: { role: "super_admin" } }),
    );

    expect(errorCode).toBeNull();
    expect(mocks.getQuote).toHaveBeenCalledWith(QUOTE_ID);
    expect(textPayload(result)).toMatchObject({ id: QUOTE_ID, number: "Q-2026-001" });
  });

  it("denies a manager reading a quote owned by someone outside their scope", async () => {
    mocks.query.mockResolvedValue([{ id: QUOTE_ID, owner_profile_id: "profile-unrelated" }]);
    const context = testContext({ profile: { role: "manager" }, directReportIds: [] });

    const { result, errorCode } = await run("get_quote", { id: QUOTE_ID }, context);

    expect(errorCode).toBe("forbidden");
    expect(result.content[0].text).toBe(MCP_TOOL_ERROR_MESSAGES.forbidden);
    expect(mocks.getQuote).not.toHaveBeenCalled();
  });

  it("allows a manager reading a quote owned by a direct report", async () => {
    mocks.query.mockResolvedValue([{ id: QUOTE_ID, owner_profile_id: "profile-report" }]);
    const context = testContext({
      profile: { role: "manager" },
      directReportIds: ["profile-report"],
    });

    const { errorCode } = await run("get_quote", { id: QUOTE_ID }, context);

    expect(errorCode).toBeNull();
    expect(mocks.getQuote).toHaveBeenCalledWith(QUOTE_ID);
  });

  it("maps a repository not-found error to a safe message without leaking the original", async () => {
    mocks.getQuote.mockRejectedValue(new Error("Quote not found"));

    const { result, errorCode } = await run(
      "get_quote",
      { id: QUOTE_ID },
      testContext({ profile: { role: "super_admin" } }),
    );

    expect(errorCode).toBe("not_found");
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(MCP_TOOL_ERROR_MESSAGES.notFound);
    expect(result.content[0].text).not.toContain("Quote not found");
  });
});

describe("propose_manual_message_sent", () => {
  const validArgs = {
    approval_id: APPROVAL_ID,
    reference: "Manual send ref 001",
    idempotency_key: "idem-key-0001",
  };

  it("calls the supervised proposal command with the verified token evidence", async () => {
    const context = writeContext();
    const { result, errorCode } = await executeMcpTool(
      toolNamed("propose_manual_message_sent"),
      context,
      validArgs,
    );

    expect(errorCode).toBeNull();
    expect(result.isError).toBeFalsy();
    expect(mocks.proposeAgentActionCommand).toHaveBeenCalledTimes(1);
    expect(mocks.proposeAgentActionCommand).toHaveBeenCalledWith(context.authorization, {
      action: "record_manual_message_sent",
      targetApprovalId: APPROVAL_ID,
      reference: "Manual send ref 001",
      idempotencyKey: "idem-key-0001",
      tokenId: "token-1",
      tokenName: "Claude Code",
    });
    expect(textPayload(result)).toEqual({
      status: "pending_approval",
      approvalId: "approval-proposal-1",
      targetApprovalId: APPROVAL_ID,
      requiresApproval: true,
      message: "Proposal recorded. It is waiting for a person with approval authority.",
    });
  });

  it("trims arguments but never trusts identity passed by the calling agent", async () => {
    const context = writeContext();
    await executeMcpTool(toolNamed("propose_manual_message_sent"), context, {
      approval_id: APPROVAL_ID,
      reference: "   ref-trimmed   ",
      idempotency_key: "   idem-trimmed   ",
    });

    expect(mocks.proposeAgentActionCommand).toHaveBeenCalledWith(
      context.authorization,
      expect.objectContaining({
        reference: "ref-trimmed",
        idempotencyKey: "idem-trimmed",
        tokenId: "token-1",
        tokenName: "Claude Code",
      }),
    );

    mocks.proposeAgentActionCommand.mockClear();
    for (const injected of [
      { tokenId: "token-other" },
      { tokenName: "Other token" },
      { profileId: "profile-2" },
    ]) {
      const { errorCode } = await executeMcpTool(
        toolNamed("propose_manual_message_sent"),
        context,
        { ...validArgs, ...injected },
      );
      expect(errorCode).toBe("invalid_input");
    }
    expect(mocks.proposeAgentActionCommand).not.toHaveBeenCalled();
  });

  it("rejects missing, malformed and out-of-range arguments without calling the command", async () => {
    const context = writeContext();
    const invalidArguments = [
      {},
      { ...validArgs, approval_id: "not-a-uuid" },
      { ...validArgs, reference: "ab" },
      { ...validArgs, reference: "a".repeat(256) },
      { ...validArgs, idempotency_key: "short" },
      { ...validArgs, idempotency_key: "i".repeat(129) },
    ];

    for (const args of invalidArguments) {
      const { result, errorCode } = await executeMcpTool(
        toolNamed("propose_manual_message_sent"),
        context,
        args,
      );
      expect(errorCode).toBe("invalid_input");
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe(MCP_TOOL_ERROR_MESSAGES.invalidInput);
    }
    expect(mocks.proposeAgentActionCommand).not.toHaveBeenCalled();
  });

  it("refuses a read-only token before the command can run", async () => {
    const { result, errorCode } = await executeMcpTool(
      toolNamed("propose_manual_message_sent"),
      testContext(),
      validArgs,
    );

    expect(errorCode).toBe("forbidden");
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(MCP_TOOL_ERROR_MESSAGES.forbidden);
    expect(mocks.proposeAgentActionCommand).not.toHaveBeenCalled();
  });

  it("maps command failures to safe messages without leaking SQL or record details", async () => {
    const context = writeContext();
    const tool = toolNamed("propose_manual_message_sent");

    mocks.proposeAgentActionCommand.mockRejectedValueOnce(
      new AdminError("VALIDATION_FAILED", "target approval c3d4 is not visible to profile-2"),
    );
    const invalid = await executeMcpTool(tool, context, validArgs);
    expect(invalid.errorCode).toBe("invalid_input");
    expect(invalid.result.content[0].text).toBe(MCP_TOOL_ERROR_MESSAGES.invalidInput);
    expect(invalid.result.content[0].text).not.toMatch(/c3d4|profile-2|visible/i);

    mocks.proposeAgentActionCommand.mockRejectedValueOnce(
      new AdminError("CONFLICT", "insert into human_approvals failed on duplicate key"),
    );
    const conflict = await executeMcpTool(tool, context, validArgs);
    expect(conflict.errorCode).toBe("invalid_input");
    expect(conflict.result.content[0].text).toBe(MCP_TOOL_ERROR_MESSAGES.conflict);
    expect(conflict.result.content[0].text).not.toMatch(/human_approvals|duplicate|insert/i);

    mocks.proposeAgentActionCommand.mockRejectedValueOnce(
      new Error("select * from human_approvals where token_hash=$1"),
    );
    const internal = await executeMcpTool(tool, context, validArgs);
    expect(internal.errorCode).toBe("internal");
    expect(internal.result.content[0].text).toBe(MCP_TOOL_ERROR_MESSAGES.internal);
    expect(internal.result.content[0].text).not.toMatch(/select|human_approvals|token_hash/i);
  });
});

describe("list_my_proposals", () => {
  const summary = {
    id: "approval-proposal-1",
    action: "record_manual_message_sent" as const,
    targetApprovalId: APPROVAL_ID,
    status: "pending" as const,
    createdAt: "2026-11-12T10:00:00.000Z",
    decidedAt: null,
    reviewerNotes: null,
    summary: "internal approval context summary",
  };

  it("lists only the token owner's proposals for a read-only token", async () => {
    mocks.listAgentActionProposalsForProfile.mockResolvedValue([summary]);
    const { result, errorCode } = await run("list_my_proposals", {});

    expect(errorCode).toBeNull();
    expect(result.isError).toBeFalsy();
    expect(mocks.listAgentActionProposalsForProfile).toHaveBeenCalledWith("profile-1", {
      status: undefined,
      limit: 20,
    });
    expect(textPayload(result)).toEqual([
      {
        id: "approval-proposal-1",
        action: "record_manual_message_sent",
        targetApprovalId: APPROVAL_ID,
        status: "pending",
        createdAt: "2026-11-12T10:00:00.000Z",
        decidedAt: null,
        reviewerNotes: null,
      },
    ]);
    expect(result.content[0].text).not.toContain("internal approval context summary");
  });

  it("is available to a read+write token too", async () => {
    mocks.listAgentActionProposalsForProfile.mockResolvedValue([]);
    const { errorCode } = await executeMcpTool(toolNamed("list_my_proposals"), writeContext(), {});

    expect(errorCode).toBeNull();
    expect(mocks.listAgentActionProposalsForProfile).toHaveBeenCalledWith("profile-1", {
      status: undefined,
      limit: 20,
    });
  });

  it("derives the profile from the token context, never from the arguments", async () => {
    const context = testContext({ profile: { id: "profile-2" } });

    await executeMcpTool(toolNamed("list_my_proposals"), context, { limit: 5 });
    expect(mocks.listAgentActionProposalsForProfile).toHaveBeenCalledWith("profile-2", {
      status: undefined,
      limit: 5,
    });

    const injected = await executeMcpTool(toolNamed("list_my_proposals"), context, {
      profileId: "profile-9",
    });
    expect(injected.errorCode).toBe("invalid_input");
    expect(mocks.listAgentActionProposalsForProfile).toHaveBeenCalledTimes(1);
  });

  it("passes the optional status filter and limit through", async () => {
    await run("list_my_proposals", { status: "approved", limit: 50 });

    expect(mocks.listAgentActionProposalsForProfile).toHaveBeenCalledWith("profile-1", {
      status: "approved",
      limit: 50,
    });
  });

  it("rejects an unsupported status, an out-of-range limit and a write-only token", async () => {
    const tool = toolNamed("list_my_proposals");
    for (const args of [
      { status: "superseded" },
      { status: "unknown" },
      { limit: 0 },
      { limit: 51 },
    ]) {
      const { errorCode } = await executeMcpTool(tool, testContext(), args);
      expect(errorCode).toBe("invalid_input");
    }

    const writeOnly = await executeMcpTool(
      tool,
      { ...testContext(), scopes: ["write"] as const },
      {},
    );
    expect(writeOnly.errorCode).toBe("forbidden");
    expect(writeOnly.result.content[0].text).toBe(MCP_TOOL_ERROR_MESSAGES.forbidden);
    expect(mocks.listAgentActionProposalsForProfile).not.toHaveBeenCalled();
  });
});
