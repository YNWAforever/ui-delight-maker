import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  queryMock,
  queryOneMock,
  evaluateCapabilityChecksMock,
  requireCapabilityChecksMock,
  requireCapabilityMock,
  createServerFnChain,
} = vi.hoisted(() => {
  const createServerFnChain = {
    validator() {
      return createServerFnChain;
    },
    handler<T extends (...args: never[]) => unknown>(handler: T) {
      return handler;
    },
  };

  return {
    queryMock: vi.fn(),
    queryOneMock: vi.fn(),
    evaluateCapabilityChecksMock: vi.fn(),
    requireCapabilityChecksMock: vi.fn(),
    requireCapabilityMock: vi.fn(),
    createServerFnChain,
  };
});

vi.mock("@tanstack/react-start", () => ({ createServerFn: () => createServerFnChain }));
vi.mock("@/server/auth/authorization.server", () => ({
  evaluateCapabilityChecks: evaluateCapabilityChecksMock,
  requireCapabilityChecks: requireCapabilityChecksMock,
  requireCapability: requireCapabilityMock,
}));
vi.mock("@/server/db/neon.server", () => ({ query: queryMock, queryOne: queryOneMock }));

function sqlText(value: unknown) {
  return String(value).replace(/\s+/g, " ").trim().toLowerCase();
}

const quote = {
  id: "quote-1",
  number: "Q-001",
  lead_id: "lead-1",
  client_id: "client-1",
  accepted_version_id: "version-accepted",
  issued_version_id: "version-issued",
  status: "accepted",
  line_items: [],
};

// buildNormalizedQuoteSnapshot spreads the whole quote row in, so a stored snapshot carries its
// own copy of lead_id — that copy is what the degraded document read has to strip.
const immutableSnapshot = { id: "quote-1", number: "Q-001", lead_id: "lead-1", line_items: [] };

describe("quote workspace read models", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCapabilityChecksMock.mockResolvedValue({
      user: { id: "user-1" },
      profile: { id: "user-1", role: "sales", status: "active" },
      session: {},
    });
    requireCapabilityMock.mockResolvedValue({
      user: { id: "user-1" },
      profile: { id: "user-1", role: "sales", status: "active" },
      session: {},
    });
    evaluateCapabilityChecksMock.mockResolvedValue([{ allowed: true, reason: "role_grant" }]);

    queryOneMock.mockImplementation((sql: unknown, values?: unknown[]) => {
      const text = sqlText(sql);
      if (text.includes("count(*) as total")) return Promise.resolve({ total: "1" });
      if (text.includes("from quotes")) return Promise.resolve(quote);
      if (text.includes("from clients")) {
        return Promise.resolve({ id: "client-1", company_name: "Acme Client" });
      }
      if (text.includes("from leads")) {
        const id = values?.[0] === "lead-selected" ? "lead-selected" : "lead-1";
        return Promise.resolve({ id, company_name: "Acme Lead", contact_name: "Ada" });
      }
      return Promise.resolve(null);
    });

    queryMock.mockImplementation((sql: unknown, values?: unknown[]) => {
      const text = sqlText(sql);
      if (text.includes("from pricing_templates")) {
        return Promise.resolve([
          {
            id: "pricing-1",
            service: "Strategy",
            unit_price: 1000,
            product_id: values?.[0] ?? null,
          },
        ]);
      }
      if (text.includes("from quote_templates")) {
        return Promise.resolve([{ id: "template-1", name: "Standard" }]);
      }
      if (text.includes("from pdf_templates")) {
        return Promise.resolve([{ id: "pdf-1", name: "Brand", document_type: "quote" }]);
      }
      if (text.includes("from leads")) {
        return Promise.resolve([{ id: "lead-1", company_name: "Acme Lead", contact_name: "Ada" }]);
      }
      if (text.includes("from clients")) {
        return Promise.resolve([{ id: "client-1", company_name: "Acme Client" }]);
      }
      if (text.includes("from products")) {
        return Promise.resolve([{ id: "product-1", name: "Retainer", billing_type: "retainer" }]);
      }
      if (text.includes("from quote_versions")) {
        return Promise.resolve([
          {
            id: "version-accepted",
            quote_id: "quote-1",
            version_number: 4,
            reason: "accepted",
            snapshot: immutableSnapshot,
          },
        ]);
      }
      return Promise.resolve([]);
    });
  });

  it("loads bounded templates and compact initial reference pages", async () => {
    const { loadQuoteCreateBootstrap } = await import("../quote-workspace");

    const result = await loadQuoteCreateBootstrap({ productId: "product-selected" });

    expect(result.pricingTemplates).toHaveLength(1);
    expect(result.quoteTemplates).toHaveLength(1);
    expect(result.pdfTemplates).toHaveLength(1);
    expect(result.leads).toMatchObject({ total: 1, page: 1, limit: 25 });
    expect(result.clients).toMatchObject({ total: 1, page: 1, limit: 25 });
    expect(result.products).toMatchObject({ total: 1, page: 1, limit: 25 });

    expect(result.pricingTemplates[0]).toMatchObject({ product_id: "product-selected" });
    expect(new Set(result.products.items.map((item) => item.id)).size).toBe(
      result.products.items.length,
    );

    for (const table of ["pricing_templates", "quote_templates", "pdf_templates"]) {
      const call = queryMock.mock.calls.find(([sql]) => sqlText(sql).includes(`from ${table}`));
      expect(sqlText(call?.[0])).not.toContain("select *");
      expect(sqlText(call?.[0])).toMatch(/order by .*id.*limit \$\d+/);
      expect(call?.[1]).toContain(10);
    }
  });

  it("searches and paginates each compact reference kind with a selected row", async () => {
    const { listQuoteReferencePage } = await import("@/server/repositories/quotes");
    queryMock.mockImplementation((sql: unknown) => {
      if (sqlText(sql).includes("from leads")) {
        return Promise.resolve(
          Array.from({ length: 25 }, (_, index) => ({
            id: "lead-" + (index + 1),
            company_name: "Needle " + (index + 1),
            contact_name: null,
          })),
        );
      }
      return Promise.resolve([]);
    });
    queryOneMock.mockImplementation((sql: unknown, values?: unknown[]) => {
      const text = sqlText(sql);
      if (text.includes("count(*) as total")) return Promise.resolve({ total: "25" });
      if (text.includes("from leads") && values?.[0] === "lead-selected") {
        return Promise.resolve({
          id: "lead-selected",
          company_name: "Pinned company",
          contact_name: "Ada",
        });
      }
      return Promise.resolve(null);
    });

    const page = await listQuoteReferencePage({
      kind: "lead",
      search: "needle",
      selectedId: "lead-selected",
      page: 2,
      limit: 500,
    });

    expect(page).toMatchObject({ total: 26, page: 2, limit: 25 });
    expect(page.items).toHaveLength(26);
    expect(page.items.at(-1)?.id).toBe("lead-25");
    expect(new Set(page.items.map((item) => item.id)).size).toBe(page.items.length);
    const rowsCall = queryMock.mock.calls.find(([sql]) => sqlText(sql).includes("from leads"));
    const rowsSql = sqlText(rowsCall?.[0]);
    expect(rowsSql).not.toContain("select *");
    expect(rowsSql).toContain("id::text ilike");
    expect(rowsSql).toContain("company_name ilike");
    expect(rowsSql).toMatch(/order by .*company_name.*id.*limit \$\d+ offset \$\d+/);
    expect(rowsCall?.[1]).toEqual(expect.arrayContaining(["%needle%", 25, 25]));
    const selectedCall = queryOneMock.mock.calls.find(
      ([sql, values]) => sqlText(sql).includes("from leads") && values?.[0] === "lead-selected",
    );
    expect(sqlText(selectedCall?.[0])).toContain("where id = $1");
  });

  it("loads quote detail with compact linked parties and no versions or templates", async () => {
    const { getQuoteWorkspaceDetail } = await import("@/server/repositories/quotes");

    await expect(getQuoteWorkspaceDetail("quote-1")).resolves.toEqual({
      quote,
      client: { id: "client-1", company_name: "Acme Client" },
      lead: { id: "lead-1", company_name: "Acme Lead", contact_name: "Ada" },
    });

    expect(queryMock.mock.calls.some(([sql]) => sqlText(sql).includes("quote_versions"))).toBe(
      false,
    );
    expect(queryMock.mock.calls.some(([sql]) => sqlText(sql).includes("templates"))).toBe(false);
    const quoteCall = queryOneMock.mock.calls.find(([sql]) => sqlText(sql).includes("from quotes"));
    expect(sqlText(quoteCall?.[0])).not.toContain("select *");
  });

  it("loads a deterministic quote-scoped version page capped at 25", async () => {
    const { listQuoteVersionSummariesPage } = await import("@/server/repositories/quote-versions");

    const result = await listQuoteVersionSummariesPage("quote-1", { page: 2, limit: 200 });

    expect(result).toMatchObject({ total: 1, page: 2, limit: 25 });
    expect(result.items[0]).not.toHaveProperty("snapshot");
    const rowsCall = queryMock.mock.calls.find(([sql]) => sqlText(sql).includes("quote_versions"));
    expect(sqlText(rowsCall?.[0])).toMatch(
      /where quote_id = \$1.*order by version_number desc, id desc.*limit \$2 offset \$3/,
    );
    expect(rowsCall?.[1]).toEqual(["quote-1", 25, 25]);
  });

  it("uses only the accepted immutable snapshot for document rendering", async () => {
    const { loadQuoteDocumentRead } = await import("../quote-workspace");

    const result = await loadQuoteDocumentRead("quote-1");

    expect(result).toEqual({
      quote,
      versions: [expect.objectContaining({ id: "version-accepted", snapshot: immutableSnapshot })],
      client: { id: "client-1", company_name: "Acme Client" },
      lead: { id: "lead-1", company_name: "Acme Lead", contact_name: "Ada" },
    });
    const versionCall = queryMock.mock.calls.find(([sql]) =>
      sqlText(sql).includes("quote_versions"),
    );
    expect(sqlText(versionCall?.[0])).toContain("id = $2");
    expect(sqlText(versionCall?.[0])).toContain("limit $3");
    expect(versionCall?.[1]).toEqual(["quote-1", "version-accepted", 1]);
  });

  it.each([
    ["sent", "version-issued"],
    ["viewed", "version-issued"],
    ["accepted", "version-accepted"],
  ])("resolves the immutable %s document pointer", async (status, expectedVersionId) => {
    queryOneMock.mockImplementation((sql: unknown, values?: unknown[]) => {
      const text = sqlText(sql);
      if (text.includes("from quotes")) return Promise.resolve({ ...quote, status });
      return Promise.resolve(null);
    });
    const { loadQuoteDocumentRead } = await import("../quote-workspace");

    await loadQuoteDocumentRead("quote-1");

    const versionCall = queryMock.mock.calls.find(([sql]) =>
      sqlText(sql).includes("quote_versions"),
    );
    expect(versionCall?.[1]).toEqual(["quote-1", expectedVersionId, 1]);
  });

  it("keeps live draft preview when no immutable version exists", async () => {
    queryOneMock.mockImplementation((sql: unknown) => {
      const text = sqlText(sql);
      if (text.includes("from quotes")) {
        return Promise.resolve({
          ...quote,
          status: "draft",
          accepted_version_id: null,
          issued_version_id: null,
        });
      }
      return Promise.resolve(null);
    });
    const { loadQuoteDocumentRead } = await import("../quote-workspace");

    await expect(loadQuoteDocumentRead("quote-1")).resolves.toMatchObject({
      quote: { id: "quote-1", status: "draft" },
      versions: [],
      client: null,
      lead: null,
    });
    expect(queryMock.mock.calls.some(([sql]) => sqlText(sql).includes("quote_versions"))).toBe(
      false,
    );
  });
  it("fails closed when an accepted quote has no accepted snapshot pointer", async () => {
    queryOneMock.mockImplementation((sql: unknown, values?: unknown[]) => {
      if (sqlText(sql).includes("from quotes")) {
        return Promise.resolve({ ...quote, accepted_version_id: null, status: "accepted" });
      }
      return Promise.resolve(null);
    });
    const { loadQuoteDocumentRead } = await import("../quote-workspace");

    await expect(loadQuoteDocumentRead("quote-1")).rejects.toThrow(
      "Accepted quote has no immutable accepted version",
    );
    expect(queryMock.mock.calls.some(([sql]) => sqlText(sql).includes("quote_versions"))).toBe(
      false,
    );
  });

  it("fails closed for missing, cross-quote, or malformed immutable snapshots", async () => {
    const { loadQuoteDocumentRead } = await import("../quote-workspace");

    for (const versions of [
      [],
      [{ id: "version-accepted", quote_id: "quote-other", snapshot: immutableSnapshot }],
      [{ id: "version-accepted", quote_id: "quote-1", snapshot: { number: "Q-001" } }],
    ]) {
      queryMock.mockImplementation((sql: unknown) =>
        sqlText(sql).includes("quote_versions") ? Promise.resolve(versions) : Promise.resolve([]),
      );
      await expect(loadQuoteDocumentRead("quote-1")).rejects.toThrow(/immutable quote snapshot/i);
    }
  });
  it("uses one shared authorization context and targets quote reads", async () => {
    const {
      getQuoteCreateBootstrap,
      getQuoteDetailRead,
      getQuoteDocumentRead,
      getQuoteReferencePage,
      getQuoteVersionsSection,
    } = await import("@/server-functions/quote-workspace");

    await getQuoteCreateBootstrap({ data: {} });
    expect(requireCapabilityChecksMock).toHaveBeenLastCalledWith([
      { capability: "quotes.view" },
      { capability: "leads.view" },
      { capability: "accounts.view" },
      { capability: "products.view" },
    ]);

    await getQuoteReferencePage({ data: { kind: "client", selectedId: "client-1" } });
    expect(requireCapabilityChecksMock).toHaveBeenLastCalledWith([
      { capability: "quotes.view" },
      { capability: "accounts.view" },
    ]);

    for (const call of [
      () => getQuoteDetailRead({ data: { id: "quote-1" } }),
      () => getQuoteDocumentRead({ data: { id: "quote-1" } }),
    ]) {
      requireCapabilityMock.mockClear();
      evaluateCapabilityChecksMock.mockClear();
      await call();
      expect(requireCapabilityMock).toHaveBeenNthCalledWith(1, "quotes.view", {
        resourceType: "quote",
        resourceId: "quote-1",
      });
      expect(requireCapabilityMock).toHaveBeenNthCalledWith(2, "accounts.view", {
        resourceType: "client",
        resourceId: "client-1",
      });
      expect(evaluateCapabilityChecksMock).toHaveBeenLastCalledWith([
        { capability: "leads.view", target: { resourceType: "lead", resourceId: "lead-1" } },
      ]);
    }

    requireCapabilityChecksMock.mockClear();
    await getQuoteVersionsSection({ data: { id: "quote-1", page: 1 } });
    expect(requireCapabilityMock).toHaveBeenLastCalledWith("quotes.view", {
      resourceType: "quote",
      resourceId: "quote-1",
    });
    expect(requireCapabilityChecksMock).not.toHaveBeenCalled();
  });

  it("strips every trace of the lead from a read the actor may not see it on", async () => {
    const { getQuoteDetailRead, getQuoteDocumentRead } =
      await import("@/server-functions/quote-workspace");
    evaluateCapabilityChecksMock.mockResolvedValue([{ allowed: false, reason: "no_grant" }]);

    const detailRead = await getQuoteDetailRead({ data: { id: "quote-1" } });
    expect(detailRead.lead).toBeNull();
    expect(detailRead.quote.lead_id).toBeNull();
    // Still a quote, not an empty shell.
    expect(detailRead.quote).toMatchObject({ id: "quote-1", number: "Q-001" });

    const documentRead = await getQuoteDocumentRead({ data: { id: "quote-1" } });
    expect(documentRead.lead).toBeNull();
    expect(documentRead.quote.lead_id).toBeNull();
    expect(documentRead.versions).toHaveLength(1);
    expect(documentRead.versions[0].snapshot).toMatchObject({ id: "quote-1", lead_id: null });

    // No corner of either payload may still carry the denied lead's identifier...
    expect(JSON.stringify(detailRead)).not.toContain("lead-1");
    expect(JSON.stringify(documentRead)).not.toContain("lead-1");
    // ...and nothing was written back: this is response shaping over an immutable version.
    expect(immutableSnapshot.lead_id).toBe("lead-1");
  });
});
