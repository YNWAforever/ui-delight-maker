import { describe, expect, it } from "vitest";

import { resolveQuotePdfSource } from "@/components/quotes/quote-pdf-preview";
import type { Quote, QuoteVersion } from "@/lib/types";

const liveLineItems = [
  {
    id: "line-live-1",
    service: "Strategy",
    description: "Mutable draft row",
    qty: 2,
    unit_price: 500,
  },
];

function makeQuote(overrides: Partial<Quote> = {}): Quote {
  return {
    id: "quote-1",
    number: "Q-001",
    lead_id: null,
    client_id: "client-1",
    contact_id: null,
    account_id: null,
    deal_id: null,
    status: "draft",
    quote_template_id: null,
    accepted_version_id: null,
    issued_version_id: null,
    document_sections: [],
    cover_text: "Live cover",
    assumptions: "Live assumptions",
    payment_terms: "Live payment terms",
    accepted_at: null,
    accepted_by: null,
    parent_quote_id: null,
    change_order_reason: null,
    total_value: 1000,
    currency: "HKD",
    valid_until: "2026-07-31",
    line_items: liveLineItems,
    pdf_url: null,
    created_by: null,
    approved_by: null,
    created_at: "2026-07-09T00:00:00.000Z",
    updated_at: "2026-07-09T00:00:00.000Z",
    ...overrides,
  };
}

function makeVersion(overrides: Partial<QuoteVersion> = {}): QuoteVersion {
  return {
    id: "version-1",
    quote_id: "quote-1",
    version_number: 1,
    reason: "issued",
    snapshot: {
      number: "Q-001",
      currency: "HKD",
      total_value: 1200,
      valid_until: "2026-08-15",
      cover_text: "Snapshot cover",
      assumptions: "Snapshot assumptions",
      payment_terms: "Snapshot payment terms",
      document_sections: [],
      line_items: [
        {
          id: "line-snapshot-1",
          service: "Immutable row",
          description: "Snapshot row",
          qty: 3,
          unit_price: 400,
        },
      ],
    },
    pdf_template_id: null,
    pdf_url: null,
    created_by: null,
    created_at: "2026-07-09T00:00:00.000Z",
    ...overrides,
  };
}

describe("resolveQuotePdfSource", () => {
  it("returns the referenced immutable snapshot for accepted or issued quotes", () => {
    const version = makeVersion({ id: "accepted-version-1", reason: "accepted" });
    const result = resolveQuotePdfSource(
      makeQuote({
        status: "accepted",
        accepted_version_id: "accepted-version-1",
      }),
      [version],
    );

    expect(result.state).toBe("snapshot");
    expect(result.sourceVersion?.id).toBe("accepted-version-1");
    expect(result.quote?.total_value).toBe(1200);
    expect(result.lineItems).toEqual([
      expect.objectContaining({
        id: "line-snapshot-1",
        service: "Immutable row",
        qty: 3,
        unit_price: 400,
      }),
    ]);
  });

  it("fails closed when an accepted snapshot pointer is missing", () => {
    const result = resolveQuotePdfSource(
      makeQuote({
        status: "accepted",
        accepted_version_id: "accepted-version-1",
      }),
      [],
    );

    expect(result.state).toBe("invalid");
    expect(result.error).toEqual({
      code: "missing_immutable_snapshot",
      versionId: "accepted-version-1",
      versionReason: "accepted",
    });
    expect(result.quote).toBeNull();
    expect(result.lineItems).toEqual([]);
  });

  it("fails closed when an issued snapshot is malformed", () => {
    const result = resolveQuotePdfSource(
      makeQuote({
        status: "sent",
        issued_version_id: "issued-version-1",
      }),
      [
        makeVersion({
          id: "issued-version-1",
          reason: "issued",
          snapshot: "not-a-snapshot",
        }),
      ],
    );

    expect(result.state).toBe("invalid");
    expect(result.error).toEqual({
      code: "invalid_immutable_snapshot",
      versionId: "issued-version-1",
      versionReason: "issued",
    });
    expect(result.quote).toBeNull();
    expect(result.lineItems).toEqual([]);
  });

  it("fails closed when an immutable snapshot object is missing total_value", () => {
    const result = resolveQuotePdfSource(
      makeQuote({
        status: "accepted",
        accepted_version_id: "accepted-version-1",
      }),
      [
        makeVersion({
          id: "accepted-version-1",
          reason: "accepted",
          snapshot: {
            number: "Q-001",
            currency: "HKD",
            valid_until: "2026-08-15",
            cover_text: "Snapshot cover",
            assumptions: "Snapshot assumptions",
            payment_terms: "Snapshot payment terms",
            document_sections: [],
            line_items: [],
          },
        }),
      ],
    );

    expect(result.state).toBe("invalid");
    expect(result.error).toEqual({
      code: "invalid_immutable_snapshot",
      versionId: "accepted-version-1",
      versionReason: "accepted",
    });
    expect(result.quote).toBeNull();
    expect(result.lineItems).toEqual([]);
  });

  it("fails closed when an immutable snapshot object is missing line_items", () => {
    const result = resolveQuotePdfSource(
      makeQuote({
        status: "sent",
        issued_version_id: "issued-version-1",
      }),
      [
        makeVersion({
          id: "issued-version-1",
          reason: "issued",
          snapshot: {
            number: "Q-001",
            currency: "HKD",
            total_value: 1200,
            valid_until: "2026-08-15",
            cover_text: "Snapshot cover",
            assumptions: "Snapshot assumptions",
            payment_terms: "Snapshot payment terms",
            document_sections: [],
          },
        }),
      ],
    );

    expect(result.state).toBe("invalid");
    expect(result.error).toEqual({
      code: "invalid_immutable_snapshot",
      versionId: "issued-version-1",
      versionReason: "issued",
    });
    expect(result.quote).toBeNull();
    expect(result.lineItems).toEqual([]);
  });

  it("returns live draft data when no immutable snapshot is required", () => {
    const quote = makeQuote();
    const result = resolveQuotePdfSource(quote, [makeVersion()]);

    expect(result.state).toBe("live");
    expect(result.sourceVersion).toBeNull();
    expect(result.quote).toMatchObject({
      total_value: 1000,
      cover_text: "Live cover",
    });
    expect(result.lineItems).toBe(quote.line_items);
  });

  it.each([
    {
      status: "draft" as const,
      pointerField: "issued_version_id" as const,
      pointerValue: "issued-version-1",
    },
    {
      status: "revised" as const,
      pointerField: "accepted_version_id" as const,
      pointerValue: "accepted-version-1",
    },
  ])(
    "returns live mutable data for $status quotes even when $pointerField still points at an older immutable snapshot",
    ({ status, pointerField, pointerValue }) => {
      const quote = makeQuote({
        status,
        [pointerField]: pointerValue,
        cover_text: "Reopened draft cover",
        total_value: 1000,
      });
      const result = resolveQuotePdfSource(quote, [
        makeVersion({
          id: pointerValue,
          reason: pointerField === "accepted_version_id" ? "accepted" : "issued",
          snapshot: {
            number: "Q-001",
            currency: "HKD",
            total_value: 2400,
            valid_until: "2026-08-15",
            cover_text: "Old immutable cover",
            assumptions: "Old immutable assumptions",
            payment_terms: "Old immutable payment terms",
            document_sections: [],
            line_items: [
              {
                id: "line-old-1",
                service: "Old immutable row",
                description: "Old snapshot row",
                qty: 6,
                unit_price: 400,
              },
            ],
          },
        }),
      ]);

      expect(result.state).toBe("live");
      expect(result.sourceVersion).toBeNull();
      expect(result.quote).toMatchObject({
        cover_text: "Reopened draft cover",
        total_value: 1000,
      });
      expect(result.lineItems).toBe(quote.line_items);
      expect(result.lineItems).toEqual([
        expect.objectContaining({
          id: "line-live-1",
          service: "Strategy",
        }),
      ]);
    },
  );
});
