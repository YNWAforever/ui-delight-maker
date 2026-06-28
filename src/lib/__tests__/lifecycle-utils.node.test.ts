import { describe, expect, it } from "vitest";

import {
  assessRenewalRisk,
  attributeCampaignRevenue,
  buildProjectFromWonDeal,
  calculateWeightedForecast,
  findIdentityMatch,
} from "../lifecycle-utils.ts";

describe("lifecycle utils", () => {
  it("matches an existing contact by normalized email", () => {
    const match = findIdentityMatch(
      [
        {
          id: "contact-1",
          account_id: "account-1",
          email: "ada@fimmick.com",
          phone: "+85291234567",
        },
      ],
      {
        company_name: "Fimmick",
        contact_email: " ADA@FIMMICK.COM ",
        contact_phone: "9123 4567",
      },
    );

    expect(match?.contactId).toBe("contact-1");
    expect(match?.accountId).toBe("account-1");
    expect(match?.reason).toBe("email");
  });

  it("falls back to phone when no email matches", () => {
    const match = findIdentityMatch(
      [
        {
          id: "contact-2",
          account_id: "account-2",
          email: "unknown@example.com",
          phone: "+85291234567",
        },
      ],
      {
        company_name: "Fimmick",
        contact_phone: "9123-4567",
      },
    );

    expect(match?.contactId).toBe("contact-2");
    expect(match?.reason).toBe("phone");
  });

  it("totals open weighted pipeline and ignores lost deals", () => {
    const forecast = calculateWeightedForecast([
      {
        id: "deal-1",
        stage: "proposal",
        status: "open",
        value: 100000,
        probability: 60,
        expected_close_date: "2026-07-15",
      },
      {
        id: "deal-2",
        stage: "discovery",
        status: "open",
        value: 50000,
        probability: 20,
        expected_close_date: "2026-08-01",
      },
      {
        id: "deal-3",
        stage: "lost",
        status: "lost",
        value: 90000,
        probability: 0,
        expected_close_date: "2026-08-15",
      },
    ]);

    expect(forecast.openValue).toBe(150000);
    expect(forecast.weightedValue).toBe(70000);
    expect(forecast.byStage).toEqual({
      proposal: { openValue: 100000, weightedValue: 60000, count: 1 },
      discovery: { openValue: 50000, weightedValue: 10000, count: 1 },
    });
  });

  it("counts won revenue from source campaign deals", () => {
    const attribution = attributeCampaignRevenue("campaign-1", [
      {
        id: "deal-1",
        source_campaign_id: "campaign-1",
        status: "won",
        value: 120000,
      },
      {
        id: "deal-2",
        source_campaign_id: "campaign-1",
        status: "open",
        value: 80000,
      },
      {
        id: "deal-3",
        source_campaign_id: "campaign-2",
        status: "won",
        value: 40000,
      },
    ]);

    expect(attribution.wonRevenue).toBe(120000);
    expect(attribution.openPipeline).toBe(80000);
    expect(attribution.wonDeals).toBe(1);
    expect(attribution.openDeals).toBe(1);
  });

  it("creates a project only from a won deal", () => {
    const project = buildProjectFromWonDeal({
      id: "deal-1",
      name: "CRM implementation",
      account_id: "account-1",
      contact_id: "contact-1",
      quote_id: "quote-1",
      owner: "profile-1",
      status: "won",
      value: 250000,
      currency: "HKD",
    });

    expect(project).toEqual({
      account_id: "account-1",
      contact_id: "contact-1",
      deal_id: "deal-1",
      quote_id: "quote-1",
      name: "CRM implementation",
      owner: "profile-1",
      status: "onboarding",
      value: 250000,
      currency: "HKD",
    });
  });

  it("marks near-renewal unhealthy accounts as high risk", () => {
    const risk = assessRenewalRisk({
      health_score: 38,
      renewal_date: "2026-07-01",
      today: "2026-06-17",
    });

    expect(risk.level).toBe("high");
    expect(risk.nextBestAction).toBe("Schedule executive check-in before renewal");
  });
});
