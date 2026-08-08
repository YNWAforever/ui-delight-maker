import type { Account } from "@/lib/types";
import type {
  CompanyWorkspaceRequest,
  CompanyWorkspaceResponse,
  WorkspaceSection,
  WorkspaceSectionMeta,
  WorkspaceSectionResult,
} from "@/lib/company-workspace/types";
import {
  createActivityProjection,
  createCommercialProjection,
  createCoreProjection,
  createDeliveryFinanceProjection,
  createOverviewProjection,
  createStakeholdersProjection,
  isOverviewProjectionEmpty,
} from "./projections";
import type { CompanyWorkspaceSources } from "./types";

type LoadRequestedSectionsInput = {
  account: Account;
  request: CompanyWorkspaceRequest;
  sources: CompanyWorkspaceSources;
};

type RequestedSectionInput = LoadRequestedSectionsInput & {
  correlationId: string;
};

function createSectionMeta(correlationId: string, startedAt: number): WorkspaceSectionMeta {
  return {
    correlationId,
    fetchedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    source: "network",
  };
}

function messageFor(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load company workspace section";
}

async function loadSettledProjection<Values extends readonly unknown[], Projection>(
  correlationId: string,
  reads: { [Key in keyof Values]: Promise<Values[Key]> },
  createProjection: (...values: Values) => Projection,
  isEmpty: (projection: Projection) => boolean,
): Promise<WorkspaceSectionResult<Projection>> {
  const startedAt = Date.now();
  const results = await Promise.allSettled(reads);
  const rejected = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  const meta = createSectionMeta(correlationId, startedAt);

  if (rejected) {
    return {
      status: "error",
      error: { code: "SECTION_READ_FAILED", message: messageFor(rejected.reason) },
      meta,
    };
  }

  const values = results.map(
    (result) => (result as PromiseFulfilledResult<unknown>).value,
  ) as unknown as Values;
  const data = createProjection(...values);
  return isEmpty(data) ? { status: "empty", data, meta } : { status: "ready", data, meta };
}

function loadCoreSection(input: RequestedSectionInput) {
  return loadSettledProjection(
    input.correlationId,
    [input.sources.countAccountContacts(input.request.accountId)],
    (peopleCount) => createCoreProjection({ account: input.account, peopleCount }),
    () => false,
  );
}

function loadOverviewSection(input: RequestedSectionInput) {
  return loadSettledProjection(
    input.correlationId,
    [
      input.sources.listClients(input.request.accountId),
      input.sources.listOpenRelationshipSignalSummary(input.request.accountId, 5),
      input.sources.getAccountEngagementSummary(input.request.accountId),
      input.sources.listQuoteSummaries(input.request.accountId),
    ],
    (linkedClients, signalSummary, engagementSummary, quoteSummaries) =>
      createOverviewProjection({
        linkedClients,
        openSignals: signalSummary.signals,
        openSignalCount: signalSummary.count,
        activeEngagementCount: engagementSummary.activeCount,
        quoteSummaries,
      }),
    isOverviewProjectionEmpty,
  );
}

function loadStakeholdersSection(input: RequestedSectionInput) {
  return loadSettledProjection(
    input.correlationId,
    [input.sources.listAccountContacts(input.request.accountId)],
    (contacts) => createStakeholdersProjection({ contacts }),
    (projection) => projection.contacts.length === 0,
  );
}

function loadActivitySection(input: RequestedSectionInput) {
  return loadSettledProjection(
    input.correlationId,
    [input.sources.getAccountTimeline(input.request.accountId)],
    (timeline) => createActivityProjection({ timeline }),
    (projection) => projection.timeline.length === 0,
  );
}

function loadCommercialSection(input: RequestedSectionInput) {
  return loadSettledProjection(
    input.correlationId,
    [
      input.sources.listEngagementsByAccount(input.request.accountId),
      input.sources.listQuotes(input.request.accountId),
    ],
    (engagements, quotes) => createCommercialProjection({ engagements, quotes }),
    (projection) => projection.engagements.length === 0 && projection.quotes.length === 0,
  );
}

function loadDeliveryFinanceSection(input: RequestedSectionInput) {
  return loadSettledProjection(
    input.correlationId,
    [
      input.sources.listTasks(input.request.accountId),
      input.sources.listJobSheets(input.request.accountId),
      input.sources.listQuoteSummaries(input.request.accountId),
    ],
    (tasks, jobSheets, quoteSummaries) =>
      createDeliveryFinanceProjection({ tasks, jobSheets, quoteSummaries }),
    (projection) =>
      projection.tasks.length === 0 &&
      projection.jobSheets.length === 0 &&
      projection.quoteSummaries.length === 0,
  );
}

const sectionLoaders = {
  core: loadCoreSection,
  overview: loadOverviewSection,
  stakeholders: loadStakeholdersSection,
  activity: loadActivitySection,
  commercial: loadCommercialSection,
  deliveryFinance: loadDeliveryFinanceSection,
} satisfies Record<WorkspaceSection, (input: RequestedSectionInput) => Promise<unknown>>;

export async function loadRequestedSections(
  input: LoadRequestedSectionsInput,
): Promise<CompanyWorkspaceResponse> {
  const correlationId = crypto.randomUUID();
  const requestedSections = [...new Set<WorkspaceSection>(["core", ...input.request.sections])];
  const sectionInput = { ...input, correlationId };
  const loadedSections = await Promise.all(
    requestedSections.map(
      async (section) => [section, await sectionLoaders[section](sectionInput)] as const,
    ),
  );

  return {
    accountId: input.request.accountId,
    sections: Object.fromEntries(loadedSections),
    meta: { correlationId, generatedAt: new Date().toISOString() },
  };
}
