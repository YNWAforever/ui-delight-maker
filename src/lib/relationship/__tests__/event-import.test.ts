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
});
