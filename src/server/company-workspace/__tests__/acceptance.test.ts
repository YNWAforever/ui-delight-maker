import { describe, expect, it, vi } from "vitest";
import { allowTestUser, createFakeSources } from "./fixtures";
import { createCompanyWorkspaceReadModel } from "../read-model";

describe("company workspace acceptance", () => {
  it("does not read deferred sections for the initial overview request", async () => {
    const sources = createFakeSources();
    const model = createCompanyWorkspaceReadModel({ sources, authorize: allowTestUser });

    await model.loadCompanyWorkspace({ accountId: "account-1", sections: ["overview"] });

    expect(sources.getAccountTimeline).not.toHaveBeenCalled();
    expect(sources.listAccountContacts).not.toHaveBeenCalled();
    expect(sources.listEngagementsByAccount).not.toHaveBeenCalled();
    expect(sources.listQuotes).not.toHaveBeenCalled();
    expect(sources.listTasks).not.toHaveBeenCalled();
    expect(sources.listJobSheets).not.toHaveBeenCalled();
  });

  it("retries only the failed activity section without changing overview data", async () => {
    const overviewClients = [{ id: "client-1" }];
    const timeline = [{ id: "timeline-1" }];
    const sources = createFakeSources({
      listClients: vi.fn().mockResolvedValue(overviewClients),
      getAccountTimeline: vi
        .fn()
        .mockRejectedValueOnce(new Error("temporary timeline failure"))
        .mockResolvedValueOnce(timeline),
    });
    const model = createCompanyWorkspaceReadModel({ sources, authorize: allowTestUser });

    const firstResult = await model.loadCompanyWorkspace({
      accountId: "account-1",
      sections: ["overview", "activity"],
    });

    expect(firstResult.sections.overview?.status).toBe("ready");
    expect(firstResult.sections.activity).toMatchObject({ status: "error" });
    const overviewBeforeRetry = structuredClone(firstResult.sections.overview);

    const retryResult = await model.loadCompanyWorkspace({
      accountId: "account-1",
      sections: ["activity"],
    });

    expect(retryResult.sections.activity).toMatchObject({ status: "ready", data: { timeline } });
    expect(retryResult.sections.overview).toBeUndefined();
    expect(firstResult.sections.overview).toEqual(overviewBeforeRetry);
    expect(sources.getAccountTimeline).toHaveBeenCalledTimes(2);
    expect(sources.listClients).toHaveBeenCalledTimes(1);
    expect(sources.listOpenRelationshipSignalSummary).toHaveBeenCalledTimes(1);
    expect(sources.getAccountEngagementSummary).toHaveBeenCalledTimes(1);
    expect(sources.listQuoteSummaries).toHaveBeenCalledTimes(1);
    expect(sources.listAccountContacts).not.toHaveBeenCalled();
    expect(sources.listEngagementsByAccount).not.toHaveBeenCalled();
    expect(sources.listQuotes).not.toHaveBeenCalled();
    expect(sources.listTasks).not.toHaveBeenCalled();
    expect(sources.listJobSheets).not.toHaveBeenCalled();
  });
});
