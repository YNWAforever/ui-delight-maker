import { describe, expect, it } from "vitest";

import { buildQuoteListQuery } from "../quote-list-query";

const BOTH = { leads: true, clients: true };
const NEITHER = { leads: false, clients: false };

describe("buildQuoteListQuery", () => {
  it("joins and selects both company names when both are visible", () => {
    const parts = buildQuoteListQuery({ filters: {}, visibility: BOTH });

    expect(parts.joins).toContain("left join leads l on l.id = q.lead_id");
    expect(parts.joins).toContain("left join clients c on c.id = q.client_id");
    expect(parts.companyNameExpression).toBe("coalesce(c.company_name, l.company_name)");
  });

  it("omits the lead join entirely when leads are not visible", () => {
    const parts = buildQuoteListQuery({
      filters: {},
      visibility: { leads: false, clients: true },
    });

    // Absence, not masking. A join that is present can be searched even if its column is
    // never selected, and a result count is an inference oracle.
    expect(parts.joins).not.toContain("leads");
    expect(parts.companyNameExpression).toBe("coalesce(c.company_name)");
  });

  it("selects no company name at all when neither is visible", () => {
    const parts = buildQuoteListQuery({ filters: {}, visibility: NEITHER });

    expect(parts.joins).toBe("");
    expect(parts.companyNameExpression).toBe("null::text");
  });

  it("qualifies filter columns so a join cannot make them ambiguous", () => {
    // `leads` has its own `status` column. An unqualified `status = $1` is an error the
    // moment the join exists.
    const parts = buildQuoteListQuery({ filters: { status: "sent" }, visibility: BOTH });

    expect(parts.where).toContain("q.status = $1");
    expect(parts.values).toEqual(["sent"]);
  });
});
