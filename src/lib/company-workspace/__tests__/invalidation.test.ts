import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  companyWorkspaceQueryKey,
  getCompanyWorkspaceMutationQueryKeys,
  invalidateCompanyWorkspaceMutation,
  invalidateLinkedCompanyWorkspaceMutation,
} from "../invalidation";

const invalidationFor = (section: string) => ({
  queryKey: ["company-workspace", "account-1", section],
  exact: true,
  refetchType: "active",
});

describe("company workspace mutation invalidation", () => {
  it.each(["dismiss_relationship_signal", "run_relationship_intelligence"] as const)(
    "invalidates only overview and intelligence for %s",
    (mutation) => {
      expect(getCompanyWorkspaceMutationQueryKeys("account-1", mutation)).toEqual([
        ["company-workspace", "account-1", "overview"],
        ["company-workspace", "account-1", "intelligence"],
      ]);
    },
  );

  it("reaches delivery and finance when a quote is accepted, because a job sheet appears", () => {
    expect(getCompanyWorkspaceMutationQueryKeys("account-1", "accept_quote")).toEqual([
      ["company-workspace", "account-1", "overview"],
      ["company-workspace", "account-1", "commercial"],
      ["company-workspace", "account-1", "delivery_finance"],
      ["company-workspace", "account-1", "activity"],
    ]);
  });

  it("leaves delivery and finance alone when a quote changes without acceptance", () => {
    expect(getCompanyWorkspaceMutationQueryKeys("account-1", "change_quote")).toEqual([
      ["company-workspace", "account-1", "overview"],
      ["company-workspace", "account-1", "commercial"],
      ["company-workspace", "account-1", "activity"],
    ]);
  });

  it("invalidates delivery and finance for a task change, and not the commercial section", () => {
    expect(getCompanyWorkspaceMutationQueryKeys("account-1", "change_task")).toEqual([
      ["company-workspace", "account-1", "delivery_finance"],
      ["company-workspace", "account-1", "activity"],
    ]);
  });

  it("builds stable account-and-section keys", () => {
    expect(companyWorkspaceQueryKey("account-1", "commercial")).toEqual([
      "company-workspace",
      "account-1",
      "commercial",
    ]);
  });

  it("invalidates every affected target exactly, and only for active observers", async () => {
    const queryClient = new QueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();

    await invalidateCompanyWorkspaceMutation(queryClient, "account-1", "accept_quote");

    expect(invalidateQueries.mock.calls.map(([args]) => args)).toEqual([
      invalidationFor("overview"),
      invalidationFor("commercial"),
      invalidationFor("delivery_finance"),
      invalidationFor("activity"),
    ]);
  });
});

describe("linked company workspace invalidation", () => {
  it.each([null, undefined, ""])(
    "does not invalidate when the record has no company (%p)",
    async (accountId) => {
      const queryClient = new QueryClient();
      const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();

      await invalidateLinkedCompanyWorkspaceMutation(queryClient, accountId, "change_task");

      expect(invalidateQueries).not.toHaveBeenCalled();
    },
  );

  it("invalidates the linked company's workspace when the record carries an account", async () => {
    const queryClient = new QueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();

    await invalidateLinkedCompanyWorkspaceMutation(queryClient, "account-1", "change_task");

    expect(invalidateQueries.mock.calls.map(([args]) => args)).toEqual([
      invalidationFor("delivery_finance"),
      invalidationFor("activity"),
    ]);
  });
});
