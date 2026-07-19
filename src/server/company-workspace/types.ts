import type {
  Account,
  AccountContact,
  Client,
  Engagement,
  JobSheet,
  Lead,
  Quote,
  RelationshipSignal,
  Task,
} from "@/lib/types";
import type { AccountTimelineEntry } from "@/lib/relationship/types";

export type CompanyWorkspaceSection =
  | "commercial"
  | "delivery_finance"
  | "activity"
  | "intelligence";

export type CompanyWorkspaceErrorCode =
  | "company_not_found"
  | "schema_mismatch"
  | "query_failed"
  | "query_timeout"
  | "access_denied";

export type CompanyWorkspaceError = {
  code: CompanyWorkspaceErrorCode;
  requestId: string;
  retryable: boolean;
  section?: CompanyWorkspaceSection;
};

export type SectionState<T> =
  | { status: "ready"; data: T }
  | { status: "empty"; data: T }
  | { status: "error"; error: CompanyWorkspaceError };

export type CompanyWorkspaceCore = {
  company: Account;
  ownership: {
    accountOwnerId: string | null;
    csOwnerId: string | null;
  };
  contacts: AccountContact[];
};

export type CompanyWorkspaceOverview = {
  linkedClientCount: number;
  activeEngagementCount: number;
  quoteCount: number;
  quoteTotals: Array<{ currency: string; quoteCount: number; totalValue: number }>;
  openSignalCount: number;
  openSignals: RelationshipSignal[];
};

export type CompanyWorkspaceSectionData = {
  commercial: {
    clients: Client[];
    engagements: Engagement[];
    leads: Lead[];
    quotes: Quote[];
  };
  delivery_finance: {
    tasks: Task[];
    jobSheets: JobSheet[];
  };
  activity: {
    timeline: AccountTimelineEntry[];
  };
  intelligence: {
    signals: RelationshipSignal[];
  };
};

export type CompanyWorkspaceSections = {
  [Section in CompanyWorkspaceSection]: SectionState<CompanyWorkspaceSectionData[Section]>;
};

export type CompanyWorkspace = {
  core: CompanyWorkspaceCore;
  sections: CompanyWorkspaceSections;
};

export type CompanyWorkspaceCacheMetadata = {
  fetchedAt: string;
  freshForMs: number;
};

export type CompanyWorkspaceRead = {
  requestId: string;
  core: CompanyWorkspaceCore;
  overview: SectionState<CompanyWorkspaceOverview>;
  sections: Partial<CompanyWorkspaceSections>;
  cache: {
    core: CompanyWorkspaceCacheMetadata;
    overview: CompanyWorkspaceCacheMetadata;
    sections: Partial<Record<CompanyWorkspaceSection, CompanyWorkspaceCacheMetadata>>;
  };
};
