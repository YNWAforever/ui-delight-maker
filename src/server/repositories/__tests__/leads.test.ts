import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `convertWonLeadToEngagement` is the only won-lead → client/engagement conversion path, and the
 * parts worth pinning are the ones invisible in a plain read: concurrent conversions of the same
 * company must serialise before the check-then-insert, and a lead with no email must dedupe
 * against a stored NULL-email contact instead of creating a duplicate on every conversion.
 */
const { transactionMock, clientQueryMock, createClientMock, createClientContactMock } = vi.hoisted(
  () => ({
    transactionMock: vi.fn(),
    clientQueryMock: vi.fn(),
    createClientMock: vi.fn(),
    createClientContactMock: vi.fn(),
  }),
);

vi.mock("@/server/db/neon.server", () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  transaction: transactionMock,
}));
vi.mock("@/server/repositories/clients", () => ({ createClient: createClientMock }));
vi.mock("@/server/repositories/client-contacts", () => ({
  createClientContact: createClientContactMock,
}));
vi.mock("@/server/repositories/engagements", () => ({
  createEngagement: vi.fn(async () => ({ id: "engagement-1" })),
}));

const { convertWonLeadToEngagement } = await import("../leads");

type World = {
  lead: Record<string, unknown>;
  clientId?: string | null;
  contact?: { id: string } | null;
};

function stubTransaction(world: World) {
  clientQueryMock.mockImplementation(async (sql: string) => {
    const text = String(sql);
    if (text.includes("from leads")) return { rows: [world.lead] };
    if (text.includes("pg_advisory_xact_lock")) return { rows: [] };
    if (text.includes("from clients")) {
      return { rows: world.clientId ? [{ id: world.clientId }] : [] };
    }
    if (text.includes("from client_contacts")) {
      return { rows: world.contact ? [world.contact] : [] };
    }
    return { rows: [] };
  });
}

function sqlIssued(): string[] {
  return clientQueryMock.mock.calls.map(([sql]) => String(sql).replace(/\s+/g, " ").trim());
}

const conversion = {
  leadId: "lead-1",
  actorId: "user-1",
  productId: "product-1",
  billingPeriod: "annual",
} as const;

describe("convertWonLeadToEngagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clientQueryMock.mockReset();
    transactionMock.mockReset();
    transactionMock.mockImplementation(async (work: (db: unknown) => Promise<unknown>) =>
      work({ query: clientQueryMock }),
    );
    createClientMock.mockResolvedValue({ id: "client-new" });
    createClientContactMock.mockResolvedValue({ id: "contact-1" });
  });

  it("locks the normalised company name before the existing-client lookup", async () => {
    stubTransaction({
      lead: { id: "lead-1", company_name: "  Apex CRM  ", contact_name: null, contact_email: null },
    });

    await convertWonLeadToEngagement({ ...conversion });

    const calls = sqlIssued();
    const lockIndex = calls.findIndex((sql) => sql.includes("pg_advisory_xact_lock"));
    const clientLookupIndex = calls.findIndex((sql) =>
      sql.includes("from clients where lower(trim(company_name))"),
    );
    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(clientLookupIndex).toBeGreaterThan(lockIndex);
    // The lock key is the same normalisation the lookup uses, not the raw stored name.
    expect(clientQueryMock.mock.calls[lockIndex]?.[1]).toEqual(["Apex CRM"]);
  });

  it("dedupes a lead without an email against a stored NULL-email contact", async () => {
    stubTransaction({
      lead: { id: "lead-1", company_name: "Apex CRM", contact_name: "Ada", contact_email: null },
      clientId: "client-existing",
      contact: { id: "contact-existing" },
    });

    await convertWonLeadToEngagement({ ...conversion });

    const calls = sqlIssued();
    const contactIndex = calls.findIndex((sql) => sql.includes("from client_contacts"));
    expect(contactIndex).toBeGreaterThanOrEqual(0);
    expect(calls[contactIndex]).toContain("$2::text is null");
    expect(clientQueryMock.mock.calls[contactIndex]?.[1]).toEqual(["client-existing", null]);
    expect(createClientContactMock).not.toHaveBeenCalled();
  });

  it("matches a present email case-insensitively, so casing does not duplicate the contact", async () => {
    stubTransaction({
      lead: {
        id: "lead-1",
        company_name: "Apex CRM",
        contact_name: "Ada",
        contact_email: "ADA@Apex.example",
      },
      clientId: "client-existing",
      contact: null,
    });

    await convertWonLeadToEngagement({ ...conversion });

    const calls = sqlIssued();
    const contactIndex = calls.findIndex((sql) => sql.includes("from client_contacts"));
    expect(calls[contactIndex]).toContain("lower(email) = lower($2)");
    expect(clientQueryMock.mock.calls[contactIndex]?.[1]).toEqual([
      "client-existing",
      "ADA@Apex.example",
    ]);
    expect(createClientContactMock).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: "client-existing", email: "ADA@Apex.example" }),
      expect.anything(),
    );
  });
});
