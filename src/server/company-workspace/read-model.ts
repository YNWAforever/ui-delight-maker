import type {
  CompanyWorkspaceRequest,
  CompanyWorkspaceResponse,
} from "@/lib/company-workspace/types";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import { loadRequestedSections } from "./sections";
import { neonCompanyWorkspaceSources } from "./sources";
import type { CompanyWorkspaceSources } from "./types";

export function createCompanyWorkspaceReadModel({
  sources = neonCompanyWorkspaceSources,
  authorize = requireNeonAuthSession,
}: {
  sources?: CompanyWorkspaceSources;
  authorize?: () => Promise<unknown>;
} = {}) {
  return {
    async loadCompanyWorkspace(
      request: CompanyWorkspaceRequest,
    ): Promise<CompanyWorkspaceResponse> {
      await authorize();
      const account = await sources.getAccount(request.accountId);
      return loadRequestedSections({ account, request, sources });
    },
  };
}

export const { loadCompanyWorkspace } = createCompanyWorkspaceReadModel();
