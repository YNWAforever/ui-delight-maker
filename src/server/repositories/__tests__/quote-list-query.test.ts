import { describe, expect, it } from "vitest";

import { buildQuoteListQuery } from "../quote-list-query";

const BOTH = { leads: true, clients: true };
const NEITHER = { leads: false, clients: false };

describe("buildQuoteListQuery", () => {
  it("always joins both linked record types and selects a real name expression", () => {
    // The join and the selected name no longer depend on search scope (or on anything else) —
    // redaction of a denied row's name happens after this query returns, per row, in
    // src/server-functions/quotes.ts. A page-level "omit the join" shape cannot express that.
    for (const searchScope of [BOTH, NEITHER, { leads: true, clients: false }]) {
      const parts = buildQuoteListQuery({ filters: {}, searchScope });

      expect(parts.joins).toContain("left join leads l on l.id = q.lead_id");
      expect(parts.joins).toContain("left join clients c on c.id = q.client_id");
      expect(parts.companyNameExpression).toBe("coalesce(c.company_name, l.company_name)");
    }
  });

  it("qualifies filter columns so a join cannot make them ambiguous", () => {
    // `leads` has its own `status` column. An unqualified `status = $1` is an error the
    // moment the join exists.
    const parts = buildQuoteListQuery({ filters: { status: "sent" }, searchScope: BOTH });

    expect(parts.where).toContain("q.status = $1");
    expect(parts.values).toEqual(["sent"]);
  });

  it("searches the quote number and every company name in scope", () => {
    const parts = buildQuoteListQuery({ filters: {}, search: "Acme", searchScope: BOTH });

    expect(parts.where).toContain("coalesce(q.number, '') ilike $1");
    expect(parts.where).toContain("coalesce(c.company_name, '') ilike $1");
    expect(parts.where).toContain("coalesce(l.company_name, '') ilike $1");
    expect(parts.values).toEqual(["%Acme%"]);
  });

  it("does not search a company name the actor may not see at all", () => {
    // The oracle. Without this, a denied actor types a company name and learns from the
    // result count whether a lead by that name exists, even though it is never rendered — the
    // join being unconditional now makes this the only place left that can close it.
    const parts = buildQuoteListQuery({
      filters: {},
      search: "Acme",
      searchScope: { leads: false, clients: true },
    });

    expect(parts.where).toContain("coalesce(q.number, '') ilike $1");
    expect(parts.where).toContain("coalesce(c.company_name, '') ilike $1");
    expect(parts.where).not.toContain("l.company_name");
    // The join itself is still present — only the search predicate is scoped.
    expect(parts.joins).toContain("leads");
  });

  it("numbers the search parameter after the filter parameters", () => {
    const parts = buildQuoteListQuery({
      filters: { status: "sent", lead_id: "lead-1" },
      search: "Acme",
      searchScope: BOTH,
    });

    expect(parts.where).toContain("q.status = $1");
    expect(parts.where).toContain("q.lead_id = $2");
    expect(parts.where).toContain("ilike $3");
    expect(parts.values).toEqual(["sent", "lead-1", "%Acme%"]);
  });

  it("escapes LIKE metacharacters instead of letting them match everything", () => {
    const parts = buildQuoteListQuery({ filters: {}, search: "100%_x", searchScope: BOTH });
    expect(parts.values).toEqual(["%100\\%\\_x%"]);
  });

  it("adds no predicate for a blank search", () => {
    // Must not degrade into `ilike '%%'`, which matches every row and quietly turns the
    // tiles into a workspace-wide total.
    for (const search of ["", "   ", undefined]) {
      const parts = buildQuoteListQuery({ filters: {}, search, searchScope: BOTH });
      expect(parts.where).toBe("");
      expect(parts.values).toEqual([]);
    }
  });

  it("caps an overlong search rather than passing it through", () => {
    const parts = buildQuoteListQuery({ filters: {}, search: "a".repeat(500), searchScope: BOTH });
    expect(parts.values).toEqual([`%${"a".repeat(100)}%`]);
  });

  it("does not search the client company name when clients are out of scope", () => {
    // The mirror of the leads case. Without it, a regression that special-cases one
    // record type — swapped conditionals, say — would go uncaught.
    const parts = buildQuoteListQuery({
      filters: {},
      search: "Acme",
      searchScope: { leads: true, clients: false },
    });

    expect(parts.where).not.toContain("c.company_name");
    expect(parts.joins).toContain("clients");
  });

  it("searches only the quote number when neither record type is in scope", () => {
    const parts = buildQuoteListQuery({ filters: {}, search: "Acme", searchScope: NEITHER });

    expect(parts.where).toContain("coalesce(q.number, '') ilike $1");
    expect(parts.where).not.toContain("company_name");
    expect(parts.values).toEqual(["%Acme%"]);
  });

  it("combines filters and search under a restricted search scope", () => {
    // The shape the real caller produces: an accounting user, who lacks leads.view entirely,
    // typing in the search box. The pieces are each tested; this is the combination.
    const parts = buildQuoteListQuery({
      filters: { status: "sent", lead_id: "lead-1" },
      search: "Acme",
      searchScope: { leads: false, clients: true },
    });

    expect(parts.where).toContain("q.status = $1");
    expect(parts.where).toContain("q.lead_id = $2");
    expect(parts.where).toContain("ilike $3");
    expect(parts.where).not.toContain("l.company_name");
    expect(parts.values).toEqual(["sent", "lead-1", "%Acme%"]);
  });
});
