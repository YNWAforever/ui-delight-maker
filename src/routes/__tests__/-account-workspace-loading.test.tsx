import { describe, expect, it } from "vitest";
import { getCompanyWorkspaceSectionEnablement } from "@/lib/company-workspace/section-enablement";

describe("Account company workspace loading contract", () => {
  it.fails("keeps unopened optional sections disabled on the Overview tab", () => {
    expect(getCompanyWorkspaceSectionEnablement("overview")).toEqual({
      commercial: false,
      delivery_finance: false,
      activity: false,
      intelligence: false,
    });
  });
});
