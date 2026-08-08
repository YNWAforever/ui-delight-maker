import { describe, expect, it, vi } from "vitest";
import { allowTestUser, createFakeSources } from "./fixtures";
import { createCompanyWorkspaceReadModel } from "../read-model";

describe("company workspace acceptance", () => {
  it("does not read activity, commercial, or delivery data for the initial request", async () => {
    const sources = createFakeSources();
    const model = createCompanyWorkspaceReadModel({ sources, authorize: allowTestUser });

    await model.loadCompanyWorkspace({ accountId: "account-1", sections: ["overview"] });

    expect(sources.getAccountTimeline).not.toHaveBeenCalled();
    expect(sources.listEngagementsByAccount).not.toHaveBeenCalled();
    expect(sources.listTasks).not.toHaveBeenCalled();
    expect(sources.listJobSheets).not.toHaveBeenCalled();
  });

  it("returns a retryable error without changing successful overview data", async () => {
    const sources = createFakeSources({
      listClients: vi.fn().mockResolvedValue([{ id: "client-1" }]),
      getAccountTimeline: vi.fn().mockRejectedValue(new Error("temporary timeline failure")),
    });
    const model = createCompanyWorkspaceReadModel({ sources, authorize: allowTestUser });

    const result = await model.loadCompanyWorkspace({
      accountId: "account-1",
      sections: ["overview", "activity"],
    });

    expect(result.sections.overview?.status).toBe("ready");
    expect(result.sections.activity).toMatchObject({ status: "error" });
  });
});
