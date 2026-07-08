import type {
  AccountLite,
  CampaignMemberLite,
  EngagementLite,
  ProductLite,
  RelationshipSignalDraft,
  StakeholderLite,
} from "./types";

const BUSINESS_DAY_MS = 86_400_000;
const FOLLOW_UP_ELIGIBLE_ATTENDEE_STATUSES: ReadonlySet<CampaignMemberLite["attendee_status"]> = new Set([
  "attended",
  "met",
  "high_intent",
]);

export type RelationshipSignalInput = {
  account: AccountLite;
  contacts: StakeholderLite[];
  engagements: EngagementLite[];
  quotes: Array<{ id: string; status: string; total_value: number | null; created_at: string }>;
  campaignMembers: CampaignMemberLite[];
  products: ProductLite[];
  now: Date;
};

function daysBetween(from: string, to: Date): number {
  const ms = to.getTime() - new Date(from).getTime();
  return Math.floor(ms / BUSINESS_DAY_MS);
}

function toUtcDateOnly(value: string | Date): Date {
  const date = typeof value === "string" ? new Date(value) : new Date(value.getTime());
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function isWeekday(date: Date): boolean {
  const day = date.getUTCDay();
  return day >= 1 && day <= 5;
}

function countBusinessDaysBetween(from: string, to: Date): number {
  let cursor = toUtcDateOnly(from);
  const end = toUtcDateOnly(to);
  let businessDays = 0;

  while (cursor < end) {
    cursor = new Date(cursor.getTime() + BUSINESS_DAY_MS);
    if (isWeekday(cursor) && cursor <= end) {
      businessDays += 1;
    }
  }

  return businessDays;
}

function isEligibleForPostEventFollowUp(member: CampaignMemberLite): boolean {
  return member.attendee_status !== "unknown" && FOLLOW_UP_ELIGIBLE_ATTENDEE_STATUSES.has(member.attendee_status);
}

function addSignal(
  list: RelationshipSignalDraft[],
  accountId: string,
  signal: Omit<RelationshipSignalDraft, "account_id" | "source">,
): void {
  list.push({ account_id: accountId, source: "deterministic", ...signal });
}

export function buildRelationshipSignals(input: RelationshipSignalInput): RelationshipSignalDraft[] {
  const signals: RelationshipSignalDraft[] = [];
  const accountId = input.account.id;
  const hasDecisionMaker = input.contacts.some((contact) => contact.relationship_role === "decision_maker");
  const hasChampion = input.contacts.some((contact) => contact.relationship_role === "champion");

  if (!hasDecisionMaker) {
    addSignal(signals, accountId, {
      signal_type: "missing_decision_maker",
      severity: "high",
      title: "Decision maker missing",
      reason: `${input.account.name} has no mapped decision maker.`,
      suggested_action: "Identify and add the decision maker before the next commercial step.",
      dedupe_key: "missing-decision-maker",
    });
  }

  if (!hasChampion) {
    addSignal(signals, accountId, {
      signal_type: "missing_champion",
      severity: "medium",
      title: "Champion missing",
      reason: `${input.account.name} has no mapped champion.`,
      suggested_action: "Find a day-to-day champion who can support the relationship.",
      dedupe_key: "missing-champion",
    });
  }

  const latestContact = input.contacts
    .map((contact) => contact.last_contacted_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  const staleThreshold = input.account.lifecycle_stage === "active_client" ? 30 : 60;

  if (!latestContact || daysBetween(latestContact, input.now) >= staleThreshold) {
    addSignal(signals, accountId, {
      signal_type: "stale_touchpoint",
      severity: input.account.lifecycle_stage === "active_client" ? "high" : "medium",
      title: "Relationship touchpoint is stale",
      reason: latestContact
        ? `No stakeholder touchpoint in ${daysBetween(latestContact, input.now)} days.`
        : "No stakeholder touchpoint has been recorded.",
      suggested_action: "Log a check-in or create a follow-up task.",
      dedupe_key: `stale-touchpoint-${staleThreshold}`,
    });
  }

  for (const member of input.campaignMembers) {
    if (
      isEligibleForPostEventFollowUp(member) &&
      member.follow_up_status === "not_started" &&
      countBusinessDaysBetween(member.created_at, input.now) >= 3
    ) {
      addSignal(signals, accountId, {
        signal_type: "post_event_follow_up_due",
        severity: "high",
        title: "Post-event follow-up due",
        reason: "An event attendee has no follow-up after three business days.",
        suggested_action: "Create a follow-up task for the event attendee.",
        dedupe_key: `campaign-member-${member.id}`,
      });
    }
  }

  for (const engagement of input.engagements) {
    if (engagement.status === "active" && engagement.renewal_risk === "high") {
      addSignal(signals, accountId, {
        signal_type: "high_risk_engagement",
        severity: "high",
        title: "High-risk engagement",
        reason: "An active engagement is marked high renewal risk.",
        suggested_action: "Review the engagement and next action with the owner.",
        dedupe_key: `high-risk-engagement-${engagement.id}`,
      });
    }
  }

  const negativeStakeholder = input.contacts.find(
    (contact) => contact.sentiment === "negative" && contact.influence_level === "high",
  );
  if (negativeStakeholder) {
    addSignal(signals, accountId, {
      signal_type: "negative_sentiment",
      severity: "high",
      title: "High-influence stakeholder sentiment is negative",
      reason: "A high-influence stakeholder is marked with negative sentiment.",
      suggested_action: "Review recent activity and plan stakeholder recovery.",
      dedupe_key: `negative-sentiment-${negativeStakeholder.id}`,
    });
  }

  if (!input.account.account_owner) {
    addSignal(signals, accountId, {
      signal_type: "unowned_account",
      severity: "medium",
      title: "Account has no owner",
      reason: `${input.account.name} has activity but no account owner.`,
      suggested_action: "Assign an account owner.",
      dedupe_key: "unowned-account",
    });
  }

  const usedProductIds = new Set(
    input.engagements.filter((engagement) => engagement.status === "active").map((engagement) => engagement.product_id),
  );
  const unusedProduct = input.products.find((product) => product.active && !usedProductIds.has(product.id));
  if (input.account.lifecycle_stage === "active_client" && usedProductIds.size > 0 && unusedProduct) {
    addSignal(signals, accountId, {
      signal_type: "cross_sell_opportunity",
      severity: "low",
      title: "Cross-sell opportunity",
      reason: `${input.account.name} is not using ${unusedProduct.name}.`,
      suggested_action: `Review ${unusedProduct.name} as a cross-sell opportunity.`,
      dedupe_key: `cross-sell-${unusedProduct.id}`,
    });
  }

  return signals;
}
