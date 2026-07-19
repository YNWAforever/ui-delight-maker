import { useQuery, useQueryClient } from "@tanstack/react-query";
import { companyWorkspaceQueryKey } from "@/lib/company-workspace/invalidation";
import { retainCompanyWorkspaceSectionData } from "@/lib/company-workspace/section-state";
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
  type Data = CompanyWorkspaceSectionData[S];

  const queryClient = useQueryClient();
  const queryKey = companyWorkspaceQueryKey(accountId, section);
  const fetchSection = async (): Promise<SectionState<Data>> =>
    (await getCompanyWorkspaceSection({
      data: { accountId, section },
    })) as SectionState<Data>;
  const retainLastSuccessfulData = (next: SectionState<Data>) =>
    retainCompanyWorkspaceSectionData(next, queryClient.getQueryData<SectionState<Data>>(queryKey));

  return useQuery<SectionState<Data>>({
    queryKey,
    enabled: Boolean(accountId) && (options.enabled ?? true),
    staleTime: COMPANY_WORKSPACE_STALE_TIME_MS,
    refetchOnWindowFocus: true,
    retry: false,
    queryFn: async () => {
      const first = await fetchSection();
      if (first.status !== "error" || !first.error.retryable) {
        return retainLastSuccessfulData(first);
      }

      await new Promise((resolve) => setTimeout(resolve, transientRetryDelayMs));
      return retainLastSuccessfulData(await fetchSection());
    },
  });
}
