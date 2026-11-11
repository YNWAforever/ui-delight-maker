import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PermissionOverride } from "@/lib/admin/types";
import type { AppSession } from "@/lib/auth/neon-auth.server";
import {
  executeMcpTool,
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
}));

vi.mock("@/lib/auth/neon-auth.server", () => ({
  requireNeonAuthSession: mocks.requireNeonAuthSession,
}));

vi.mock("@/server/db/neon.server", () => ({ query: mocks.query }));

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
});

describe("MCP tool registry", () => {
  it("exposes exactly the v1 read-only tools", () => {
    expect(MCP_TOOLS.map((tool) => tool.definition.name)).toEqual(EXPECTED_TOOL_NAMES);

    for (const tool of MCP_TOOLS) {
      expect(tool.definition.name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(tool.definition.title.length).toBeGreaterThan(0);
      expect(tool.definition.description).toMatch(/read-only/i);
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

    for (const tool of MCP_TOOLS) {
      const { result, errorCode } = await executeMcpTool(tool, context, {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/do not have permission/i);
      expect(errorCode).toBe("forbidden");
    }
  });

  it("only imports read functions from the repositories (no write tool can slip in)", () => {
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
