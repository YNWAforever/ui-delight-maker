import type { Account } from "@/lib/types";
import type {
  CompanyWorkspaceRequest,
  CompanyWorkspaceResponse,
  CoreProjection,
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

const SAFE_SECTION_ERROR_MESSAGE =
  "This workspace section is temporarily unavailable. Please try again.";
const SAFE_CONTACT_COUNT_WARNING_MESSAGE = "Stakeholder count is temporarily unavailable.";

function createSectionMeta(correlationId: string, startedAt: number): WorkspaceSectionMeta {
  return {
    correlationId,
    fetchedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    source: "network",
  };
}

function logSectionReadFailure(correlationId: string, section: WorkspaceSection, cause: unknown) {
  console.error("[company-workspace] section read failed", { correlationId, section }, cause);
}

async function loadSettledProjection<Values extends readonly unknown[], Projection>(
  correlationId: string,
  section: WorkspaceSection,
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
    logSectionReadFailure(correlationId, section, rejected.reason);
    return {
      status: "error",
      error: { code: "SECTION_READ_FAILED", message: SAFE_SECTION_ERROR_MESSAGE },
      meta,
    };
  }

  const values = results.map(
    (result) => (result as PromiseFulfilledResult<unknown>).value,
  ) as unknown as Values;
  const data = createProjection(...values);
  return isEmpty(data) ? { status: "empty", data, meta } : { status: "ready", data, meta };
}

async function loadCoreSection(
  input: RequestedSectionInput,
): Promise<WorkspaceSectionResult<CoreProjection>> {
  const startedAt = Date.now();

  try {
    const peopleCount = await input.sources.countAccountContacts(input.request.accountId);
    return {
      status: "ready",
      data: createCoreProjection({ account: input.account, peopleCount }),
      meta: createSectionMeta(input.correlationId, startedAt),
    };
  } catch (cause) {
    logSectionReadFailure(input.correlationId, "core", cause);
    return {
      status: "ready",
      data: createCoreProjection({ account: input.account, peopleCount: 0 }),
      meta: {
        ...createSectionMeta(input.correlationId, startedAt),
        warnings: [
          {
            code: "CONTACT_COUNT_READ_FAILED",
            message: SAFE_CONTACT_COUNT_WARNING_MESSAGE,
          },
        ],
      },
    };
  }
}

function loadOverviewSection(input: RequestedSectionInput) {
  return loadSettledProjection(
    input.correlationId,
    "overview",
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
    "stakeholders",
    [input.sources.listAccountContacts(input.request.accountId)],
    (contacts) => createStakeholdersProjection({ contacts }),
    (projection) => projection.contacts.length === 0,
  );
}

function loadActivitySection(input: RequestedSectionInput) {
  return loadSettledProjection(
    input.correlationId,
    "activity",
    [input.sources.getAccountTimeline(input.request.accountId)],
    (timeline) => createActivityProjection({ timeline }),
    (projection) => projection.timeline.length === 0,
  );
}

function loadCommercialSection(input: RequestedSectionInput) {
  return loadSettledProjection(
    input.correlationId,
    "commercial",
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
    "deliveryFinance",
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
