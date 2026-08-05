import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `commitClientImport` is a multi-table bulk write inside one transaction, driven straight from
 * an uploaded CSV, and it had no coverage at any layer. The behaviours worth pinning are the
 * ones a reader cannot check by hand after the fact: that a repeat company name in the same file
 * reuses the client it just created instead of inserting a second one, that the dedupe key and
 * the SQL predicate agree on normalisation, that contacts and engagements are not duplicated,
 * and that every write shares the transaction client so a failure half-way rolls the batch back.
 */
const mocks = vi.hoisted(() => {
  const fakeDb = { query: vi.fn() };
  return {
    fakeDb,
    transactionMock: vi.fn(async (work: (db: typeof fakeDb) => Promise<unknown>) => work(fakeDb)),
    createClientMock: vi.fn(),
    createClientContactMock: vi.fn(),
    createEngagementMock: vi.fn(),
  };
});

vi.mock("@/server/db/neon.server", () => ({ transaction: mocks.transactionMock }));
vi.mock("@/server/repositories/clients", () => ({ createClient: mocks.createClientMock }));
vi.mock("@/server/repositories/client-contacts", () => ({
  createClientContact: mocks.createClientContactMock,
}));
vi.mock("@/server/repositories/engagements", () => ({
  createEngagement: mocks.createEngagementMock,
}));

import { commitClientImport } from "@/server/repositories/client-import";
import type { ImportRow } from "@/lib/csv-import";

/**
 * Answers the repository's lookups from an in-memory world, so each test states what already
 * exists rather than counting `mockResolvedValueOnce` calls in order.
 */
function stubDatabase(world: {
  clients?: Array<{ id: string; key: string }>;
  contacts?: Array<{ clientId: string; email: string }>;
  products?: Array<{ name: string; id: string; termMonths: number | null }>;
  profiles?: Array<{ email: string; id: string }>;
  engagements?: Array<{ clientId: string; productId: string; startDate: string }>;
}) {
  mocks.fakeDb.query.mockImplementation(async (text: string, values: readonly unknown[] = []) => {
    if (text.includes("from clients")) {
      const match = (world.clients ?? []).find((client) => client.key === values[0]);
      return { rows: match ? [{ id: match.id }] : [] };
    }
    if (text.includes("update clients")) return { rows: [] };
    if (text.includes("from client_contacts")) {
      const match = (world.contacts ?? []).find(
        (contact) =>
          contact.clientId === values[0] &&
          contact.email.toLowerCase() === String(values[1]).toLowerCase(),
      );
      return { rows: match ? [{ id: "contact-existing" }] : [] };
    }
    if (text.includes("from products")) {
      const match = (world.products ?? []).find((product) => product.name === values[0]);
      return { rows: match ? [{ id: match.id, default_term_months: match.termMonths }] : [] };
    }
    if (text.includes("from profiles")) {
      const match = (world.profiles ?? []).find((profile) => profile.email === values[0]);
      return { rows: match ? [{ id: match.id }] : [] };
    }
    if (text.includes("from engagements")) {
      const match = (world.engagements ?? []).find(
        (engagement) =>
          engagement.clientId === values[0] &&
          engagement.productId === values[1] &&
          engagement.startDate === values[2],
      );
      return { rows: match ? [{ id: "engagement-existing" }] : [] };
    }
    return { rows: [] };
  });
}

function row(overrides: Partial<ImportRow> = {}): ImportRow {
  return { company_name: "Apex CRM", ...overrides } as ImportRow;
}

describe("commitClientImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fakeDb.query.mockReset();
    let nextClient = 0;
    mocks.createClientMock.mockImplementation(async () => ({ id: `client-${++nextClient}` }));
    mocks.createClientContactMock.mockResolvedValue({ id: "contact-1" });
    mocks.createEngagementMock.mockResolvedValue({ id: "engagement-1" });
  });

  it("creates one client for repeated company names in the same file", async () => {
    stubDatabase({});

    const result = await commitClientImport(
      [row({ company_name: "Apex CRM" }), row({ company_name: "  apex crm  " })],
      "user-1",
    );

    expect(mocks.createClientMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ created: 1, updated: 0 });
  });

  it("matches an existing client through the same normalisation the dedupe key uses", async () => {
    // The stored name carries stray whitespace and different casing; both sides normalise with
    // trim+lower, so this must update rather than insert a duplicate.
    stubDatabase({ clients: [{ id: "client-existing", key: "apex crm" }] });

    const result = await commitClientImport([row({ company_name: " Apex CRM " })], "user-1");

    expect(mocks.createClientMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ created: 0, updated: 1 });
  });

  it("does not re-add a contact that already exists, case-insensitively", async () => {
    stubDatabase({
      clients: [{ id: "client-existing", key: "apex crm" }],
      contacts: [{ clientId: "client-existing", email: "ada@apex.example" }],
    });

    await commitClientImport([row({ contact_email: "ADA@apex.example" })], "user-1");

    expect(mocks.createClientContactMock).not.toHaveBeenCalled();
  });

  it("creates an engagement with the product's term and the owner resolved by email", async () => {
    stubDatabase({
      products: [{ name: "Retention Suite", id: "product-1", termMonths: 24 }],
      profiles: [{ email: "owner@fimmick.com", id: "profile-owner" }],
    });

    await commitClientImport(
      [
        row({
          product_name: "Retention Suite",
          start_date: "2026-01-15",
          owner_email: "owner@fimmick.com",
          value: "48000",
          billing_period: "quarterly",
        }),
      ],
      "user-1",
    );

    expect(mocks.createEngagementMock).toHaveBeenCalledWith(
      expect.objectContaining({
        product_id: "product-1",
        owner: "profile-owner",
        billing_period: "quarterly",
        start_date: "2026-01-15",
        renewal_date: "2028-01-15",
        value: 48000,
      }),
      mocks.fakeDb,
    );
  });

  it("falls back to a monthly billing period when the CSV value is not a known one", async () => {
    stubDatabase({ products: [{ name: "Retention Suite", id: "product-1", termMonths: null }] });

    await commitClientImport(
      [
        row({
          product_name: "Retention Suite",
          start_date: "2026-01-15",
          billing_period: "weekly",
        }),
      ],
      "user-1",
    );

    expect(mocks.createEngagementMock).toHaveBeenCalledWith(
      expect.objectContaining({ billing_period: "monthly", renewal_date: "2027-01-15" }),
      mocks.fakeDb,
    );
  });

  it("skips an engagement that already exists for the same client, product and start date", async () => {
    stubDatabase({
      clients: [{ id: "client-existing", key: "apex crm" }],
      products: [{ name: "Retention Suite", id: "product-1", termMonths: 12 }],
      engagements: [
        { clientId: "client-existing", productId: "product-1", startDate: "2026-01-15" },
      ],
    });

    await commitClientImport(
      [row({ product_name: "Retention Suite", start_date: "2026-01-15" })],
      "user-1",
    );

    expect(mocks.createEngagementMock).not.toHaveBeenCalled();
  });

  it("runs every write on the transaction client and logs the outcome once", async () => {
    stubDatabase({ products: [{ name: "Retention Suite", id: "product-1", termMonths: 12 }] });

    const result = await commitClientImport(
      [
        row({
          contact_email: "ada@apex.example",
          product_name: "Retention Suite",
          start_date: "2026-01-15",
        }),
      ],
      "user-1",
    );

    expect(mocks.transactionMock).toHaveBeenCalledTimes(1);
    for (const create of [
      mocks.createClientMock,
      mocks.createClientContactMock,
      mocks.createEngagementMock,
    ]) {
      expect(create).toHaveBeenCalledWith(expect.anything(), mocks.fakeDb);
    }

    const auditCalls = mocks.fakeDb.query.mock.calls.filter(([text]) =>
      String(text).includes("insert into activity_logs"),
    );
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]![1]).toEqual(["user-1", JSON.stringify(result)]);
  });

  it("propagates a failure so the transaction rolls the whole batch back", async () => {
    stubDatabase({});
    mocks.createClientMock.mockRejectedValueOnce(new Error("insert failed"));

    await expect(commitClientImport([row()], "user-1")).rejects.toThrow("insert failed");

    const auditCalls = mocks.fakeDb.query.mock.calls.filter(([text]) =>
      String(text).includes("insert into activity_logs"),
    );
    expect(auditCalls).toHaveLength(0);
  });
});
