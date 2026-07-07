import { describe, expect, it } from "vitest";

import { parseEventAttendeeCsv, validateEventImportRows } from "../event-import";

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
});
