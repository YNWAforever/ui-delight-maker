import { describe, expect, it } from "vitest";

import {
  parseEventAttendeeCsv,
  resolveMatchedAccountIds,
  validateEventImportRows,
} from "../event-import";

describe("event import", () => {
  it("parses attendee csv rows", () => {
    const rows = parseEventAttendeeCsv(
      'company_name,contact_name,email,attendee_status,interests\nFimmick,Ada Wong,ada@example.com,attended,"CRM; AI"',
    );

    expect(rows).toEqual([
      {
        company_name: "Fimmick",
        contact_name: "Ada Wong",
        email: "ada@example.com",
        phone: "",
        attendee_status: "attended",
        interests: ["CRM", "AI"],
        notes: "",
      },
    ]);
  });

  it("rejects rows without company or contact name", () => {
    const result = validateEventImportRows({
      rows: [
        {
          company_name: "",
          contact_name: "",
          email: "",
          phone: "",
          attendee_status: "attended",
          interests: [],
          notes: "",
        },
      ],
      accounts: [],
    });

    expect(result.errors).toEqual([{ index: 0, reason: "Company or contact name is required." }]);
    expect(result.valid).toEqual([]);
  });

  it("rejects rows with invalid attendee status", () => {
    const result = validateEventImportRows({
      rows: [
        {
          company_name: "Fimmick",
          contact_name: "Ada Wong",
          email: "ada@example.com",
          phone: "",
          attendee_status: "registered",
          interests: [],
          notes: "",
        },
      ],
      accounts: [],
    });

    expect(result.errors).toEqual([
      { index: 0, reason: "Attendee status must be attended, met, high_intent, or unknown." },
    ]);
    expect(result.valid).toEqual([]);
  });

  it("rejects duplicate attendees in the same file", () => {
    const result = validateEventImportRows({
      rows: [
        {
          company_name: "Fimmick",
          contact_name: "Ada Wong",
          email: "ada@example.com",
          phone: "",
          attendee_status: "attended",
          interests: [],
          notes: "",
        },
        {
          company_name: " fimmick ",
          contact_name: "Someone Else",
          email: " ADA@EXAMPLE.COM ",
          phone: "",
          attendee_status: "met",
          interests: [],
          notes: "",
        },
      ],
      accounts: [],
    });

    expect(result.errors).toEqual([{ index: 1, reason: "Duplicate attendee in file." }]);
    expect(result.valid).toHaveLength(1);
  });

  it("matches an existing account contact by email", () => {
    const result = validateEventImportRows({
      rows: [
        {
          company_name: "Fimmick",
          contact_name: "Ada Wong",
          email: " ADA@EXAMPLE.COM ",
          phone: "",
          attendee_status: "attended",
          interests: [],
          notes: "",
        },
      ],
      accounts: [{ id: "account-1", name: "Fimmick" }],
      accountContacts: [
        {
          id: "contact-1",
          account_id: "account-1",
          name: "Ada Wong",
          email: "ada@example.com",
        },
      ],
    });

    expect(result.errors).toEqual([]);
    expect(result.valid[0].contact_match).toEqual({
      kind: "matched",
      contactId: "contact-1",
      matchedBy: "email",
    });
  });

  it("rejects ambiguous account matches for manual review", () => {
    const result = validateEventImportRows({
      rows: [
        {
          company_name: "Fimmick Limited",
          contact_name: "Ada Wong",
          email: "ada@example.com",
          phone: "",
          attendee_status: "attended",
          interests: [],
          notes: "",
        },
      ],
      accounts: [
        { id: "account-1", name: "Fimmick" },
        { id: "account-2", name: "Fimmick Ltd" },
      ],
      accountContacts: [],
    });

    expect(result.errors).toEqual([
      { index: 0, reason: "Ambiguous account match requires manual review." },
    ]);
    expect(result.valid).toEqual([]);
  });
});

/**
 * The loader uses this to fetch contacts for the matched accounts only, instead of reading every
 * active contact in the tenant. It has to agree with what the validation pass then does, so the
 * two run the same matcher over the same candidates.
 */
describe("resolveMatchedAccountIds", () => {
  const row = (company_name: string) => ({
    company_name,
    contact_name: "Ada Wong",
    email: "",
    phone: "",
    attendee_status: "attended",
    interests: [],
    notes: "",
  });

  const accounts = [
    { id: "account-1", name: "Fimmick Limited" },
    { id: "account-2", name: "Apex CRM" },
    { id: "account-3", name: "Unrelated Holdings" },
  ];

  it("returns the accounts the rows matched, without duplicates", () => {
    expect(
      resolveMatchedAccountIds({
        rows: [row("Fimmick"), row("fimmick ltd"), row("Apex CRM")],
        accounts,
      }),
    ).toEqual(["account-1", "account-2"]);
  });

  it("omits accounts for rows that match nothing", () => {
    expect(resolveMatchedAccountIds({ rows: [row("Brand New Company")], accounts })).toEqual([]);
  });

  it("omits ambiguous matches, which validation rejects rather than resolves", () => {
    const ambiguous = [
      { id: "account-1", name: "Fimmick" },
      { id: "account-2", name: "Fimmick Ltd" },
    ];

    expect(
      resolveMatchedAccountIds({ rows: [row("Fimmick Limited")], accounts: ambiguous }),
    ).toEqual([]);
  });

  it("agrees with the account ids validation goes on to use", () => {
    const rows = [row("Fimmick"), row("Apex CRM"), row("Brand New Company")];
    const resolved = resolveMatchedAccountIds({ rows, accounts });
    const validated = validateEventImportRows({ rows, accounts, accountContacts: [] })
      .valid.map((valid) =>
        valid.account_match.kind === "matched" ? valid.account_match.accountId : null,
      )
      .filter((id): id is string => id !== null);

    expect(resolved).toEqual([...new Set(validated)]);
  });
});
