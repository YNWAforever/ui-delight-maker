import { useQuery, useQueryClient } from "@tanstack/react-query";
import { COMPANY_WORKSPACE_STALE_TIME_MS } from "@/hooks/use-company-workspace-section";
import { crmQueryKeys } from "@/lib/query-keys";
import { getClientWorkspaceSection } from "@/server-functions/client-workspace";
import type {
  ClientWorkspaceSection,
  ClientWorkspaceSectionData,
  ClientWorkspaceSectionState,
} from "@/server/read-models/client-workspace";

const transientRetryDelayMs = 250;
export const CLIENT_WORKSPACE_STALE_TIME_MS = COMPANY_WORKSPACE_STALE_TIME_MS;

type ClientSectionState<Data> =
  | Extract<ClientWorkspaceSectionState<Data>, { status: "ready" | "empty" }>
  | (Extract<ClientWorkspaceSectionState<Data>, { status: "error" }> & { staleData?: Data });

function retainClientWorkspaceSectionData<Data>(
  next: ClientSectionState<Data>,
  previous?: ClientSectionState<Data>,
): ClientSectionState<Data> {
  if (next.status !== "error") return next;

  const staleData =
    previous?.status === "ready" || previous?.status === "empty"
      ? previous.data
      : previous?.status === "error"
        ? previous.staleData
        : undefined;

  return staleData === undefined ? next : { ...next, staleData };
}

export function useClientWorkspaceSection<Section extends ClientWorkspaceSection>(
  clientId: string,
  section: Section,
  options: { enabled?: boolean } = {},
) {
  type Data = ClientWorkspaceSectionData[Section];
  type State = ClientSectionState<Data>;

  const queryClient = useQueryClient();
  const queryKey = crmQueryKeys.clients.section(clientId, section);
  const fetchSection = async (): Promise<State> =>
    (await getClientWorkspaceSection({ data: { clientId, section } })) as State;
  const retainLastSuccessfulData = (next: State) =>
    retainClientWorkspaceSectionData(next, queryClient.getQueryData<State>(queryKey));

  return useQuery<State>({
    queryKey,
    enabled: Boolean(clientId) && options.enabled === true,
    staleTime: CLIENT_WORKSPACE_STALE_TIME_MS,
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
