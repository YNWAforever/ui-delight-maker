import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  queryMock,
  queryOneMock,
  requireCapabilitySetMock,
  requireCapabilityChecksMock,
  requireCapabilityMock,
  requireNeonAuthSessionMock,
  createServerFnChain,
} = vi.hoisted(() => {
  const createServerFnChain = {
    validator() {
      return createServerFnChain;
    },
    handler<T extends (...args: never[]) => unknown>(handler: T) {
      return handler;
    },
  };

  return {
    queryMock: vi.fn(),
    queryOneMock: vi.fn(),
    requireCapabilitySetMock: vi.fn(),
    requireCapabilityChecksMock: vi.fn(),
    requireCapabilityMock: vi.fn(),
    requireNeonAuthSessionMock: vi.fn(),
    createServerFnChain,
  };
});

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => createServerFnChain,
}));

vi.mock("@/server/auth/authorization.server", () => ({
  requireCapability: requireCapabilityMock,
  requireCapabilityChecks: requireCapabilityChecksMock,
  requireCapabilitySet: requireCapabilitySetMock,
}));

vi.mock("@/lib/auth/neon-auth.server", () => ({
  requireNeonAuthSession: requireNeonAuthSessionMock,
}));

vi.mock("@/server/db/neon.server", () => ({
  query: queryMock,
  queryOne: queryOneMock,
}));

const lead = {
  id: "lead-1",
  company_name: "Acme",
  status: "qualified",
  lead_score: 82,
  qualification_data: { budget: "confirmed" },
};

const campaign = {
  id: "campaign-1",
  name: "Spring Roadshow",
  type: "client_event",
  status: "active",
};

function sqlText(value: unknown) {
  return String(value).replace(/\s+/g, " ").trim().toLowerCase();
}

describe("relationship workspace read models", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCapabilityMock.mockResolvedValue(undefined);
    requireCapabilityChecksMock.mockResolvedValue(undefined);
    requireCapabilitySetMock.mockResolvedValue({});
    requireNeonAuthSessionMock.mockResolvedValue({
      user: { id: "user-1" },
      profile: { id: "user-1", role: "sales", status: "active" },
      session: {},
    });

    queryOneMock.mockImplementation((sql: unknown) => {
      const text = sqlText(sql);
      if (text.includes("from leads")) return Promise.resolve(lead);
      if (text.includes("from campaigns")) return Promise.resolve(campaign);
      if (text.includes("attendee_count")) {
        return Promise.resolve({
          attendee_count: "12",
          attended_count: "8",
          high_intent_count: "3",
          open_follow_up_count: "5",
          converted_count: "2",
          unmatched_account_count: "4",
          possible_duplicate_count: "2",
          latest_import_at: "2026-07-19T10:00:00.000Z",
        });
      }
      if (text.includes("count(distinct a.id)")) return Promise.resolve({ total: "1" });
      if (text.includes("count(*) as total") && text.includes("campaign_members")) {
        return Promise.resolve({ total: "2" });
      }
      return Promise.resolve(null);
    });

    queryMock.mockImplementation((sql: unknown) => {
      const text = sqlText(sql);
      if (text.includes("from activity_logs")) {
        return Promise.resolve([
          {
            id: "activity-1",
            actor_type: "user",
            actor_id: "user-1",
            action: "qualified lead",
            object_type: "lead",
            object_id: "lead-1",
            diff_data: { status: "qualified" },
            created_at: "2026-07-18T09:00:00.000Z",
          },
        ]);
      }
      if (text.includes("from quotes")) {
        return Promise.resolve([
          {
            id: "quote-1",
            number: "Q-001",
            status: "sent",
            total_value: 45000,
            currency: "HKD",
            valid_until: "2026-08-01",
            created_at: "2026-07-18T00:00:00.000Z",
            line_item_count: "3",
          },
        ]);
      }
      if (text.includes("from campaign_members") && text.includes("date_trunc")) {
        return Promise.resolve([
          {
            imported_at: "2026-07-19T00:00:00.000Z",
            last_imported_at: "2026-07-19T16:20:00.000Z",
            attendee_count: "2",
          },
        ]);
      }
      if (text.includes("from campaign_members")) {
        return Promise.resolve([
          { id: "member-2", campaign_id: "campaign-1", created_at: "2026-07-19" },
          { id: "member-1", campaign_id: "campaign-1", created_at: "2026-07-18" },
        ]);
      }
      if (text.includes("from accounts a")) {
        return Promise.resolve([
          {
            id: "account-1",
            name: "Acme",
            lifecycle_stage: "active_client",
            open_signal_count: "2",
            highest_severity: "high",
            latest_signal_at: "2026-07-20T00:00:00.000Z",
            signal_summaries: [
              {
                id: "signal-1",
                account_id: "account-1",
                signal_type: "stale_touchpoint",
                severity: "high",
                title: "Touchpoint stale",
                reason: "No recent touchpoint",
                suggested_action: "Schedule a call",
                source: "deterministic",
                dedupe_key: "stale-touchpoint",
                dismissed_at: null,
                dismissed_by: null,
                dismissal_reason: null,
                created_at: "2026-07-20T00:00:00.000Z",
                updated_at: "2026-07-20T00:00:00.000Z",
              },
            ],
          },
        ]);
      }
      return Promise.resolve([]);
    });
  });

  it("loads lead core, bounded activity, and lead-scoped quote summaries", async () => {
    const { loadLeadWorkspaceRead } = await import("../relationship-workspaces");

    const result = await loadLeadWorkspaceRead("lead-1");

    expect(result.lead).toEqual(lead);
    expect(result.qualification).toEqual({
      status: "qualified",
      score: 82,
      data: { budget: "confirmed" },
    });
    expect(result.activityLogs).toHaveLength(1);
    expect(result.quotes).toEqual([
      expect.objectContaining({
        id: "quote-1",
        number: "Q-001",
        total_value: 45000,
        lineItemCount: 3,
      }),
    ]);

    const quoteCall = queryMock.mock.calls.find(([sql]) => sqlText(sql).includes("from quotes"));
    expect(quoteCall).toBeDefined();
    expect(sqlText(quoteCall?.[0])).toMatch(
      /where lead_id = \$1.*order by created_at desc, id desc.*limit \$2/,
    );
    expect(quoteCall?.[1]).toEqual(["lead-1", 25]);
    expect(sqlText(quoteCall?.[0])).not.toContain("select *");
    expect(sqlText(quoteCall?.[0])).toContain("line_item_count");

    const activityCall = queryMock.mock.calls.find(([sql]) =>
      sqlText(sql).includes("from activity_logs"),
    );
    expect(activityCall?.[1]).toEqual(["lead-1", 20]);
  });

  it("keeps campaign members deferred while returning attendee summary counts", async () => {
    const { getCampaignWithAttendeeSummary } = await import("@/server/repositories/campaigns");

    await expect(getCampaignWithAttendeeSummary("campaign-1")).resolves.toEqual({
      campaign,
      attendeeSummary: {
        total: 12,
        attended: 8,
        highIntent: 3,
        openFollowUp: 5,
        converted: 2,
        unmatchedAccounts: 4,
        possibleDuplicates: 2,
        latestImportAt: "2026-07-19T10:00:00.000Z",
      },
    });

    const memberQueries = queryMock.mock.calls.filter(([sql]) =>
      sqlText(sql).includes("from campaign_members"),
    );
    expect(memberQueries).toHaveLength(0);
  });

  it("loads a bounded deterministic attendee page and compact import history on demand", async () => {
    const { listCampaignAttendeeImportSection } = await import("@/server/repositories/campaigns");

    const result = await listCampaignAttendeeImportSection("campaign-1", { page: 1, limit: 500 });

    expect(result).toEqual({
      members: expect.arrayContaining([expect.objectContaining({ id: "member-1" })]),
      total: 2,
      page: 1,
      limit: 100,
      importHistory: [
        {
          importedAt: "2026-07-19T00:00:00.000Z",
          lastImportedAt: "2026-07-19T16:20:00.000Z",
          attendeeCount: 2,
        },
      ],
    });
    const memberCall = queryMock.mock.calls.find(
      ([sql]) =>
        sqlText(sql).includes("from campaign_members") && !sqlText(sql).includes("date_trunc"),
    );
    expect(sqlText(memberCall?.[0])).toMatch(
      /order by created_at desc, id desc.*limit \$2 offset \$3/,
    );
    expect(memberCall?.[1]).toEqual(["campaign-1", 100, 0]);
    const historyCall = queryMock.mock.calls.find(([sql]) => sqlText(sql).includes("date_trunc"));
    expect(sqlText(historyCall?.[0])).toContain("limit $2");
    expect(historyCall?.[1]).toEqual(["campaign-1", 12]);
  });

  it("paginates account rows and filters open signals in SQL", async () => {
    const { listRelationshipIndexPage } =
      await import("@/server/repositories/relationship-signals");

    const result = await listRelationshipIndexPage({ page: 2, limit: 500, severity: "high" });

    expect(result).toEqual({
      items: [
        expect.objectContaining({
          account: expect.objectContaining({ id: "account-1", name: "Acme" }),
          openSignalCount: 2,
          highestSeverity: "high",
          signalSummaries: [expect.objectContaining({ id: "signal-1" })],
        }),
      ],
      total: 1,
      page: 2,
      limit: 100,
    });

    const rowCall = queryMock.mock.calls.find(([sql]) => sqlText(sql).includes("from accounts a"));
    const rowSql = sqlText(rowCall?.[0]);
    expect(rowSql).toContain("rs.dismissed_at is null");
    expect(rowSql).toContain("rs.severity = $1");
    expect(rowSql).toMatch(/order by.*latest_signal_at desc.*a.id asc/);
    expect(rowSql).toContain("limit $2 offset $3");
    expect(rowCall?.[1]).toEqual(["high", 100, 100]);
  });

  it("authorizes each aggregate and deferred section before repository access", async () => {
    const {
      getCampaignWorkspaceRead,
      getCampaignWorkspaceSection,
      getLeadWorkspaceRead,
      getRelationshipIndexRead,
    } = await import("@/server-functions/relationship-workspaces");

    await getLeadWorkspaceRead({ data: { id: "lead-1" } });
    expect(requireCapabilityChecksMock).toHaveBeenCalledWith([
      {
        capability: "leads.view",
        target: { resourceType: "lead", resourceId: "lead-1" },
      },
      { capability: "quotes.view" },
    ]);

    await getCampaignWorkspaceRead({ data: { id: "campaign-1" } });
    expect(requireCapabilityMock).toHaveBeenCalledWith("campaigns.view", {
      resourceType: "campaign",
      resourceId: "campaign-1",
    });

    await getCampaignWorkspaceSection({
      data: { campaignId: "campaign-1", page: 1, limit: 50 },
    });
    expect(requireCapabilityMock).toHaveBeenLastCalledWith("campaigns.view", {
      resourceType: "campaign",
      resourceId: "campaign-1",
    });

    await getRelationshipIndexRead({ data: { page: 1, limit: 50 } });
    // `engagements.update` rides along as *optional* so the index can tell the page whether
    // its Dismiss control can work. Both view capabilities stay required and still throw.
    expect(requireCapabilitySetMock).toHaveBeenLastCalledWith(
      ["accounts.view", "engagements.view"],
      { optional: ["engagements.update"] },
    );
    expect(requireNeonAuthSessionMock).not.toHaveBeenCalled();
  });
});
