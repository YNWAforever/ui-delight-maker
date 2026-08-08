import { describe, expect, it, vi } from "vitest";
import { createCompanyWorkspaceReadModel } from "../read-model";
import { allowTestUser, createFakeSources } from "./fixtures";

describe("company workspace read model", () => {
  it("loads only core and overview when those are requested", async () => {
    const sources = createFakeSources({
      listClients: vi.fn().mockResolvedValue([{ id: "client-1" }]),
    });
    const model = createCompanyWorkspaceReadModel({
      sources,
      authorize: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
    });

    const result = await model.loadCompanyWorkspace({
      accountId: "account-1",
      sections: ["core", "overview"],
    });

    expect(result.sections.core?.status).toBe("ready");
    expect(result.sections.overview?.status).toBe("ready");
    expect(sources.listAccountContacts).not.toHaveBeenCalled();
    expect(sources.getAccountTimeline).not.toHaveBeenCalled();
    expect(sources.listEngagementsByAccount).not.toHaveBeenCalled();
    expect(sources.listTasks).not.toHaveBeenCalled();
  });

  it("reads engagements once regardless of linked-client count", async () => {
    const sources = createFakeSources({
      listClients: vi
        .fn()
        .mockResolvedValue([{ id: "client-1" }, { id: "client-2" }, { id: "client-3" }]),
    });
    const model = createCompanyWorkspaceReadModel({
      sources,
      authorize: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
    });

    await model.loadCompanyWorkspace({ accountId: "account-1", sections: ["commercial"] });

    expect(sources.listEngagementsByAccount).toHaveBeenCalledTimes(1);
    expect(sources.listEngagementsByAccount).toHaveBeenCalledWith("account-1");
  });

  it("keeps successful sections when activity fails", async () => {
    const sources = createFakeSources({
      getAccountTimeline: vi.fn().mockRejectedValue(new Error("timeline unavailable")),
    });
    const model = createCompanyWorkspaceReadModel({
      sources,
      authorize: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
    });

    const result = await model.loadCompanyWorkspace({
      accountId: "account-1",
      sections: ["overview", "activity"],
    });

    expect(result.sections.overview?.status).toBe("ready");
    expect(result.sections.activity?.status).toBe("error");
    expect(result.meta.correlationId).toEqual(expect.any(String));
  });

  it("throws for account identity failure", async () => {
    const sources = createFakeSources({
      getAccount: vi.fn().mockRejectedValue(new Error("Account not found")),
    });
    const model = createCompanyWorkspaceReadModel({
      sources,
      authorize: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
    });

    await expect(
      model.loadCompanyWorkspace({ accountId: "missing", sections: ["overview"] }),
    ).rejects.toThrow("Account not found");
  });

  it("loads every requested deferred section once and leaves no section out", async () => {
    const sources = createFakeSources();
    const model = createCompanyWorkspaceReadModel({ sources, authorize: allowTestUser });

    const result = await model.loadCompanyWorkspace({
      accountId: "account-1",
      sections: ["stakeholders", "activity", "commercial", "deliveryFinance", "activity"],
    });

    expect(result.sections.core?.status).toBe("ready");
    expect(result.sections.stakeholders?.status).toBe("empty");
    expect(result.sections.activity?.status).toBe("empty");
    expect(result.sections.commercial?.status).toBe("empty");
    expect(result.sections.deliveryFinance?.status).toBe("empty");
    expect(sources.listAccountContacts).toHaveBeenCalledWith("account-1");
    expect(sources.getAccountTimeline).toHaveBeenCalledWith("account-1");
    expect(sources.listEngagementsByAccount).toHaveBeenCalledWith("account-1");
    expect(sources.listQuotes).toHaveBeenCalledWith("account-1");
    expect(sources.listTasks).toHaveBeenCalledWith("account-1");
    expect(sources.listJobSheets).toHaveBeenCalledWith("account-1");
    expect(sources.listQuoteSummaries).toHaveBeenCalledWith("account-1");
  });

  it("retains quote references in delivery finance without loading full quotes", async () => {
    const sources = createFakeSources({
      listQuoteSummaries: vi.fn().mockResolvedValue([{ id: "quote-1", number: "Q-1" }]),
    });
    const model = createCompanyWorkspaceReadModel({ sources, authorize: allowTestUser });

    const result = await model.loadCompanyWorkspace({
      accountId: "account-1",
      sections: ["deliveryFinance"],
    });

    expect(result.sections.deliveryFinance).toMatchObject({
      status: "ready",
      data: { quoteSummaries: [{ id: "quote-1", number: "Q-1" }] },
    });
    expect(sources.listQuotes).not.toHaveBeenCalled();
  });
});
