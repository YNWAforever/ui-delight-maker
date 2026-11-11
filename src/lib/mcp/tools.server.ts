import { z } from "zod";
import { AdminError } from "@/lib/admin/errors";
import type { AppSession } from "@/lib/auth/neon-auth.server";
import {
  MCP_ERROR_CODES,
  type McpErrorCode,
  type McpTokenScope,
  type McpToolDefinition,
} from "@/lib/mcp/types";
import {
  effectiveCapabilitiesWithContext,
  requireAnyCapability,
  requireCapability,
  type RequestAuthorization,
} from "@/server/auth/authorization.server";
import { getAccount, listAccountsPage } from "@/server/repositories/accounts";
import { getJobSheet, listJobSheetsPage } from "@/server/repositories/job-sheets";
import { getLeadWithActivity, listLeadsPage } from "@/server/repositories/leads";
import { getQuote } from "@/server/repositories/quotes";
import { listTaskQueuePage } from "@/server/repositories/tasks";
import { searchWorkspace } from "@/server/repositories/workspace-search";

/** Capability set the UI's global search requires; holding any one of them enables search. */
const SEARCH_CAPABILITIES = [
  "accounts.view",
  "contacts.view",
  "leads.view",
  "quotes.view",
  "tasks.view",
] as const;

/** Page sizes are bounded so an agent cannot ask for an unbounded read. */
const PAGE_LIMIT_MAX = 100;
const PAGE_LIMIT_DEFAULT = 10;
const PAGE_DEFAULT = 1;

/** Mirrors the BFF/global-search contract: queries under three characters return nothing; at most 20 results. */
const SEARCH_LIMIT_MAX = 20;
const SEARCH_LIMIT_DEFAULT = 20;

const idSchema = z.string().uuid();

/** Everything the protocol layer knows about the caller of one tools/call. */
export type McpToolContext = {
  authorization: RequestAuthorization;
  session: AppSession;
  tokenId: string;
  tokenName: string;
  /** Safe display projection (`fmcp_` + 8 hex characters), never the raw token. */
  tokenPrefix?: string;
  scopes: readonly McpTokenScope[];
};

export type McpToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

/** A registry entry: `definition` is metadata, `inputSchema` validates and documents arguments. */
export type McpTool = {
  definition: Pick<McpToolDefinition, "name" | "title" | "description">;
  inputSchema: z.ZodObject<z.ZodRawShape>;
  /** Token scope required to run this tool; read-only v1 tools all require `read`. */
  requiredScope?: McpTokenScope;
  handler: (context: McpToolContext, args: Record<string, unknown>) => Promise<unknown>;
};

/**
 * Safe, stable tool error messages.
 *
 * Tool failures are MCP results, not protocol errors, so the text is the only thing a client
 * sees. These strings are asserted against in tests and mapped back to audit codes by the
 * protocol layer; never build them from repository messages or SQL.
 */
export const MCP_TOOL_ERROR_MESSAGES = {
  forbidden: "You do not have permission to use this tool.",
  notFound: "The requested record was not found.",
  invalidInput: "The tool arguments were invalid.",
  internal: "The tool failed unexpectedly. Please try again.",
} as const;

/** JSON Schema for tools/list, generated from the same zod schema the handler parses. */
export function mcpToolDefinitions(): McpToolDefinition[] {
  return MCP_TOOLS.map(({ definition, inputSchema }) => ({
    ...definition,
    inputSchema: { ...z.toJSONSchema(inputSchema) } as Record<string, unknown>,
  }));
}

function textResult(text: string, isError = false): McpToolResult {
  return {
    content: [{ type: "text", text }],
    ...(isError ? { isError: true } : {}),
  };
}

/**
 * Runs one registry handler and converts any failure into a safe MCP tool error.
 *
 * Raw messages may carry SQL fragments, driver errors or record ids, so only the classified
 * message reaches the client; the safe fields of the error are left to the protocol audit log.
 */
export async function executeMcpTool(
  tool: McpTool,
  context: McpToolContext,
  args: Record<string, unknown>,
): Promise<{ result: McpToolResult; errorCode: McpErrorCode | null }> {
  // Defense in depth on top of the capability check: a token must hold the read scope to run any
  // v1 tool, so a future write-scoped token cannot read through a read tool by accident.
  if (!context.scopes.includes(tool.requiredScope ?? "read")) {
    return {
      result: textResult(MCP_TOOL_ERROR_MESSAGES.forbidden, true),
      errorCode: MCP_ERROR_CODES.forbidden,
    };
  }
  try {
    const data = await tool.handler(context, args);
    return {
      result: textResult(JSON.stringify(data, null, 2) ?? "null"),
      errorCode: null,
    };
  } catch (error) {
    if (error instanceof AdminError) {
      if (
        error.code === "UNAUTHENTICATED" ||
        error.code === "FORBIDDEN" ||
        error.code === "OUTSIDE_SCOPE"
      ) {
        return {
          result: textResult(MCP_TOOL_ERROR_MESSAGES.forbidden, true),
          errorCode: MCP_ERROR_CODES.forbidden,
        };
      }
      if (error.code === "VALIDATION_FAILED") {
        return {
          result: textResult(MCP_TOOL_ERROR_MESSAGES.invalidInput, true),
          errorCode: MCP_ERROR_CODES.invalidInput,
        };
      }
    }
    if (error instanceof z.ZodError) {
      return {
        result: textResult(MCP_TOOL_ERROR_MESSAGES.invalidInput, true),
        errorCode: MCP_ERROR_CODES.invalidInput,
      };
    }
    if (error instanceof Error && /not found/i.test(error.message)) {
      return {
        result: textResult(MCP_TOOL_ERROR_MESSAGES.notFound, true),
        errorCode: MCP_ERROR_CODES.notFound,
      };
    }
    console.error("[mcp] tool failed", {
      tool: tool.definition.name,
      reason: error instanceof Error ? error.name : "unknown",
    });
    return {
      result: textResult(MCP_TOOL_ERROR_MESSAGES.internal, true),
      errorCode: MCP_ERROR_CODES.internal,
    };
  }
}

/** Maps an MCP tool result back to the safe audit code recorded for the call. */
export function toolErrorCodeFromResult(result: unknown): McpErrorCode | null {
  if (!result || typeof result !== "object" || !("content" in result)) return null;
  const candidate = result as { content?: unknown; isError?: unknown };
  if (candidate.isError !== true || !Array.isArray(candidate.content)) return null;
  const first = candidate.content[0];
  const text =
    first && typeof first === "object" && "text" in first && typeof first.text === "string"
      ? first.text
      : "";
  if (text === MCP_TOOL_ERROR_MESSAGES.forbidden) return MCP_ERROR_CODES.forbidden;
  if (text === MCP_TOOL_ERROR_MESSAGES.notFound) return MCP_ERROR_CODES.notFound;
  if (text === MCP_TOOL_ERROR_MESSAGES.invalidInput) return MCP_ERROR_CODES.invalidInput;
  if (text.includes("Input validation error")) return MCP_ERROR_CODES.invalidInput;
  if (/^Tool \S+ not found$/.test(text)) return MCP_ERROR_CODES.invalidInput;
  return MCP_ERROR_CODES.internal;
}

const zeroArgsSchema = z.strictObject({});

const whoamiTool: McpTool = {
  definition: {
    name: "whoami",
    title: "Who am I",
    description:
      "Read-only identity check: the signed-in CRM profile, its effective capabilities, and the connector token metadata. No secrets are returned.",
  },
  inputSchema: zeroArgsSchema,
  async handler(context) {
    return {
      profile: {
        id: context.session.profile.id,
        name: context.session.profile.name,
        role: context.session.profile.role,
        status: context.session.profile.status,
      },
      capabilities: effectiveCapabilitiesWithContext(context.authorization),
      token: {
        id: context.tokenId,
        name: context.tokenName,
        prefix: context.tokenPrefix ?? null,
        scopes: context.scopes,
      },
    };
  },
};

const searchSchema = z.strictObject({
  query: z.string().trim().min(3).max(200),
  limit: z.number().int().min(1).max(SEARCH_LIMIT_MAX).default(SEARCH_LIMIT_DEFAULT),
});

const searchTool: McpTool = {
  definition: {
    name: "search",
    title: "Search workspace",
    description:
      "Read-only global search across companies, contacts, leads, quotes and tasks (minimum 3 characters, at most 20 results). Results match the signed-in user's visibility.",
  },
  inputSchema: searchSchema,
  async handler(context, args) {
    const input = searchSchema.parse(args);
    await requireAnyCapability([...SEARCH_CAPABILITIES], {}, context.authorization);
    return searchWorkspace(input.query, input.limit, context.authorization);
  },
};

const listAccountsSchema = z.strictObject({
  query: z.string().trim().max(200).optional(),
  owner: z.string().max(100).optional(),
  cs_owner: z.string().max(100).optional(),
  lifecycle_stage: z.string().max(100).optional(),
  page: z.number().int().min(1).default(PAGE_DEFAULT),
  limit: z.number().int().min(1).max(PAGE_LIMIT_MAX).default(PAGE_LIMIT_DEFAULT),
});

const listAccountsTool: McpTool = {
  definition: {
    name: "list_accounts",
    title: "List accounts",
    description:
      "Read-only paged list of CRM accounts, filtered like the /accounts page. Capability-wide for the token owner (the UI list applies no per-row manager redaction).",
  },
  inputSchema: listAccountsSchema,
  async handler(context, args) {
    const input = listAccountsSchema.parse(args);
    await requireCapability("accounts.view", {}, context.authorization);
    return listAccountsPage(input);
  },
};

const getAccountSchema = z.strictObject({ id: idSchema });

const getAccountTool: McpTool = {
  definition: {
    name: "get_account",
    title: "Get account",
    description:
      "Read-only single account by id. Row-scoped: the capability target is checked against the account owner before the row is read.",
  },
  inputSchema: getAccountSchema,
  async handler(context, args) {
    const { id } = getAccountSchema.parse(args);
    await requireCapability(
      "accounts.view",
      { resourceType: "account", resourceId: id },
      context.authorization,
    );
    return getAccount(id);
  },
};

const listLeadsSchema = z.strictObject({
  status: z.string().max(100).optional(),
  source: z.string().max(100).optional(),
  assigned_to: z.string().max(100).optional(),
  contact_id: idSchema.optional(),
  account_id: idSchema.optional(),
  source_campaign_id: idSchema.optional(),
  page: z.number().int().min(1).default(PAGE_DEFAULT),
  limit: z.number().int().min(1).max(PAGE_LIMIT_MAX).default(PAGE_LIMIT_DEFAULT),
});

const listLeadsTool: McpTool = {
  definition: {
    name: "list_leads",
    title: "List leads",
    description:
      "Read-only paged list of CRM leads, filtered like the /leads page. Capability-wide for the token owner (the UI list applies no per-row manager redaction).",
  },
  inputSchema: listLeadsSchema,
  async handler(context, args) {
    const input = listLeadsSchema.parse(args);
    await requireCapability("leads.view", {}, context.authorization);
    return listLeadsPage(input);
  },
};

const getLeadSchema = z.strictObject({ id: idSchema });

const getLeadTool: McpTool = {
  definition: {
    name: "get_lead",
    title: "Get lead",
    description:
      "Read-only single lead by id with its latest activity entries. Row-scoped: the capability target is checked against the lead owner before the row is read.",
  },
  inputSchema: getLeadSchema,
  async handler(context, args) {
    const { id } = getLeadSchema.parse(args);
    await requireCapability(
      "leads.view",
      { resourceType: "lead", resourceId: id },
      context.authorization,
    );
    return getLeadWithActivity(id);
  },
};

const listJobSheetsSchema = z.strictObject({
  status: z
    .enum(["draft", "accounting_review", "accepted", "change_required", "cancelled"])
    .optional(),
  client_id: idSchema.optional(),
  account_id: idSchema.optional(),
  company: z.string().trim().max(200).optional(),
  quoteNumber: z.string().trim().max(200).optional(),
  accountingOwner: z.string().max(200).optional(),
  po: z.string().trim().max(200).optional(),
  createdFrom: z.iso.date().optional(),
  createdTo: z.iso.date().optional(),
  page: z.number().int().min(1).default(PAGE_DEFAULT),
  limit: z.number().int().min(1).max(PAGE_LIMIT_MAX).default(PAGE_LIMIT_DEFAULT),
});

const listJobSheetsTool: McpTool = {
  definition: {
    name: "list_job_sheets",
    title: "List job sheets",
    description:
      "Read-only paged list of job sheets. Rows are row-scoped by the same SQL visibility policy as the UI list.",
  },
  inputSchema: listJobSheetsSchema,
  async handler(context, args) {
    const input = listJobSheetsSchema.parse(args);
    await requireCapability("job_sheets.view", {}, context.authorization);
    return listJobSheetsPage(input, context.authorization);
  },
};

const getJobSheetSchema = z.strictObject({ id: idSchema });

const getJobSheetTool: McpTool = {
  definition: {
    name: "get_job_sheet",
    title: "Get job sheet",
    description:
      "Read-only single job sheet by id with its portions. Row-scoped: the capability target is checked against the job-sheet owner before the row is read.",
  },
  inputSchema: getJobSheetSchema,
  async handler(context, args) {
    const { id } = getJobSheetSchema.parse(args);
    await requireCapability(
      "job_sheets.view",
      { resourceType: "job_sheet", resourceId: id },
      context.authorization,
    );
    return getJobSheet(id);
  },
};

const listTasksSchema = z.strictObject({
  status: z.enum(["open", "in_progress", "done"]).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  assigned_to: z.string().max(100).optional(),
  search: z.string().trim().max(200).optional(),
  limit: z.number().int().min(1).max(PAGE_LIMIT_MAX).default(PAGE_LIMIT_DEFAULT),
});

const listTasksTool: McpTool = {
  definition: {
    name: "list_tasks",
    title: "List tasks",
    description:
      "Read-only first page of the task queue, filtered like the /tasks page. Rows are row-scoped by the same SQL visibility policy as the UI task queue.",
  },
  inputSchema: listTasksSchema,
  async handler(context, args) {
    const input = listTasksSchema.parse(args);
    await requireCapability("tasks.view", {}, context.authorization);
    return listTaskQueuePage(input, context.authorization);
  },
};

const getQuoteSchema = z.strictObject({ id: idSchema });

const getQuoteTool: McpTool = {
  definition: {
    name: "get_quote",
    title: "Get quote",
    description:
      "Read-only single quote by id. Row-scoped: the capability target is checked against the quote owner before the row is read.",
  },
  inputSchema: getQuoteSchema,
  async handler(context, args) {
    const { id } = getQuoteSchema.parse(args);
    await requireCapability(
      "quotes.view",
      { resourceType: "quote", resourceId: id },
      context.authorization,
    );
    return getQuote(id);
  },
};

/**
 * The v1 read-only tool registry.
 *
 * Adding a tool is one entry here: the MCP server registration, tools/list JSON Schema and the
 * protocol audit trail all read from this array. Handlers may only read — writes arrive later
 * behind explicit token scopes and the existing approval model.
 */
export const MCP_TOOLS: readonly McpTool[] = [
  whoamiTool,
  searchTool,
  listAccountsTool,
  getAccountTool,
  listLeadsTool,
  getLeadTool,
  listJobSheetsTool,
  getJobSheetTool,
  listTasksTool,
  getQuoteTool,
];

/** Tool names in registry order; the design doc lists exactly these. */
export const MCP_TOOL_NAMES: readonly string[] = MCP_TOOLS.map((tool) => tool.definition.name);
