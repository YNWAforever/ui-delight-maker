import test from "node:test";
import assert from "node:assert/strict";

import {
  assessRenewalRisk,
  attributeCampaignRevenue,
  buildProjectFromWonDeal,
  calculateWeightedForecast,
  findIdentityMatch,
} from "../lifecycle-utils.ts";

test("findIdentityMatch matches an existing contact by normalized email", () => {
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

  assert.equal(match?.contactId, "contact-1");
  assert.equal(match?.accountId, "account-1");
  assert.equal(match?.reason, "email");
});

test("findIdentityMatch falls back to phone when no email matches", () => {
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

  assert.equal(match?.contactId, "contact-2");
  assert.equal(match?.reason, "phone");
});

test("calculateWeightedForecast totals open weighted pipeline and ignores lost deals", () => {
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

  assert.equal(forecast.openValue, 150000);
  assert.equal(forecast.weightedValue, 70000);
  assert.deepEqual(forecast.byStage, {
    proposal: { openValue: 100000, weightedValue: 60000, count: 1 },
    discovery: { openValue: 50000, weightedValue: 10000, count: 1 },
  });
});

test("attributeCampaignRevenue counts won revenue from source campaign deals", () => {
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

  assert.equal(attribution.wonRevenue, 120000);
  assert.equal(attribution.openPipeline, 80000);
  assert.equal(attribution.wonDeals, 1);
  assert.equal(attribution.openDeals, 1);
});

test("buildProjectFromWonDeal creates a project only from a won deal", () => {
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

  assert.deepEqual(project, {
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

test("assessRenewalRisk marks near-renewal unhealthy accounts as high risk", () => {
  const risk = assessRenewalRisk({
    health_score: 38,
    renewal_date: "2026-07-01",
    today: "2026-06-17",
  });

  assert.equal(risk.level, "high");
  assert.equal(risk.nextBestAction, "Schedule executive check-in before renewal");
});
