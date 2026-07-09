export type DemoProfile = {
  key: "sales" | "manager" | "cs";
  id: string;
  email: string;
  name: string;
  role: "sales" | "manager" | "cs";
};

export type DemoProduct = {
  key: string;
  name: string;
  description: string;
  category: "AI transformation" | "CRM" | "KOC" | "campaign" | "data" | "custom";
  billing_type: "retainer" | "one_off" | "usage";
  default_term_months: number;
};

export type DemoPricing = {
  key: string;
  productKey: string;
  service: string;
  description: string;
  category: DemoProduct["category"];
  unit_price: number;
  currency: "HKD";
};

export type DemoLead = {
  key: string;
  accountKey?: string;
  company_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  source: "website" | "whatsapp" | "email" | "linkedin" | "csv" | "event" | "manual";
  status: "new" | "qualified" | "replied" | "quoted" | "approved" | "won" | "lost";
  ownerKey: DemoProfile["key"];
  lead_score: number;
  enquiry_text: string;
  qualification_data: Record<string, unknown> | null;
};

export type DemoClient = {
  key: string;
  accountKey?: string;
  company_name: string;
  industry: string;
  tier: "SME" | "mid-market" | "enterprise";
  ownerKey: DemoProfile["key"];
};

export type DemoClientContact = {
  key: string;
  clientKey: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  is_primary: boolean;
};

export type DemoAccount = {
  key: string;
  name: string;
  website: string | null;
  domain: string | null;
  industry: string;
  region: string;
  tier: "SME" | "mid-market" | "enterprise";
  lifecycle_stage: "prospect" | "active_client" | "at_risk" | "churned" | "partner" | "vendor";
  ownerKey: DemoProfile["key"];
  csOwnerKey: DemoProfile["key"] | null;
  source: string;
  tags: string[];
  notes: string;
  relationship_health: number;
  lastActivityKey: "recentTouch" | "staleTouch" | null;
  next_action: string;
};

export type DemoAccountContact = {
  key: string;
  accountKey: string;
  name: string;
  title: string;
  department: string;
  email: string;
  phone: string;
  preferred_channel: "email" | "phone" | "whatsapp" | "linkedin" | "event" | "unknown";
  relationship_role:
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
  influence_level: "low" | "medium" | "high";
  sentiment: "positive" | "neutral" | "negative" | "unknown";
  relationship_strength: "weak" | "developing" | "strong";
  is_primary: boolean;
  notes: string;
  lastContactedKey: "recentTouch" | "staleTouch" | null;
};

export type DemoCampaign = {
  key: string;
  name: string;
  type: "campaign" | "webinar" | "workshop" | "activation" | "outbound" | "client_event";
  status: "draft" | "planned" | "active" | "completed" | "archived";
  objective: string;
  ownerKey: DemoProfile["key"];
  startsAtOffsetDays: number;
  endsAtOffsetDays: number;
  notes: string;
};

export type DemoCampaignMember = {
  key: string;
  campaignKey: string;
  accountKey: string | null;
  accountContactKey: string | null;
  raw_company_name: string;
  raw_contact_name: string;
  raw_email: string;
  raw_phone: string;
  attendee_status: "attended" | "met" | "high_intent" | "unknown";
  interests: string[];
  followUpOwnerKey: DemoProfile["key"] | null;
  follow_up_status: "not_started" | "task_created" | "in_progress" | "completed" | "dismissed";
  conversion_outcome: "none" | "lead" | "quote" | "engagement" | "client_activity";
  notes: string;
};

export type DemoEngagement = {
  key: string;
  clientKey: string;
  productKey: string;
  ownerKey: DemoProfile["key"];
  value: number;
  billing_period: "monthly" | "quarterly" | "annual" | "one_off";
  startDateKey: "oldStart" | "recentStart";
  renewalDateKey: "overdueRenewal" | "renewal30" | "renewal60" | "renewal90" | "renewalLater";
  status: "active" | "paused" | "ended";
  health_score: number;
  renewal_risk: "low" | "medium" | "high";
  risk_reasoning: string;
  next_action: string;
  lastTouchKey: "recentTouch" | "staleTouch" | null;
  leadKey?: string;
};

export type DemoQuote = {
  key: string;
  number: string;
  accountKey?: string;
  leadKey?: string;
  clientKey?: string;
  accountContactKey?: string;
  status: "draft" | "pending_approval" | "approved" | "sent" | "viewed" | "accepted" | "rejected";
  total_value: number;
  validUntilOffsetDays: number;
  createdByKey: DemoProfile["key"];
  line_items: Array<{
    id: string;
    service: string;
    description: string;
    qty: number;
    unit_price: number;
  }>;
};

export type DemoJobSheet = {
  key: string;
  number: string;
  quoteKey: string;
  accountKey: string;
  clientKey: string;
  accountContactKey: string;
  salesOwnerKey: DemoProfile["key"];
  accountingOwnerKey: DemoProfile["key"];
  status: "draft" | "accounting_review" | "accepted" | "change_required" | "cancelled";
  accepted_scope_summary: string;
  po_number: string;
  client_order_number: string;
  xero_customer_reference: string;
  accounting_notes: string;
  special_billing_instructions: string;
  total_amount: number;
  portions: Array<{
    name: string;
    description: string;
    amount: number;
    targetInvoiceOffsetDays: number;
    billing_type: "deposit" | "progress" | "milestone" | "monthly" | "final" | "other";
    status: "planned" | "entered_in_xero" | "cancelled";
    sort_order: number;
  }>;
};

export type DemoAgentRun = {
  key: string;
  agent_name: string;
  workflow_type: "qualify_lead" | "draft_reply" | "draft_quote" | "score_renewal_risk";
  subjectType: "lead" | "engagement";
  subjectKey: string;
  status: "running" | "completed" | "failed" | "waiting_approval";
  output_summary: string;
  confidence_score: number | null;
  human_review_required: boolean;
  model_used: string;
};

export type DemoApproval = {
  key: string;
  runKey: string;
  approval_type: "quote_send" | "message_send" | "qualification_review" | "cs_risk_review";
  assignedToKey: DemoProfile["key"];
  status: "pending" | "approved" | "rejected" | "escalated";
  context_summary: string;
};

export type DemoTask = {
  key: string;
  title: string;
  description: string;
  assignedToKey: DemoProfile["key"];
  priority: "low" | "medium" | "high";
  status: "open" | "in_progress" | "done";
  dueDateKey: "overdueTask" | "futureTask" | null;
  leadKey?: string;
  clientKey?: string;
};

export type DemoTouchpoint = {
  key: string;
  clientKey: string;
  engagementKey: string | null;
  contactKey: string | null;
  type: "check_in" | "qbr" | "meeting" | "call" | "whatsapp" | "email" | "note";
  sentiment: "positive" | "neutral" | "negative";
  notes: string;
  occurredAtKey: "recentTouch" | "staleTouch";
  loggedByKey: DemoProfile["key"];
};

export type DemoNotification = {
  key: string;
  userKey: DemoProfile["key"];
  type: "renewal_window" | "risk_change" | "stale_touchpoint" | "approval_pending";
  title: string;
  body: string;
  objectType: "engagement" | "approval";
  objectKey: string;
  read: boolean;
};

export const DEMO_PROFILES: DemoProfile[] = [
  {
    key: "sales",
    id: "demo-sales-user",
    email: "sales.demo@fimmick-clientops.example",
    name: "Maya Chan",
    role: "sales",
  },
  {
    key: "manager",
    id: "demo-manager-user",
    email: "manager.demo@fimmick-clientops.example",
    name: "Ada Wong",
    role: "manager",
  },
  {
    key: "cs",
    id: "demo-cs-user",
    email: "cs.demo@fimmick-clientops.example",
    name: "Leo Tse",
    role: "cs",
  },
];

export const DEMO_PRODUCTS: DemoProduct[] = [
  {
    key: "ai-sales-desk",
    name: "AI Sales Desk",
    description: "Lead intake, qualification, reply drafting, and quote workflow automation.",
    category: "AI transformation",
    billing_type: "retainer",
    default_term_months: 12,
  },
  {
    key: "clientops-crm",
    name: "ClientOps CRM Retainer",
    description: "CRM operations, pipeline hygiene, reporting, and sales workflow support.",
    category: "CRM",
    billing_type: "retainer",
    default_term_months: 12,
  },
  {
    key: "renewal-risk-radar",
    name: "Renewal Risk Radar",
    description: "Customer health, renewal risk scoring, and CS next-best-action support.",
    category: "data",
    billing_type: "retainer",
    default_term_months: 12,
  },
  {
    key: "koc-engine",
    name: "KOC Campaign Engine",
    description: "KOC sourcing, outreach, campaign coordination, and performance reporting.",
    category: "KOC",
    billing_type: "one_off",
    default_term_months: 3,
  },
  {
    key: "analytics-dashboard",
    name: "Performance Analytics Dashboard",
    description: "Client reporting dashboard with campaign and sales performance metrics.",
    category: "data",
    billing_type: "retainer",
    default_term_months: 12,
  },
  {
    key: "whatsapp-automation",
    name: "WhatsApp Automation Sprint",
    description: "WhatsApp Business API automation and assisted response flows.",
    category: "AI transformation",
    billing_type: "one_off",
    default_term_months: 6,
  },
];

export const DEMO_PRICING: DemoPricing[] = [
  {
    key: "ai-sales-desk-discovery",
    productKey: "ai-sales-desk",
    service: "AI Sales Desk Discovery Sprint",
    description:
      "Two-week sprint to map lead intake, qualification, reply drafting, and quote workflow.",
    category: "AI transformation",
    unit_price: 38000,
    currency: "HKD",
  },
  {
    key: "clientops-crm-retainer",
    productKey: "clientops-crm",
    service: "ClientOps CRM Retainer",
    description: "Monthly CRM operations, pipeline hygiene, lead follow-up, and reporting support.",
    category: "CRM",
    unit_price: 28000,
    currency: "HKD",
  },
  {
    key: "renewal-risk-radar",
    productKey: "renewal-risk-radar",
    service: "Renewal Risk Radar Setup",
    description: "Risk scoring setup, renewal monitoring, and CS workflow configuration.",
    category: "data",
    unit_price: 42000,
    currency: "HKD",
  },
  {
    key: "koc-quarter",
    productKey: "koc-engine",
    service: "KOC Campaign Quarter",
    description: "Three-month KOC campaign planning, sourcing, management, and reporting.",
    category: "KOC",
    unit_price: 88000,
    currency: "HKD",
  },
  {
    key: "dashboard-build",
    productKey: "analytics-dashboard",
    service: "Performance Dashboard Build",
    description: "Executive dashboard build for sales, campaign, and retention reporting.",
    category: "data",
    unit_price: 52000,
    currency: "HKD",
  },
  {
    key: "whatsapp-sprint",
    productKey: "whatsapp-automation",
    service: "WhatsApp Automation Sprint",
    description: "WhatsApp automation discovery, implementation, and training.",
    category: "AI transformation",
    unit_price: 45000,
    currency: "HKD",
  },
];

export const DEMO_LEADS: DemoLead[] = [
  {
    key: "lead-retail",
    accountKey: "account-smoke-retail",
    company_name: "Smoke Test Retail Group",
    contact_name: "Maya Chan",
    contact_email: "smoke.lead@fimmick-clientops.example",
    contact_phone: "+852 5555 0101",
    source: "manual",
    status: "new",
    ownerKey: "sales",
    lead_score: 0,
    enquiry_text:
      "We need urgent help improving lead follow-up, CRM visibility, and AI-assisted reply drafting before a Q3 campaign launch. Budget is likely HKD 80k-150k.",
    qualification_data: null,
  },
  {
    key: "lead-beauty",
    accountKey: "account-harbour",
    company_name: "Harbour Beauty Lab",
    contact_name: "Elaine Yu",
    contact_email: "elaine.yu@harbour-beauty.example",
    contact_phone: "+852 5555 0102",
    source: "website",
    status: "qualified",
    ownerKey: "sales",
    lead_score: 82,
    enquiry_text: "Looking for AI-assisted WhatsApp responses and KOC campaign reporting.",
    qualification_data: {
      urgency_score: 8,
      fit_score: 8,
      qualification_score: 82,
      service_interest: ["AI Sales Desk", "KOC Campaign Engine"],
      budget_range: "HKD 100k-200k",
      next_action: "Schedule discovery call",
      reason: "Strong fit and active campaign timeline.",
      confidence: 0.78,
      human_review_required: false,
    },
  },
  {
    key: "lead-logistics",
    accountKey: "account-pearl",
    company_name: "Pearl Logistics HK",
    contact_name: "Ronald Lee",
    contact_email: "ronald.lee@pearl-logistics.example",
    contact_phone: "+852 5555 0103",
    source: "linkedin",
    status: "replied",
    ownerKey: "sales",
    lead_score: 68,
    enquiry_text: "Need a clearer CRM handoff from sales to account management.",
    qualification_data: {
      urgency_score: 6,
      fit_score: 8,
      qualification_score: 68,
      service_interest: ["ClientOps CRM Retainer"],
      budget_range: "HKD 50k-120k",
      next_action: "Send intro deck",
      reason: "CRM pain is clear, budget still forming.",
      confidence: 0.65,
      human_review_required: true,
    },
  },
  {
    key: "lead-fitness",
    accountKey: "account-fitness",
    company_name: "North Point Fitness",
    contact_name: "Jason Ng",
    contact_email: "jason.ng@np-fitness.example",
    contact_phone: "+852 5555 0104",
    source: "whatsapp",
    status: "quoted",
    ownerKey: "sales",
    lead_score: 74,
    enquiry_text: "Asking for dashboard and WhatsApp automation quote before expansion.",
    qualification_data: {
      urgency_score: 7,
      fit_score: 8,
      qualification_score: 74,
      service_interest: ["Performance Analytics Dashboard", "WhatsApp Automation Sprint"],
      budget_range: "HKD 80k-160k",
      next_action: "Schedule discovery call",
      reason: "Expansion timing makes this a good fit.",
      confidence: 0.7,
      human_review_required: false,
    },
  },
  {
    key: "lead-education",
    accountKey: "account-brightpath",
    company_name: "BrightPath Education",
    contact_name: "Carmen Ho",
    contact_email: "carmen.ho@brightpath.example",
    contact_phone: "+852 5555 0105",
    source: "email",
    status: "approved",
    ownerKey: "manager",
    lead_score: 89,
    enquiry_text: "Needs full lead response automation and sales reporting for admissions.",
    qualification_data: {
      urgency_score: 9,
      fit_score: 9,
      qualification_score: 89,
      service_interest: ["AI Sales Desk", "Performance Analytics Dashboard"],
      budget_range: "HKD 180k-260k",
      next_action: "Schedule discovery call",
      reason: "High urgency and clear automation need.",
      confidence: 0.84,
      human_review_required: false,
    },
  },
  {
    key: "lead-cafe",
    accountKey: "account-cafe",
    company_name: "Mong Kok Cafe Collective",
    contact_name: "Iris Tam",
    contact_email: "iris.tam@mk-cafe.example",
    contact_phone: "+852 5555 0106",
    source: "event",
    status: "won",
    ownerKey: "sales",
    lead_score: 91,
    enquiry_text: "Won pilot for WhatsApp automation and CRM reporting.",
    qualification_data: {
      urgency_score: 9,
      fit_score: 9,
      qualification_score: 91,
      service_interest: ["WhatsApp Automation Sprint", "ClientOps CRM Retainer"],
      budget_range: "HKD 120k-180k",
      next_action: "Schedule discovery call",
      reason: "Pilot approved by founder.",
      confidence: 0.88,
      human_review_required: false,
    },
  },
  {
    key: "lead-finance",
    accountKey: "account-finance",
    company_name: "Central Wealth Advisory",
    contact_name: "Marcus Poon",
    contact_email: "marcus.poon@central-wealth.example",
    contact_phone: "+852 5555 0107",
    source: "csv",
    status: "lost",
    ownerKey: "manager",
    lead_score: 42,
    enquiry_text: "Wanted a full bespoke AI agent but paused budget after compliance review.",
    qualification_data: {
      urgency_score: 4,
      fit_score: 5,
      qualification_score: 42,
      service_interest: ["Custom AI Agent Development"],
      budget_range: "unknown",
      next_action: "Disqualify",
      reason: "Budget and compliance blocked.",
      confidence: 0.72,
      human_review_required: true,
    },
  },
  {
    key: "lead-hotel",
    accountKey: "account-hotel",
    company_name: "Island Hotel Group",
    contact_name: "Sophie Lau",
    contact_email: "sophie.lau@island-hotel.example",
    contact_phone: "+852 5555 0108",
    source: "website",
    status: "new",
    ownerKey: "sales",
    lead_score: 55,
    enquiry_text: "Interested in AI lead routing for event enquiries across three venues.",
    qualification_data: null,
  },
];

export const DEMO_CLIENTS: DemoClient[] = [
  {
    key: "client-apex",
    accountKey: "account-apex",
    company_name: "Apex Retail Group",
    industry: "Retail",
    tier: "enterprise",
    ownerKey: "cs",
  },
  {
    key: "client-harbour",
    accountKey: "account-harbour",
    company_name: "Harbour Beauty Lab",
    industry: "Beauty",
    tier: "mid-market",
    ownerKey: "cs",
  },
  {
    key: "client-pearl",
    accountKey: "account-pearl",
    company_name: "Pearl Logistics HK",
    industry: "Logistics",
    tier: "mid-market",
    ownerKey: "sales",
  },
  {
    key: "client-cafe",
    accountKey: "account-cafe",
    company_name: "Mong Kok Cafe Collective",
    industry: "F&B",
    tier: "SME",
    ownerKey: "sales",
  },
  {
    key: "client-brightpath",
    accountKey: "account-brightpath",
    company_name: "BrightPath Education",
    industry: "Education",
    tier: "mid-market",
    ownerKey: "cs",
  },
];

export const DEMO_CONTACTS: DemoClientContact[] = [
  {
    key: "apex-jane",
    clientKey: "client-apex",
    name: "Jane Wong",
    title: "Marketing Director",
    email: "jane.wong@apex-retail.example",
    phone: "+852 5555 0201",
    is_primary: true,
  },
  {
    key: "apex-oscar",
    clientKey: "client-apex",
    name: "Oscar Ma",
    title: "CRM Lead",
    email: "oscar.ma@apex-retail.example",
    phone: "+852 5555 0202",
    is_primary: false,
  },
  {
    key: "harbour-elaine",
    clientKey: "client-harbour",
    name: "Elaine Yu",
    title: "Founder",
    email: "elaine.yu@harbour-beauty.example",
    phone: "+852 5555 0203",
    is_primary: true,
  },
  {
    key: "pearl-ronald",
    clientKey: "client-pearl",
    name: "Ronald Lee",
    title: "Commercial Director",
    email: "ronald.lee@pearl-logistics.example",
    phone: "+852 5555 0204",
    is_primary: true,
  },
  {
    key: "cafe-iris",
    clientKey: "client-cafe",
    name: "Iris Tam",
    title: "Founder",
    email: "iris.tam@mk-cafe.example",
    phone: "+852 5555 0205",
    is_primary: true,
  },
  {
    key: "brightpath-carmen",
    clientKey: "client-brightpath",
    name: "Carmen Ho",
    title: "Admissions Director",
    email: "carmen.ho@brightpath.example",
    phone: "+852 5555 0206",
    is_primary: true,
  },
];

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    key: "account-apex",
    name: "Apex Retail Group",
    website: "https://apex-retail.example",
    domain: "apex-retail.example",
    industry: "Retail",
    region: "Hong Kong",
    tier: "enterprise",
    lifecycle_stage: "at_risk",
    ownerKey: "cs",
    csOwnerKey: "cs",
    source: "client",
    tags: ["retail", "renewal-risk", "crm"],
    notes: "Enterprise client with overdue renewal and multiple stakeholder paths.",
    relationship_health: 38,
    lastActivityKey: "staleTouch",
    next_action: "Schedule senior renewal save call",
  },
  {
    key: "account-harbour",
    name: "Harbour Beauty Lab",
    website: "https://harbour-beauty.example",
    domain: "harbour-beauty.example",
    industry: "Beauty",
    region: "Hong Kong",
    tier: "mid-market",
    lifecycle_stage: "active_client",
    ownerKey: "cs",
    csOwnerKey: "cs",
    source: "website",
    tags: ["beauty", "koc", "dashboard"],
    notes: "Healthy campaign client with Q4 expansion potential.",
    relationship_health: 78,
    lastActivityKey: "recentTouch",
    next_action: "Send KOC Q4 expansion options",
  },
  {
    key: "account-pearl",
    name: "Pearl Logistics HK",
    website: "https://pearl-logistics.example",
    domain: "pearl-logistics.example",
    industry: "Logistics",
    region: "Hong Kong",
    tier: "mid-market",
    lifecycle_stage: "active_client",
    ownerKey: "sales",
    csOwnerKey: "cs",
    source: "linkedin",
    tags: ["logistics", "crm-handoff"],
    notes: "CRM handoff client with stale owner mapping tasks.",
    relationship_health: 62,
    lastActivityKey: "staleTouch",
    next_action: "Close overdue CRM owner mapping items",
  },
  {
    key: "account-cafe",
    name: "Mong Kok Cafe Collective",
    website: "https://mk-cafe.example",
    domain: "mk-cafe.example",
    industry: "F&B",
    region: "Hong Kong",
    tier: "SME",
    lifecycle_stage: "active_client",
    ownerKey: "sales",
    csOwnerKey: "sales",
    source: "event",
    tags: ["whatsapp", "pilot", "job-sheet"],
    notes: "Accepted quote ready for accounting handoff and Xero tracking.",
    relationship_health: 88,
    lastActivityKey: "recentTouch",
    next_action: "Confirm pilot success metrics and billing cycle",
  },
  {
    key: "account-brightpath",
    name: "BrightPath Education",
    website: "https://brightpath.example",
    domain: "brightpath.example",
    industry: "Education",
    region: "Hong Kong",
    tier: "mid-market",
    lifecycle_stage: "active_client",
    ownerKey: "cs",
    csOwnerKey: "cs",
    source: "email",
    tags: ["education", "ai-sales"],
    notes: "Admissions team adopted AI reply drafts quickly.",
    relationship_health: 91,
    lastActivityKey: "recentTouch",
    next_action: "Prepare admissions dashboard upsell",
  },
  {
    key: "account-smoke-retail",
    name: "Smoke Test Retail Group",
    website: null,
    domain: "smoke-retail.example",
    industry: "Retail",
    region: "Hong Kong",
    tier: "mid-market",
    lifecycle_stage: "prospect",
    ownerKey: "sales",
    csOwnerKey: null,
    source: "manual",
    tags: ["smoke-test", "prospect"],
    notes: "Seeded prospect for quote creation debugging.",
    relationship_health: 55,
    lastActivityKey: null,
    next_action: "Confirm Q3 campaign deadline",
  },
  {
    key: "account-fitness",
    name: "North Point Fitness",
    website: "https://np-fitness.example",
    domain: "np-fitness.example",
    industry: "Fitness",
    region: "Hong Kong",
    tier: "SME",
    lifecycle_stage: "prospect",
    ownerKey: "sales",
    csOwnerKey: null,
    source: "whatsapp",
    tags: ["quote", "dashboard", "whatsapp"],
    notes: "Pending approval quote tests quote detail and PDF routes.",
    relationship_health: 68,
    lastActivityKey: "recentTouch",
    next_action: "Review dashboard plus WhatsApp quote",
  },
  {
    key: "account-finance",
    name: "Central Wealth Advisory",
    website: "https://central-wealth.example",
    domain: "central-wealth.example",
    industry: "Financial Services",
    region: "Hong Kong",
    tier: "mid-market",
    lifecycle_stage: "prospect",
    ownerKey: "manager",
    csOwnerKey: null,
    source: "csv",
    tags: ["compliance", "lost"],
    notes: "Paused budget after compliance review.",
    relationship_health: 32,
    lastActivityKey: "staleTouch",
    next_action: "Nurture only after compliance unlock",
  },
  {
    key: "account-hotel",
    name: "Island Hotel Group",
    website: "https://island-hotel.example",
    domain: "island-hotel.example",
    industry: "Hospitality",
    region: "Hong Kong",
    tier: "enterprise",
    lifecycle_stage: "prospect",
    ownerKey: "sales",
    csOwnerKey: null,
    source: "website",
    tags: ["venues", "lead-routing"],
    notes: "Venue enquiry routing prospect.",
    relationship_health: 50,
    lastActivityKey: null,
    next_action: "Qualify venue lead routing urgency",
  },
];

export const DEMO_ACCOUNT_CONTACTS: DemoAccountContact[] = [
  {
    key: "account-contact-apex-jane",
    accountKey: "account-apex",
    name: "Jane Wong",
    title: "Marketing Director",
    department: "Marketing",
    email: "jane.wong@apex-retail.example",
    phone: "+852 5555 0201",
    preferred_channel: "email",
    relationship_role: "decision_maker",
    influence_level: "high",
    sentiment: "negative",
    relationship_strength: "developing",
    is_primary: true,
    notes: "Needs senior renewal reassurance.",
    lastContactedKey: "staleTouch",
  },
  {
    key: "account-contact-apex-oscar",
    accountKey: "account-apex",
    name: "Oscar Ma",
    title: "CRM Lead",
    department: "CRM",
    email: "oscar.ma@apex-retail.example",
    phone: "+852 5555 0202",
    preferred_channel: "whatsapp",
    relationship_role: "champion",
    influence_level: "medium",
    sentiment: "neutral",
    relationship_strength: "strong",
    is_primary: false,
    notes: "Confirms dashboard usage and renewal pricing questions.",
    lastContactedKey: "recentTouch",
  },
  {
    key: "account-contact-cafe-iris",
    accountKey: "account-cafe",
    name: "Iris Tam",
    title: "Founder",
    department: "Management",
    email: "iris.tam@mk-cafe.example",
    phone: "+852 5555 0205",
    preferred_channel: "whatsapp",
    relationship_role: "decision_maker",
    influence_level: "high",
    sentiment: "positive",
    relationship_strength: "strong",
    is_primary: true,
    notes: "Approved pilot quote and billing handoff.",
    lastContactedKey: "recentTouch",
  },
  {
    key: "account-contact-fitness-jason",
    accountKey: "account-fitness",
    name: "Jason Ng",
    title: "Operations Director",
    department: "Operations",
    email: "jason.ng@np-fitness.example",
    phone: "+852 5555 0104",
    preferred_channel: "whatsapp",
    relationship_role: "buyer",
    influence_level: "high",
    sentiment: "neutral",
    relationship_strength: "developing",
    is_primary: true,
    notes: "Waiting for quote approval before expansion decision.",
    lastContactedKey: "recentTouch",
  },
];

export const DEMO_CAMPAIGNS: DemoCampaign[] = [
  {
    key: "campaign-ai-breakfast",
    name: "AI ClientOps Breakfast Briefing",
    type: "client_event",
    status: "active",
    objective: "Convert high-intent event attendees into quote and account follow-up.",
    ownerKey: "manager",
    startsAtOffsetDays: -3,
    endsAtOffsetDays: -3,
    notes: "Seeded event for attendee import, follow-up, and campaign detail debugging.",
  },
];

export const DEMO_CAMPAIGN_MEMBERS: DemoCampaignMember[] = [
  {
    key: "campaign-member-cafe-iris",
    campaignKey: "campaign-ai-breakfast",
    accountKey: "account-cafe",
    accountContactKey: "account-contact-cafe-iris",
    raw_company_name: "Mong Kok Cafe Collective",
    raw_contact_name: "Iris Tam",
    raw_email: "iris.tam@mk-cafe.example",
    raw_phone: "+852 5555 0205",
    attendee_status: "high_intent",
    interests: ["WhatsApp Automation", "CRM reporting"],
    followUpOwnerKey: "sales",
    follow_up_status: "in_progress",
    conversion_outcome: "quote",
    notes: "Asked for billing portions and accounting handoff after accepting pilot quote.",
  },
  {
    key: "campaign-member-fitness-jason",
    campaignKey: "campaign-ai-breakfast",
    accountKey: "account-fitness",
    accountContactKey: "account-contact-fitness-jason",
    raw_company_name: "North Point Fitness",
    raw_contact_name: "Jason Ng",
    raw_email: "jason.ng@np-fitness.example",
    raw_phone: "+852 5555 0104",
    attendee_status: "met",
    interests: ["Performance Dashboard", "WhatsApp automation"],
    followUpOwnerKey: "sales",
    follow_up_status: "task_created",
    conversion_outcome: "quote",
    notes: "Pending approval quote should remain easy to find from the campaign workspace.",
  },
];

export const DEMO_ENGAGEMENTS: DemoEngagement[] = [
  {
    key: "apex-crm",
    clientKey: "client-apex",
    productKey: "clientops-crm",
    ownerKey: "cs",
    value: 36000,
    billing_period: "monthly",
    startDateKey: "oldStart",
    renewalDateKey: "overdueRenewal",
    status: "active",
    health_score: 38,
    renewal_risk: "high",
    risk_reasoning: "No executive touchpoint in 40 days and renewal is overdue.",
    next_action: "Schedule urgent renewal save call",
    lastTouchKey: "staleTouch",
  },
  {
    key: "apex-risk",
    clientKey: "client-apex",
    productKey: "renewal-risk-radar",
    ownerKey: "cs",
    value: 18000,
    billing_period: "monthly",
    startDateKey: "oldStart",
    renewalDateKey: "renewal30",
    status: "active",
    health_score: 62,
    renewal_risk: "medium",
    risk_reasoning: "Renewal is inside 30 days and adoption review is pending.",
    next_action: "Book adoption review with CRM lead",
    lastTouchKey: "recentTouch",
  },
  {
    key: "harbour-koc",
    clientKey: "client-harbour",
    productKey: "koc-engine",
    ownerKey: "cs",
    value: 88000,
    billing_period: "one_off",
    startDateKey: "oldStart",
    renewalDateKey: "renewal60",
    status: "active",
    health_score: 74,
    renewal_risk: "medium",
    risk_reasoning: "Campaign is healthy, but renewal scope has not been confirmed.",
    next_action: "Send KOC Q4 expansion options",
    lastTouchKey: "recentTouch",
  },
  {
    key: "harbour-dashboard",
    clientKey: "client-harbour",
    productKey: "analytics-dashboard",
    ownerKey: "cs",
    value: 22000,
    billing_period: "monthly",
    startDateKey: "oldStart",
    renewalDateKey: "renewal90",
    status: "active",
    health_score: 82,
    renewal_risk: "low",
    risk_reasoning: "Recent QBR was positive and reporting usage is strong.",
    next_action: "Maintain monthly reporting cadence",
    lastTouchKey: "recentTouch",
  },
  {
    key: "pearl-crm",
    clientKey: "client-pearl",
    productKey: "clientops-crm",
    ownerKey: "sales",
    value: 24000,
    billing_period: "monthly",
    startDateKey: "oldStart",
    renewalDateKey: "renewalLater",
    status: "active",
    health_score: 69,
    renewal_risk: "medium",
    risk_reasoning: "Pipeline hygiene improved, but handoff tasks are overdue.",
    next_action: "Close overdue handoff tasks",
    lastTouchKey: "staleTouch",
  },
  {
    key: "cafe-whatsapp",
    clientKey: "client-cafe",
    productKey: "whatsapp-automation",
    ownerKey: "sales",
    value: 45000,
    billing_period: "one_off",
    startDateKey: "recentStart",
    renewalDateKey: "renewal90",
    status: "active",
    health_score: 88,
    renewal_risk: "low",
    risk_reasoning: "Pilot kicked off recently and founder is engaged.",
    next_action: "Confirm pilot success metrics",
    lastTouchKey: "recentTouch",
    leadKey: "lead-cafe",
  },
  {
    key: "brightpath-ai",
    clientKey: "client-brightpath",
    productKey: "ai-sales-desk",
    ownerKey: "cs",
    value: 42000,
    billing_period: "monthly",
    startDateKey: "recentStart",
    renewalDateKey: "renewalLater",
    status: "active",
    health_score: 91,
    renewal_risk: "low",
    risk_reasoning: "Admissions team adopted reply drafts quickly.",
    next_action: "Prepare admissions dashboard upsell",
    lastTouchKey: "recentTouch",
    leadKey: "lead-education",
  },
  {
    key: "pearl-old-dashboard",
    clientKey: "client-pearl",
    productKey: "analytics-dashboard",
    ownerKey: "sales",
    value: 36000,
    billing_period: "one_off",
    startDateKey: "oldStart",
    renewalDateKey: "renewalLater",
    status: "ended",
    health_score: 55,
    renewal_risk: "medium",
    risk_reasoning: "Completed dashboard build, no active retainer.",
    next_action: "Revisit retainer in next QBR",
    lastTouchKey: "staleTouch",
  },
];

export const DEMO_QUOTES: DemoQuote[] = [
  {
    key: "quote-fitness",
    number: "QT-DEMO-001",
    accountKey: "account-fitness",
    leadKey: "lead-fitness",
    accountContactKey: "account-contact-fitness-jason",
    status: "pending_approval",
    total_value: 97000,
    validUntilOffsetDays: 14,
    createdByKey: "sales",
    line_items: [
      {
        id: "line-dashboard",
        service: "Performance Dashboard Build",
        description: "Executive dashboard build",
        qty: 1,
        unit_price: 52000,
      },
      {
        id: "line-whatsapp",
        service: "WhatsApp Automation Sprint",
        description: "WhatsApp flow setup",
        qty: 1,
        unit_price: 45000,
      },
    ],
  },
  {
    key: "quote-education",
    number: "QT-DEMO-002",
    accountKey: "account-brightpath",
    leadKey: "lead-education",
    clientKey: "client-brightpath",
    status: "approved",
    total_value: 156000,
    validUntilOffsetDays: 21,
    createdByKey: "manager",
    line_items: [
      {
        id: "line-ai",
        service: "AI Sales Desk Discovery Sprint",
        description: "Admissions workflow discovery",
        qty: 3,
        unit_price: 38000,
      },
      {
        id: "line-dashboard",
        service: "Performance Dashboard Build",
        description: "Admissions dashboard",
        qty: 1,
        unit_price: 42000,
      },
    ],
  },
  {
    key: "quote-cafe",
    number: "QT-DEMO-003",
    accountKey: "account-cafe",
    leadKey: "lead-cafe",
    clientKey: "client-cafe",
    accountContactKey: "account-contact-cafe-iris",
    status: "accepted",
    total_value: 73000,
    validUntilOffsetDays: 30,
    createdByKey: "sales",
    line_items: [
      {
        id: "line-whatsapp",
        service: "WhatsApp Automation Sprint",
        description: "Pilot automation sprint",
        qty: 1,
        unit_price: 45000,
      },
      {
        id: "line-crm",
        service: "ClientOps CRM Retainer",
        description: "First month CRM support",
        qty: 1,
        unit_price: 28000,
      },
    ],
  },
  {
    key: "quote-finance",
    number: "QT-DEMO-004",
    accountKey: "account-finance",
    leadKey: "lead-finance",
    status: "rejected",
    total_value: 120000,
    validUntilOffsetDays: -7,
    createdByKey: "manager",
    line_items: [
      {
        id: "line-custom",
        service: "Custom AI Agent Development",
        description: "Bespoke compliance workflow",
        qty: 1,
        unit_price: 120000,
      },
    ],
  },
  {
    key: "quote-apex-renewal",
    number: "QT-DEMO-005",
    accountKey: "account-apex",
    clientKey: "client-apex",
    accountContactKey: "account-contact-apex-jane",
    status: "draft",
    total_value: 216000,
    validUntilOffsetDays: 10,
    createdByKey: "cs",
    line_items: [
      {
        id: "line-renewal",
        service: "ClientOps CRM Retainer",
        description: "Six-month CRM renewal",
        qty: 6,
        unit_price: 36000,
      },
    ],
  },
];

export const DEMO_JOB_SHEETS: DemoJobSheet[] = [
  {
    key: "job-cafe-accepted",
    number: "JS-DEMO-001",
    quoteKey: "quote-cafe",
    accountKey: "account-cafe",
    clientKey: "client-cafe",
    accountContactKey: "account-contact-cafe-iris",
    salesOwnerKey: "sales",
    accountingOwnerKey: "manager",
    status: "accounting_review",
    accepted_scope_summary:
      "Accepted WhatsApp automation sprint plus first-month CRM support for cafe pilot.",
    po_number: "PO-CAFE-2026-001",
    client_order_number: "MKC-PILOT-001",
    xero_customer_reference: "Mong Kok Cafe Collective",
    accounting_notes: "Issue invoice from Xero after accounting accepts the staged portions.",
    special_billing_instructions:
      "Split setup deposit and first-month support into separate billing portions.",
    total_amount: 73000,
    portions: [
      {
        name: "Setup deposit",
        description: "WhatsApp automation sprint setup deposit.",
        amount: 45000,
        targetInvoiceOffsetDays: 7,
        billing_type: "deposit",
        status: "planned",
        sort_order: 0,
      },
      {
        name: "First-month CRM support",
        description: "ClientOps CRM support after pilot kickoff.",
        amount: 28000,
        targetInvoiceOffsetDays: 30,
        billing_type: "monthly",
        status: "planned",
        sort_order: 1,
      },
    ],
  },
];

export const DEMO_AGENT_RUNS: DemoAgentRun[] = [
  {
    key: "run-qualify-beauty",
    agent_name: "Lead Qualification Agent",
    workflow_type: "qualify_lead",
    subjectType: "lead",
    subjectKey: "lead-beauty",
    status: "completed",
    output_summary: "Qualified Harbour Beauty Lab at 82.",
    confidence_score: 0.78,
    human_review_required: false,
    model_used: "deterministic-fallback",
  },
  {
    key: "run-reply-logistics",
    agent_name: "Reply Draft Agent",
    workflow_type: "draft_reply",
    subjectType: "lead",
    subjectKey: "lead-logistics",
    status: "waiting_approval",
    output_summary: "Drafted CRM handoff reply for Pearl Logistics.",
    confidence_score: 0.66,
    human_review_required: true,
    model_used: "deterministic-fallback",
  },
  {
    key: "run-quote-fitness",
    agent_name: "Quotation Agent",
    workflow_type: "draft_quote",
    subjectType: "lead",
    subjectKey: "lead-fitness",
    status: "waiting_approval",
    output_summary: "Drafted quote QT-DEMO-001.",
    confidence_score: 0.71,
    human_review_required: true,
    model_used: "deterministic-fallback",
  },
  {
    key: "run-risk-apex",
    agent_name: "Renewal Risk Agent",
    workflow_type: "score_renewal_risk",
    subjectType: "engagement",
    subjectKey: "apex-crm",
    status: "waiting_approval",
    output_summary: "High renewal risk detected for Apex CRM.",
    confidence_score: 0.62,
    human_review_required: true,
    model_used: "deterministic-fallback",
  },
  {
    key: "run-risk-harbour",
    agent_name: "Renewal Risk Agent",
    workflow_type: "score_renewal_risk",
    subjectType: "engagement",
    subjectKey: "harbour-dashboard",
    status: "completed",
    output_summary: "Low risk retained for Harbour dashboard.",
    confidence_score: 0.74,
    human_review_required: false,
    model_used: "deterministic-fallback",
  },
  {
    key: "run-qualify-hotel",
    agent_name: "Lead Qualification Agent",
    workflow_type: "qualify_lead",
    subjectType: "lead",
    subjectKey: "lead-hotel",
    status: "running",
    output_summary: "Qualification running.",
    confidence_score: null,
    human_review_required: false,
    model_used: "anthropic/claude-sonnet-4-6",
  },
  {
    key: "run-reply-finance",
    agent_name: "Reply Draft Agent",
    workflow_type: "draft_reply",
    subjectType: "lead",
    subjectKey: "lead-finance",
    status: "failed",
    output_summary: "Reply draft failed after compliance ambiguity.",
    confidence_score: null,
    human_review_required: false,
    model_used: "deterministic-fallback",
  },
];

export const DEMO_APPROVALS: DemoApproval[] = [
  {
    key: "approval-reply-logistics",
    runKey: "run-reply-logistics",
    approval_type: "message_send",
    assignedToKey: "manager",
    status: "pending",
    context_summary: "Review drafted CRM handoff reply before sending.",
  },
  {
    key: "approval-quote-fitness",
    runKey: "run-quote-fitness",
    approval_type: "quote_send",
    assignedToKey: "manager",
    status: "pending",
    context_summary: "Approve dashboard plus WhatsApp quote for North Point Fitness.",
  },
  {
    key: "approval-risk-apex",
    runKey: "run-risk-apex",
    approval_type: "cs_risk_review",
    assignedToKey: "manager",
    status: "escalated",
    context_summary: "Confirm high-risk renewal score for Apex CRM before applying.",
  },
  {
    key: "approval-qualification-finance",
    runKey: "run-reply-finance",
    approval_type: "qualification_review",
    assignedToKey: "manager",
    status: "rejected",
    context_summary: "Qualification review rejected due to compliance and budget risk.",
  },
];

export const DEMO_TASKS: DemoTask[] = [
  {
    key: "task-retail-call",
    title: "Call Smoke Test Retail Group",
    description: "Confirm Q3 campaign deadline and CRM pain points.",
    assignedToKey: "sales",
    priority: "high",
    status: "open",
    dueDateKey: "futureTask",
    leadKey: "lead-retail",
  },
  {
    key: "task-logistics-reply",
    title: "Review Pearl Logistics reply",
    description: "Manager review before sending CRM handoff email.",
    assignedToKey: "manager",
    priority: "medium",
    status: "in_progress",
    dueDateKey: "futureTask",
    leadKey: "lead-logistics",
  },
  {
    key: "task-apex-save",
    title: "Apex renewal save call",
    description: "Book decision-maker meeting before overdue renewal drifts further.",
    assignedToKey: "cs",
    priority: "high",
    status: "open",
    dueDateKey: "overdueTask",
    clientKey: "client-apex",
  },
  {
    key: "task-pearl-handoff",
    title: "Close Pearl handoff gaps",
    description: "Resolve overdue CRM owner mapping items.",
    assignedToKey: "sales",
    priority: "medium",
    status: "open",
    dueDateKey: "overdueTask",
    clientKey: "client-pearl",
  },
  {
    key: "task-harbour-qbr",
    title: "Send Harbour QBR recap",
    description: "Share dashboard wins and KOC renewal options.",
    assignedToKey: "cs",
    priority: "low",
    status: "done",
    dueDateKey: null,
    clientKey: "client-harbour",
  },
];

export const DEMO_TOUCHPOINTS: DemoTouchpoint[] = [
  {
    key: "touch-apex-old",
    clientKey: "client-apex",
    engagementKey: "apex-crm",
    contactKey: "apex-jane",
    type: "call",
    sentiment: "negative",
    notes: "Jane flagged poor renewal visibility and asked for a senior review.",
    occurredAtKey: "staleTouch",
    loggedByKey: "cs",
  },
  {
    key: "touch-apex-risk",
    clientKey: "client-apex",
    engagementKey: "apex-risk",
    contactKey: "apex-oscar",
    type: "email",
    sentiment: "neutral",
    notes: "Oscar confirmed dashboard usage but asked for renewal pricing.",
    occurredAtKey: "recentTouch",
    loggedByKey: "cs",
  },
  {
    key: "touch-harbour-qbr",
    clientKey: "client-harbour",
    engagementKey: null,
    contactKey: "harbour-elaine",
    type: "qbr",
    sentiment: "positive",
    notes: "Elaine reported stronger KOC conversion and wants Q4 options.",
    occurredAtKey: "recentTouch",
    loggedByKey: "cs",
  },
  {
    key: "touch-pearl-old",
    clientKey: "client-pearl",
    engagementKey: "pearl-crm",
    contactKey: "pearl-ronald",
    type: "meeting",
    sentiment: "neutral",
    notes: "Ronald needs internal owner alignment before next CRM review.",
    occurredAtKey: "staleTouch",
    loggedByKey: "sales",
  },
  {
    key: "touch-cafe-kickoff",
    clientKey: "client-cafe",
    engagementKey: "cafe-whatsapp",
    contactKey: "cafe-iris",
    type: "whatsapp",
    sentiment: "positive",
    notes: "Iris approved pilot success metrics and first automation flow.",
    occurredAtKey: "recentTouch",
    loggedByKey: "sales",
  },
];

export const DEMO_NOTIFICATIONS: DemoNotification[] = [
  {
    key: "notify-apex-overdue",
    userKey: "cs",
    type: "renewal_window",
    title: "Apex Retail Group renewal is overdue",
    body: "The ClientOps CRM engagement crossed the overdue renewal boundary.",
    objectType: "engagement",
    objectKey: "apex-crm",
    read: false,
  },
  {
    key: "notify-pearl-stale",
    userKey: "sales",
    type: "stale_touchpoint",
    title: "Pearl Logistics has no recent touchpoint",
    body: "The CRM engagement has been stale for 30+ days.",
    objectType: "engagement",
    objectKey: "pearl-crm",
    read: false,
  },
  {
    key: "notify-risk-apex",
    userKey: "manager",
    type: "risk_change",
    title: "Apex CRM risk changed to high",
    body: "Review the held CS risk score before it is applied.",
    objectType: "engagement",
    objectKey: "apex-crm",
    read: false,
  },
  {
    key: "notify-quote-approval",
    userKey: "manager",
    type: "approval_pending",
    title: "Quote approval pending",
    body: "North Point Fitness quote needs review.",
    objectType: "approval",
    objectKey: "approval-quote-fitness",
    read: false,
  },
  {
    key: "notify-harbour-read",
    userKey: "cs",
    type: "renewal_window",
    title: "Harbour dashboard renewal in 90 days",
    body: "Prepare expansion options after the positive QBR.",
    objectType: "engagement",
    objectKey: "harbour-dashboard",
    read: true,
  },
];
