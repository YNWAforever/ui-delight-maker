import { describe, expect, it } from "vitest";
import { companyWorkspaceKeys } from "../query-keys";

describe("company workspace query keys", () => {
  it("separates accounts and sections while keeping a shared root", () => {
    expect(companyWorkspaceKeys.all()).toEqual(["company-workspace"]);
    expect(companyWorkspaceKeys.account("account-1")).toEqual(["company-workspace", "account-1"]);
    expect(companyWorkspaceKeys.section("account-1", "overview")).toEqual([
      "company-workspace",
      "account-1",
      "overview",
    ]);
    expect(companyWorkspaceKeys.section("account-2", "overview")).not.toEqual(
      companyWorkspaceKeys.section("account-1", "overview"),
    );
  });
});
