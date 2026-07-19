import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
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
    typeof (data as { accountId?: unknown }).accountId !== "string"
  ) {
    throw new Error("Company Workspace account ID is required");
  }
  return { accountId: (data as { accountId: string }).accountId };
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
  const sections = (data as { sections?: unknown }).sections ?? [];
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
    await requireNeonAuthSession();
    return loadCompanyWorkspaceRead(data.accountId, data.sections);
  });

export const getCompanyWorkspaceCore = createServerFn({ method: "GET" })
  .validator(validateCompanyWorkspaceInput)
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return loadCompanyWorkspaceCore(data.accountId);
  });

export const getCompanyWorkspaceSection = createServerFn({ method: "GET" })
  .validator(validateCompanyWorkspaceSectionInput)
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return loadCompanyWorkspaceSection(data.accountId, data.section);
  });
