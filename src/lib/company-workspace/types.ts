import type {
  Account,
  AccountContact,
  Client,
  Engagement,
  JobSheet,
  Quote,
  RelationshipSignal,
  Task,
} from "@/lib/types";
import type { AccountTimelineEntry } from "@/lib/relationship/types";

export const workspaceSections = [
  "core",
  "overview",
  "stakeholders",
  "activity",
  "commercial",
  "deliveryFinance",
] as const;

export type WorkspaceSection = (typeof workspaceSections)[number];
export type WorkspaceFreshness = "default" | "network-only";

export type WorkspaceSectionMeta = {
  correlationId: string;
  fetchedAt: string;
  durationMs: number;
  source: "network" | "cache";
};

export type WorkspaceSectionError = {
  code: "SECTION_READ_FAILED";
  message: string;
};

export type WorkspaceSectionResult<T> =
  | { status: "ready"; data: T; meta: WorkspaceSectionMeta }
  | { status: "empty"; data: T; meta: WorkspaceSectionMeta }
  | {
      status: "error";
      error: WorkspaceSectionError;
      meta: WorkspaceSectionMeta;
    };

export type CoreProjection = {
  account: Account;
  peopleCount: number;
};

export type QuoteSummary = Pick<
  Quote,
  "id" | "number" | "status" | "total_value" | "currency" | "created_at"
>;

export type OverviewProjection = {
  openSignals: RelationshipSignal[];
  openSignalCount: number;
  linkedClients: Client[];
  activeEngagementCount: number;
  quoteSummaries: QuoteSummary[];
};

export type StakeholdersProjection = { contacts: AccountContact[] };
export type ActivityProjection = { timeline: AccountTimelineEntry[] };
export type CommercialProjection = { engagements: Engagement[]; quotes: Quote[] };
export type DeliveryFinanceProjection = {
  tasks: Task[];
  jobSheets: JobSheet[];
  quoteSummaries: QuoteSummary[];
};

export type WorkspaceProjectionMap = {
  core: CoreProjection;
  overview: OverviewProjection;
  stakeholders: StakeholdersProjection;
  activity: ActivityProjection;
  commercial: CommercialProjection;
  deliveryFinance: DeliveryFinanceProjection;
};

export type CompanyWorkspaceRequest = {
  accountId: string;
  sections: readonly WorkspaceSection[];
  freshness?: WorkspaceFreshness;
};

export type CompanyWorkspaceResponse = {
  accountId: string;
  sections: Partial<{
    [Section in WorkspaceSection]: WorkspaceSectionResult<WorkspaceProjectionMap[Section]>;
  }>;
  meta: { correlationId: string; generatedAt: string };
};
