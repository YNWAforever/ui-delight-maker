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
  fixture: CompanyWorkspacePerformanceFixture["name"];
  serverCallCount: number;
  databaseQueryCount: number;
  engagementQueryCount: number;
  responseBytes: number;
  elapsedDurationMs: number;
  meetsEngagementQueryTarget: boolean;
};

export const MAX_ENGAGEMENT_QUERIES_PER_WORKSPACE = 1;

// These fixtures model the currently eager account route without database credentials.
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

export const UNOPENED_OPTIONAL_SECTIONS = [
  "activity",
  "commercial",
  "delivery_finance",
  "intelligence",
] as const;

function createRecords(prefix: string, count: number) {
  return Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index + 1}` }));
}

function createFixtureResponse(fixture: CompanyWorkspacePerformanceFixture) {
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

export function measureCompanyWorkspaceFixture(
  fixture: CompanyWorkspacePerformanceFixture,
  now: () => number = performance.now,
): CompanyWorkspaceMeasurement {
  const startedAt = now();
  const response = JSON.stringify(createFixtureResponse(fixture));
  const elapsedDurationMs = Number((now() - startedAt).toFixed(3));
  const engagementQueryCount = fixture.clientCount;

  return {
    fixture: fixture.name,
    // One core route call plus the four independently mounted section queries.
    serverCallCount: 5,
    // Core (2), commercial (3 plus one engagement query per client), and the other sections (4).
    databaseQueryCount: 9 + engagementQueryCount,
    engagementQueryCount,
    responseBytes: Buffer.byteLength(response, "utf8"),
    elapsedDurationMs,
    meetsEngagementQueryTarget: engagementQueryCount <= MAX_ENGAGEMENT_QUERIES_PER_WORKSPACE,
  };
}

export function measureCompanyWorkspaceFixtures(now: () => number = performance.now) {
  return Object.values(COMPANY_WORKSPACE_PERFORMANCE_FIXTURES).map((fixture) =>
    measureCompanyWorkspaceFixture(fixture, now),
  );
}

export function getInitialCompanyWorkspaceSectionFetches(source: string) {
  const initialFetches = Array.from(
    source.matchAll(/useCompanyWorkspaceSection\(account\.id, "([^"]+)"\)/g),
    (match) => match[1],
  );
  const unopenedOptionalFetches = UNOPENED_OPTIONAL_SECTIONS.filter((section) =>
    initialFetches.includes(section),
  );

  return {
    initialFetches,
    unopenedOptionalFetches,
    meetsUnopenedTabPolicy: unopenedOptionalFetches.length === 0,
  };
}

export function formatCompanyWorkspaceMeasurements(measurements: CompanyWorkspaceMeasurement[]) {
  return JSON.stringify(
    {
      measurement: "deterministic local fixture model",
      notes: [
        "No production credentials or database calls are used.",
        "Elapsed duration measures local response serialization only; it is not production latency.",
      ],
      measurements,
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
