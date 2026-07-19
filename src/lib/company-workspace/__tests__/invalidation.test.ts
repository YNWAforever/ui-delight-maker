import { describe, expect, it } from "vitest";
import { companyWorkspaceQueryKey, getCompanyWorkspaceMutationQueryKeys } from "../invalidation";

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

  it("builds stable account-and-section keys", () => {
    expect(companyWorkspaceQueryKey("account-1", "commercial")).toEqual([
      "company-workspace",
      "account-1",
      "commercial",
    ]);
  });
});
