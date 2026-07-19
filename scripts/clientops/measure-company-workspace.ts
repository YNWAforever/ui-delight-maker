export type CompanyWorkspacePerformanceFixture = {
  name: "empty" | "typical" | "high-activity";
  clientCount: number;
  engagementsPerClient: number;
  contactCount: number;
  leadCount: number;
  quoteCount: number;
  taskCount: number;
  jobSheetCount: number;
  timelineEntryCount: number;
  signalCount: number;
};

export type CompanyWorkspaceMeasurement = {
  scenario: "baseline-eager" | "optimized-overview" | "optimized-commercial";
  fixture: CompanyWorkspacePerformanceFixture["name"];
  serverCallCount: number;
  databaseQueryCount: number;
  engagementQueryCount: number;
  responseBytes: number;
  elapsedDurationMs: null;
  meetsEngagementQueryTarget: boolean;
};

export type CompanyWorkspaceMeasurementComparison = {
  fixture: CompanyWorkspacePerformanceFixture["name"];
  baseline: CompanyWorkspaceMeasurement;
  optimized: CompanyWorkspaceMeasurement;
  optimizedCommercial: CompanyWorkspaceMeasurement;
};

export const MAX_ENGAGEMENT_QUERIES_PER_WORKSPACE = 1;

export const COMPANY_WORKSPACE_PERFORMANCE_FIXTURES: Record<
  "empty" | "typical" | "highActivity",
  CompanyWorkspacePerformanceFixture
> = {
  empty: {
    name: "empty",
    clientCount: 0,
    engagementsPerClient: 0,
    contactCount: 0,
    leadCount: 0,
    quoteCount: 0,
    taskCount: 0,
    jobSheetCount: 0,
    timelineEntryCount: 0,
    signalCount: 0,
  },
  typical: {
    name: "typical",
    clientCount: 3,
    engagementsPerClient: 2,
    contactCount: 4,
    leadCount: 2,
    quoteCount: 3,
    taskCount: 5,
    jobSheetCount: 2,
    timelineEntryCount: 12,
    signalCount: 2,
  },
  highActivity: {
    name: "high-activity",
    clientCount: 25,
    engagementsPerClient: 4,
    contactCount: 30,
    leadCount: 18,
    quoteCount: 35,
    taskCount: 60,
    jobSheetCount: 20,
    timelineEntryCount: 200,
    signalCount: 18,
  },
};

function createRecords(prefix: string, count: number) {
  return Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index + 1}` }));
}

function responseBytes(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function createBaselineResponse(fixture: CompanyWorkspacePerformanceFixture) {
  return {
    core: {
      company: { id: "account-fixture", name: `${fixture.name} account` },
      contacts: createRecords("contact", fixture.contactCount),
    },
    sections: {
      commercial: {
        clients: createRecords("client", fixture.clientCount),
        engagements: createRecords(
          "engagement",
          fixture.clientCount * fixture.engagementsPerClient,
        ),
        leads: createRecords("lead", fixture.leadCount),
        quotes: createRecords("quote", fixture.quoteCount),
      },
      delivery_finance: {
        tasks: createRecords("task", fixture.taskCount),
        jobSheets: createRecords("job-sheet", fixture.jobSheetCount),
      },
      activity: { timeline: createRecords("timeline", fixture.timelineEntryCount) },
      intelligence: { signals: createRecords("signal", fixture.signalCount) },
    },
  };
}

function createOptimizedOverviewResponse(fixture: CompanyWorkspacePerformanceFixture) {
  return {
    requestId: "fixture-request",
    core: {
      company: { id: "account-fixture", name: `${fixture.name} account` },
      ownership: { accountOwnerId: null, csOwnerId: null },
      contacts: createRecords("contact", fixture.contactCount),
    },
    overview: {
      status: "ready",
      data: {
        linkedClientCount: fixture.clientCount,
        activeEngagementCount: fixture.clientCount * fixture.engagementsPerClient,
        quoteCount: fixture.quoteCount,
        quoteTotals:
          fixture.quoteCount === 0
            ? []
            : [{ currency: "HKD", quoteCount: fixture.quoteCount, totalValue: 0 }],
        openSignalCount: fixture.signalCount,
        openSignals: createRecords("signal", Math.min(fixture.signalCount, 5)),
      },
    },
    sections: {},
    cache: {
      core: { fetchedAt: "2026-07-19T00:00:00.000Z", freshForMs: 30_000 },
      overview: { fetchedAt: "2026-07-19T00:00:00.000Z", freshForMs: 30_000 },
      sections: {},
    },
  };
}

function createOptimizedCommercialResponse(fixture: CompanyWorkspacePerformanceFixture) {
  return {
    status: fixture.clientCount + fixture.leadCount + fixture.quoteCount === 0 ? "empty" : "ready",
    data: {
      clients: createRecords("client", fixture.clientCount),
      engagements: createRecords("engagement", fixture.clientCount * fixture.engagementsPerClient),
      leads: createRecords("lead", fixture.leadCount),
      quotes: createRecords("quote", fixture.quoteCount),
    },
  };
}

export function measureCompanyWorkspaceFixture(
  fixture: CompanyWorkspacePerformanceFixture,
): CompanyWorkspaceMeasurement {
  const engagementQueryCount = fixture.clientCount;
  return {
    scenario: "baseline-eager",
    fixture: fixture.name,
    serverCallCount: 5,
    databaseQueryCount: 9 + engagementQueryCount,
    engagementQueryCount,
    responseBytes: responseBytes(createBaselineResponse(fixture)),
    elapsedDurationMs: null,
    meetsEngagementQueryTarget: engagementQueryCount <= MAX_ENGAGEMENT_QUERIES_PER_WORKSPACE,
  };
}

export function measureCompanyWorkspaceComparison(
  fixture: CompanyWorkspacePerformanceFixture,
): CompanyWorkspaceMeasurementComparison {
  const optimizedEngagementQueryCount = fixture.clientCount > 0 ? 1 : 0;
  return {
    fixture: fixture.name,
    baseline: measureCompanyWorkspaceFixture(fixture),
    optimized: {
      scenario: "optimized-overview",
      fixture: fixture.name,
      serverCallCount: 1,
      databaseQueryCount: 5,
      engagementQueryCount: 0,
      responseBytes: responseBytes(createOptimizedOverviewResponse(fixture)),
      elapsedDurationMs: null,
      meetsEngagementQueryTarget: true,
    },
    optimizedCommercial: {
      scenario: "optimized-commercial",
      fixture: fixture.name,
      serverCallCount: 1,
      databaseQueryCount: 3 + optimizedEngagementQueryCount,
      engagementQueryCount: optimizedEngagementQueryCount,
      responseBytes: responseBytes(createOptimizedCommercialResponse(fixture)),
      elapsedDurationMs: null,
      meetsEngagementQueryTarget:
        optimizedEngagementQueryCount <= MAX_ENGAGEMENT_QUERIES_PER_WORKSPACE,
    },
  };
}

export function measureCompanyWorkspaceFixtures() {
  return Object.values(COMPANY_WORKSPACE_PERFORMANCE_FIXTURES).map((fixture) =>
    measureCompanyWorkspaceComparison(fixture),
  );
}

export function formatCompanyWorkspaceMeasurements(
  comparisons: CompanyWorkspaceMeasurementComparison[],
) {
  return JSON.stringify(
    {
      measurement: "deterministic local fixture model",
      notes: [
        "No production credentials or database calls are used.",
        "Optimized Overview models the initial account route; optimized Commercial is deferred until its tab is opened.",
        "Elapsed duration is unavailable in the deterministic fixture model; measure real request latency separately.",
      ],
      comparisons,
    },
    null,
    2,
  );
}

if (
  process.argv[1]?.replaceAll("\\", "/").endsWith("scripts/clientops/measure-company-workspace.ts")
) {
  process.stdout.write(
    `${formatCompanyWorkspaceMeasurements(measureCompanyWorkspaceFixtures())}\n`,
  );
}
