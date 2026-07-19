import { useQuery } from "@tanstack/react-query";
import { getCompanyWorkspaceSection } from "@/server-functions/company-workspace";
import type {
  CompanyWorkspaceSection,
  CompanyWorkspaceSectionData,
  SectionState,
} from "@/server/company-workspace/types";

const transientRetryDelayMs = 250;
export const COMPANY_WORKSPACE_STALE_TIME_MS = 30_000;

export function useCompanyWorkspaceSection<S extends CompanyWorkspaceSection>(
  accountId: string,
  section: S,
  options: { enabled?: boolean } = {},
) {
  const fetchSection = async (): Promise<SectionState<CompanyWorkspaceSectionData[S]>> =>
    (await getCompanyWorkspaceSection({
      data: { accountId, section },
    })) as SectionState<CompanyWorkspaceSectionData[S]>;

  return useQuery<SectionState<CompanyWorkspaceSectionData[S]>>({
    queryKey: ["company-workspace", accountId, section],
    enabled: Boolean(accountId) && (options.enabled ?? true),
    staleTime: COMPANY_WORKSPACE_STALE_TIME_MS,
    refetchOnWindowFocus: true,
    retry: false,
    queryFn: async () => {
      const first = await fetchSection();
      if (first.status !== "error" || !first.error.retryable) return first;

      await new Promise((resolve) => setTimeout(resolve, transientRetryDelayMs));
      return fetchSection();
    },
  });
}
