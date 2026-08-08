import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import {
  invalidateCompanyWorkspaceSections,
  sectionsForCompanyWorkspaceMutation,
} from "../invalidation";
import { companyWorkspaceKeys } from "../query-keys";

describe("sectionsForCompanyWorkspaceMutation", () => {
  it("maps every mutation to its exact workspace sections", () => {
    expect(sectionsForCompanyWorkspaceMutation("account-changed")).toEqual(["core", "overview"]);
    expect(sectionsForCompanyWorkspaceMutation("account-finance-changed")).toEqual([
      "overview",
      "deliveryFinance",
    ]);
    expect(sectionsForCompanyWorkspaceMutation("contacts-changed")).toEqual([
      "core",
      "stakeholders",
    ]);
    expect(sectionsForCompanyWorkspaceMutation("signal-dismissed")).toEqual(["overview"]);
    expect(sectionsForCompanyWorkspaceMutation("client-changed")).toEqual([
      "overview",
      "commercial",
    ]);
    expect(sectionsForCompanyWorkspaceMutation("engagement-changed")).toEqual([
      "overview",
      "commercial",
    ]);
    expect(sectionsForCompanyWorkspaceMutation("quote-changed")).toEqual([
      "overview",
      "commercial",
    ]);
    expect(sectionsForCompanyWorkspaceMutation("quote-accepted")).toEqual([
      "overview",
      "commercial",
      "deliveryFinance",
    ]);
    expect(sectionsForCompanyWorkspaceMutation("task-changed")).toEqual(["deliveryFinance"]);
    expect(sectionsForCompanyWorkspaceMutation("activity-changed")).toEqual(["activity"]);
  });
});

describe("invalidateCompanyWorkspaceSections", () => {
  it("invalidates only the exact requested account-section keys", async () => {
    const queryClient = new QueryClient();
    const accountId = "account-1";
    const requested = companyWorkspaceKeys.section(accountId, "overview");
    const duplicate = companyWorkspaceKeys.section(accountId, "overview");
    const adjacentSection = companyWorkspaceKeys.section(accountId, "commercial");
    const adjacentAccount = companyWorkspaceKeys.section("account-2", "overview");

    queryClient.setQueryData(requested, { value: "requested" });
    queryClient.setQueryData(adjacentSection, { value: "other-section" });
    queryClient.setQueryData(adjacentAccount, { value: "other-account" });

    await invalidateCompanyWorkspaceSections(queryClient, accountId, ["overview", "overview"]);

    expect(queryClient.getQueryState(requested)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(duplicate)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(adjacentSection)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(adjacentAccount)?.isInvalidated).toBe(false);
  });
});
