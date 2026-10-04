import { describe, expect, it } from "vitest";

import { humanizeKey } from "../status-labels";

describe("humanizeKey", () => {
  it("reads audit actions, target types and capability names as words", () => {
    expect(humanizeKey("profile.deactivated_with_reassignment")).toBe(
      "Profile deactivated with reassignment",
    );
    expect(humanizeKey("team_membership")).toBe("Team membership");
    expect(humanizeKey("accounts.update")).toBe("Accounts update");
  });

  it("returns an empty string for nothing", () => {
    expect(humanizeKey(null)).toBe("");
    expect(humanizeKey(undefined)).toBe("");
    expect(humanizeKey(" ._ ")).toBe("");
  });
});
