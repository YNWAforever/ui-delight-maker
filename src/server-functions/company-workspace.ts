import { createServerFn } from "@tanstack/react-start";
import {
  workspaceFreshnessValues,
  workspaceSections,
  type CompanyWorkspaceRequest,
  type WorkspaceFreshness,
  type WorkspaceSection,
} from "@/lib/company-workspace/types";
import { loadCompanyWorkspace } from "@/server/company-workspace/read-model";

const INVALID_REQUEST_MESSAGE = "Invalid company workspace request";

function isWorkspaceSection(value: string): value is WorkspaceSection {
  return workspaceSections.some((section) => section === value);
}

function isWorkspaceFreshness(value: string): value is WorkspaceFreshness {
  return workspaceFreshnessValues.some((freshness) => freshness === value);
}

function parseCompanyWorkspaceRequest(data: unknown): CompanyWorkspaceRequest {
  if (!data || typeof data !== "object") {
    throw new Error(INVALID_REQUEST_MESSAGE);
  }

  const { accountId, sections, freshness } = data as Record<string, unknown>;

  if (typeof accountId !== "string" || !accountId.trim() || !Array.isArray(sections)) {
    throw new Error(INVALID_REQUEST_MESSAGE);
  }

  const validSections: WorkspaceSection[] = [];
  for (const section of sections) {
    if (typeof section !== "string" || !section.trim() || !isWorkspaceSection(section)) {
      throw new Error(INVALID_REQUEST_MESSAGE);
    }
    validSections.push(section);
  }

  if (validSections.length === 0) {
    throw new Error(INVALID_REQUEST_MESSAGE);
  }

  if (
    freshness !== undefined &&
    (typeof freshness !== "string" || !isWorkspaceFreshness(freshness))
  ) {
    throw new Error(INVALID_REQUEST_MESSAGE);
  }

  return {
    accountId: accountId.trim(),
    sections: validSections,
    ...(freshness === undefined ? {} : { freshness }),
  };
}

export const getCompanyWorkspace = createServerFn({ method: "GET" })
  .validator(parseCompanyWorkspaceRequest)
  .handler(async ({ data }) => loadCompanyWorkspace(data));
