import type {
  ActivityLog,
  AgentRun,
  ApprovalStatus,
  AttendeeStatus,
  Engagement,
  FollowUpStatus,
  Lead,
  Quote,
  QuoteStatus,
  TaskPriority,
  TaskStatus,
} from "@/lib/types";

export type RelationshipRole =
  | "decision_maker"
  | "buyer"
  | "champion"
  | "daily_user"
  | "influencer"
  | "finance_procurement"
  | "blocker"
  | "agency_partner"
  | "event_attendee"
  | "other";

export type InfluenceLevel = "low" | "medium" | "high";
export type StakeholderSentiment = "positive" | "neutral" | "negative" | "unknown";
export type RelationshipStrength = "weak" | "developing" | "strong";

export type RelationshipSignalType =
  | "missing_decision_maker"
  | "missing_champion"
  | "stale_touchpoint"
  | "post_event_follow_up_due"
  | "stale_quote"
  | "coverage_gap"
  | "high_risk_engagement"
  | "negative_sentiment"
  | "unowned_account"
  | "cross_sell_opportunity";

export type RelationshipSignalSeverity = "low" | "medium" | "high";
export type RelationshipSignalSource = "deterministic" | "ai";

export type AccountLite = {
  id: string;
  name: string;
  domain?: string | null;
  lifecycle_stage?: string | null;
  account_owner?: string | null;
  cs_owner?: string | null;
  last_activity_at?: string | null;
};

export type StakeholderLite = {
  id: string;
  relationship_role: RelationshipRole;
  influence_level: InfluenceLevel;
  sentiment: StakeholderSentiment;
  last_contacted_at?: string | null;
};

export type EngagementLite = {
  id: string;
  product_id: string | null;
  status: string;
  renewal_risk: "low" | "medium" | "high";
  last_touch_at?: string | null;
};

export type ProductLite = {
  id: string;
  name: string;
  active: boolean;
};

export type CampaignMemberLite = {
  id: string;
  campaign_id: string;
  attendee_status: AttendeeStatus;
  follow_up_status: FollowUpStatus;
  created_at: string;
};

export type RelationshipSignalDraft = {
  account_id: string;
  signal_type: RelationshipSignalType;
  severity: RelationshipSignalSeverity;
  title: string;
  reason: string;
  suggested_action: string | null;
  source: RelationshipSignalSource;
  dedupe_key: string;
};

export type AccountTimelineKind =
  | "touchpoint"
  | "activity"
  | "task"
  | "quote"
  | "approval"
  | "agent_run"
  | "campaign"
  | "lead"
  | "engagement";

export type AccountTimelineEntry = {
  id: string;
  kind: AccountTimelineKind;
  occurred_at: string;
  title: string;
  detail: string | null;
  object_type: string;
  object_id: string | null;
  status?:
    | TaskStatus
    | QuoteStatus
    | ApprovalStatus
    | AttendeeStatus
    | FollowUpStatus
    | string
    | null;
};

export type AccountTimelineInput = {
  touchpoints: Array<{
    id: string;
    type: string;
    sentiment: string;
    notes: string | null;
    occurred_at: string;
  }>;
  activityLogs: ActivityLog[];
  tasks: Array<{
    id: string;
    title: string;
    status: TaskStatus;
    due_date: string | null;
    created_at: string;
    priority?: TaskPriority;
  }>;
  quotes: Pick<Quote, "id" | "number" | "status" | "total_value" | "currency" | "created_at">[];
  approvals: Array<{
    id: string;
    approval_type: string | null;
    status: ApprovalStatus;
    context_summary: string | null;
    created_at: string;
  }>;
  agentRuns: Pick<AgentRun, "id" | "agent_name" | "status" | "output_summary" | "created_at">[];
  campaignMembers: Array<{
    id: string;
    campaign_id: string;
    attendee_status: AttendeeStatus;
    follow_up_status: FollowUpStatus;
    created_at: string;
  }>;
  leads?: Array<
    Pick<Lead, "id" | "company_name" | "contact_name" | "status" | "source" | "created_at">
  >;
  engagements?: Array<
    Pick<
      Engagement,
      | "id"
      | "product_id"
      | "status"
      | "renewal_date"
      | "renewal_risk"
      | "next_action"
      | "created_at"
      | "updated_at"
    >
  >;
  kinds?: AccountTimelineKind[];
};
