import { createServerFn } from "@tanstack/react-start";
import { requireCapability } from "@/server/auth/authorization.server";
import {
  loadCompanyWorkspaceCore,
  loadCompanyWorkspaceRead,
  loadCompanyWorkspaceSection,
} from "@/server/company-workspace/loaders";
import type { CompanyWorkspaceSection } from "@/server/company-workspace/types";

type CompanyWorkspaceInput = { accountId: string };
type CompanyWorkspaceSectionInput = CompanyWorkspaceInput & {
  section: CompanyWorkspaceSection;
};
type CompanyWorkspaceReadInput = CompanyWorkspaceInput & {
  sections: CompanyWorkspaceSection[];
};

const companyWorkspaceSections = [
  "commercial",
  "delivery_finance",
  "activity",
  "intelligence",
] as const;

function validateCompanyWorkspaceInput(data: unknown): CompanyWorkspaceInput {
  if (
    !data ||
    typeof data !== "object" ||
    typeof (data as { accountId?: unknown }).accountId !== "string" ||
    !(data as { accountId: string }).accountId.trim()
  ) {
    throw new Error("Company Workspace account ID is required");
  }
  return { accountId: (data as { accountId: string }).accountId.trim() };
}

function validateCompanyWorkspaceSectionInput(data: unknown): CompanyWorkspaceSectionInput {
  const input = validateCompanyWorkspaceInput(data);
  const section = (data as { section?: unknown }).section;
  if (!companyWorkspaceSections.includes(section as CompanyWorkspaceSection)) {
    throw new Error("Invalid Company Workspace section");
  }
  return { ...input, section: section as CompanyWorkspaceSection };
}

function validateCompanyWorkspaceReadInput(data: unknown): CompanyWorkspaceReadInput {
  const input = validateCompanyWorkspaceInput(data);
  const rawSections = (data as { sections?: unknown }).sections;
  const sections = rawSections === undefined ? [] : rawSections;
  if (!Array.isArray(sections)) throw new Error("Company Workspace sections must be an array");
  if (
    sections.some(
      (section) => !companyWorkspaceSections.includes(section as CompanyWorkspaceSection),
    )
  ) {
    throw new Error("Invalid Company Workspace section");
  }
  if (new Set(sections).size !== sections.length) {
    throw new Error("Company Workspace sections must be unique");
  }
  return { ...input, sections: sections as CompanyWorkspaceSection[] };
}

export const getCompanyWorkspaceRead = createServerFn({ method: "GET" })
  .validator(validateCompanyWorkspaceReadInput)
  .handler(async ({ data }) => {
    // Same guard getAccount and getAccountWorkspace already apply to this account's data.
    // A bare session check let this path skip two things they enforce: an explicit
    // permission-override deny, and the manager scope check — so a manager barred from an
    // account could still read it here, which is the primary account screen.
    // requireCapability loads the session itself, so no separate session check is needed.
    await requireCapability("accounts.view", {
      resourceType: "account",
      resourceId: data.accountId,
    });
    return loadCompanyWorkspaceRead(data.accountId, data.sections);
  });

export const getCompanyWorkspaceCore = createServerFn({ method: "GET" })
  .validator(validateCompanyWorkspaceInput)
  .handler(async ({ data }) => {
    // Same guard getAccount and getAccountWorkspace already apply to this account's data.
    // A bare session check let this path skip two things they enforce: an explicit
    // permission-override deny, and the manager scope check — so a manager barred from an
    // account could still read it here, which is the primary account screen.
    // requireCapability loads the session itself, so no separate session check is needed.
    await requireCapability("accounts.view", {
      resourceType: "account",
      resourceId: data.accountId,
    });
    return loadCompanyWorkspaceCore(data.accountId);
  });

export const getCompanyWorkspaceSection = createServerFn({ method: "GET" })
  .validator(validateCompanyWorkspaceSectionInput)
  .handler(async ({ data }) => {
    // Same guard getAccount and getAccountWorkspace already apply to this account's data.
    // A bare session check let this path skip two things they enforce: an explicit
    // permission-override deny, and the manager scope check — so a manager barred from an
    // account could still read it here, which is the primary account screen.
    // requireCapability loads the session itself, so no separate session check is needed.
    await requireCapability("accounts.view", {
      resourceType: "account",
      resourceId: data.accountId,
    });
    return loadCompanyWorkspaceSection(data.accountId, data.section);
  });
