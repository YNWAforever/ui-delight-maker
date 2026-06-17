export type IdentityMatchReason = "email" | "phone" | "company";

export interface IdentityContact {
  id: string;
  account_id: string | null;
  email?: string | null;
  phone?: string | null;
  account_name?: string | null;
}

export interface AcquisitionIdentity {
  company_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
}

export interface IdentityMatch {
  contactId: string;
  accountId: string | null;
  reason: IdentityMatchReason;
}

export interface ForecastDeal {
  id: string;
  stage: string;
  status: "open" | "won" | "lost";
  value: number | null;
  probability: number | null;
  expected_close_date?: string | null;
}

export interface ForecastStageSummary {
  openValue: number;
  weightedValue: number;
  count: number;
}

export interface WeightedForecast {
  openValue: number;
  weightedValue: number;
  byStage: Record<string, ForecastStageSummary>;
}

export interface CampaignAttributionDeal {
  id: string;
  source_campaign_id: string | null;
  status: "open" | "won" | "lost";
  value: number | null;
}

export interface CampaignAttribution {
  campaignId: string;
  wonRevenue: number;
  openPipeline: number;
  wonDeals: number;
  openDeals: number;
}

export interface ProjectSourceDeal {
  id: string;
  name: string;
  account_id: string | null;
  contact_id: string | null;
  quote_id: string | null;
  owner: string | null;
  status: "open" | "won" | "lost";
  value: number | null;
  currency: string;
}

export interface ProjectDraft {
  account_id: string | null;
  contact_id: string | null;
  deal_id: string;
  quote_id: string | null;
  name: string;
  owner: string | null;
  status: "onboarding";
  value: number | null;
  currency: string;
}

export type RenewalRiskLevel = "low" | "medium" | "high";

export interface RenewalRiskInput {
  health_score: number | null;
  renewal_date: string | null;
  today?: string;
}

export interface RenewalRiskAssessment {
  level: RenewalRiskLevel;
  nextBestAction: string;
  daysUntilRenewal: number | null;
}

export function normalizeEmail(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase();
  return normalized || null;
}

export function normalizePhone(phone: string | null | undefined): string | null {
  const digits = phone?.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 8) return `852${digits}`;
  return digits;
}

export function findIdentityMatch(
  contacts: IdentityContact[],
  identity: AcquisitionIdentity,
): IdentityMatch | null {
  const email = normalizeEmail(identity.contact_email);
  if (email) {
    const contact = contacts.find((item) => normalizeEmail(item.email) === email);
    if (contact) {
      return { contactId: contact.id, accountId: contact.account_id, reason: "email" };
    }
  }

  const phone = normalizePhone(identity.contact_phone);
  if (phone) {
    const contact = contacts.find((item) => normalizePhone(item.phone) === phone);
    if (contact) {
      return { contactId: contact.id, accountId: contact.account_id, reason: "phone" };
    }
  }

  const company = identity.company_name?.trim().toLowerCase();
  if (company) {
    const contact = contacts.find((item) => item.account_name?.trim().toLowerCase() === company);
    if (contact) {
      return { contactId: contact.id, accountId: contact.account_id, reason: "company" };
    }
  }

  return null;
}

export function calculateWeightedForecast(deals: ForecastDeal[]): WeightedForecast {
  return deals.reduce<WeightedForecast>(
    (forecast, deal) => {
      if (deal.status !== "open") return forecast;

      const openValue = deal.value ?? 0;
      const probability = Math.min(Math.max(deal.probability ?? 0, 0), 100);
      const weightedValue = openValue * (probability / 100);
      const stageSummary = forecast.byStage[deal.stage] ?? {
        openValue: 0,
        weightedValue: 0,
        count: 0,
      };

      forecast.openValue += openValue;
      forecast.weightedValue += weightedValue;
      forecast.byStage[deal.stage] = {
        openValue: stageSummary.openValue + openValue,
        weightedValue: stageSummary.weightedValue + weightedValue,
        count: stageSummary.count + 1,
      };

      return forecast;
    },
    { openValue: 0, weightedValue: 0, byStage: {} },
  );
}

export function attributeCampaignRevenue(
  campaignId: string,
  deals: CampaignAttributionDeal[],
): CampaignAttribution {
  return deals.reduce<CampaignAttribution>(
    (attribution, deal) => {
      if (deal.source_campaign_id !== campaignId) return attribution;

      if (deal.status === "won") {
        attribution.wonRevenue += deal.value ?? 0;
        attribution.wonDeals += 1;
      }

      if (deal.status === "open") {
        attribution.openPipeline += deal.value ?? 0;
        attribution.openDeals += 1;
      }

      return attribution;
    },
    { campaignId, wonRevenue: 0, openPipeline: 0, wonDeals: 0, openDeals: 0 },
  );
}

export function buildProjectFromWonDeal(deal: ProjectSourceDeal): ProjectDraft | null {
  if (deal.status !== "won") return null;

  return {
    account_id: deal.account_id,
    contact_id: deal.contact_id,
    deal_id: deal.id,
    quote_id: deal.quote_id,
    name: deal.name,
    owner: deal.owner,
    status: "onboarding",
    value: deal.value,
    currency: deal.currency,
  };
}

export function assessRenewalRisk(input: RenewalRiskInput): RenewalRiskAssessment {
  const healthScore = input.health_score ?? 50;
  const daysUntilRenewal = getDaysUntilRenewal(input.renewal_date, input.today);

  if (healthScore < 45 && daysUntilRenewal !== null && daysUntilRenewal <= 60) {
    return {
      level: "high",
      nextBestAction: "Schedule executive check-in before renewal",
      daysUntilRenewal,
    };
  }

  if (healthScore < 60 || (daysUntilRenewal !== null && daysUntilRenewal <= 90)) {
    return {
      level: "medium",
      nextBestAction: "Review account plan and confirm success milestones",
      daysUntilRenewal,
    };
  }

  return {
    level: "low",
    nextBestAction: "Continue planned success cadence",
    daysUntilRenewal,
  };
}

function getDaysUntilRenewal(renewalDate: string | null, today = new Date().toISOString()): number | null {
  if (!renewalDate) return null;

  const renewal = Date.parse(renewalDate);
  const current = Date.parse(today);
  if (Number.isNaN(renewal) || Number.isNaN(current)) return null;

  return Math.ceil((renewal - current) / (1000 * 60 * 60 * 24));
}
