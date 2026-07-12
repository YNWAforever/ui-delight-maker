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

export const getCompanyWorkspaceCore = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as CompanyWorkspaceInput)
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return loadCompanyWorkspaceCore(data.accountId);
  });

export const getCompanyWorkspace = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as CompanyWorkspaceInput)
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return loadCompanyWorkspace(data.accountId);
  });

export const getCompanyWorkspaceSection = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as CompanyWorkspaceSectionInput)
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return loadCompanyWorkspaceSection(data.accountId, data.section);
  });
