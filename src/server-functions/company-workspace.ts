import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import {
  loadCompanyWorkspace,
  loadCompanyWorkspaceCore,
  loadCompanyWorkspaceSection,
} from "@/server/company-workspace/loaders";
import type { CompanyWorkspaceSection } from "@/server/company-workspace/types";

type CompanyWorkspaceInput = { accountId: string };
type CompanyWorkspaceSectionInput = CompanyWorkspaceInput & {
  section: CompanyWorkspaceSection;
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

export const getCompanyWorkspaceCore = createServerFn({ method: "GET" })
  .validator(validateCompanyWorkspaceInput)
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return loadCompanyWorkspaceCore(data.accountId);
  });

export const getCompanyWorkspace = createServerFn({ method: "GET" })
  .validator(validateCompanyWorkspaceInput)
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return loadCompanyWorkspace(data.accountId);
  });

export const getCompanyWorkspaceSection = createServerFn({ method: "GET" })
  .validator(validateCompanyWorkspaceSectionInput)
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return loadCompanyWorkspaceSection(data.accountId, data.section);
  });
