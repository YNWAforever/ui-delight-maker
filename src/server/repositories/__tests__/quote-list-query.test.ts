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

  it("searches the quote number and every visible company name", () => {
    const parts = buildQuoteListQuery({ filters: {}, search: "Acme", visibility: BOTH });

    expect(parts.where).toContain("coalesce(q.number, '') ilike $1");
    expect(parts.where).toContain("coalesce(c.company_name, '') ilike $1");
    expect(parts.where).toContain("coalesce(l.company_name, '') ilike $1");
    expect(parts.values).toEqual(["%Acme%"]);
  });

  it("does not search a company name the actor may not see", () => {
    // The oracle. Without this, a denied actor types a company name and learns from the
    // result count whether a lead by that name exists, even though it is never rendered.
    const parts = buildQuoteListQuery({
      filters: {},
      search: "Acme",
      visibility: { leads: false, clients: true },
    });

    expect(parts.where).toContain("coalesce(q.number, '') ilike $1");
    expect(parts.where).toContain("coalesce(c.company_name, '') ilike $1");
    expect(parts.where).not.toContain("l.company_name");
  });

  it("numbers the search parameter after the filter parameters", () => {
    const parts = buildQuoteListQuery({
      filters: { status: "sent", lead_id: "lead-1" },
      search: "Acme",
      visibility: BOTH,
    });

    expect(parts.where).toContain("q.status = $1");
    expect(parts.where).toContain("q.lead_id = $2");
    expect(parts.where).toContain("ilike $3");
    expect(parts.values).toEqual(["sent", "lead-1", "%Acme%"]);
  });

  it("escapes LIKE metacharacters instead of letting them match everything", () => {
    const parts = buildQuoteListQuery({ filters: {}, search: "100%_x", visibility: BOTH });
    expect(parts.values).toEqual(["%100\\%\\_x%"]);
  });

  it("adds no predicate for a blank search", () => {
    // Must not degrade into `ilike '%%'`, which matches every row and quietly turns the
    // tiles into a workspace-wide total.
    for (const search of ["", "   ", undefined]) {
      const parts = buildQuoteListQuery({ filters: {}, search, visibility: BOTH });
      expect(parts.where).toBe("");
      expect(parts.values).toEqual([]);
    }
  });

  it("caps an overlong search rather than passing it through", () => {
    const parts = buildQuoteListQuery({ filters: {}, search: "a".repeat(500), visibility: BOTH });
    expect(parts.values).toEqual([`%${"a".repeat(100)}%`]);
  });
});
