import type {
  Account,
  AccountContact,
  Client,
  Engagement,
  Lead,
  Quote,
  RelationshipSignal,
  Task,
} from "@/lib/types";
import type { AccountTimelineEntry } from "@/lib/relationship/types";
import type { DatabaseFailureKind } from "@/server/db/postgres-error";
import type { JobSheetListItem } from "@/server/repositories/job-sheets";

export type CompanyWorkspaceSection =
  | "commercial"
  | "delivery_finance"
  | "activity"
  | "intelligence";

/**
 * The database-derived codes come from `DatabaseFailureKind` rather than being restated, so
 * adding a kind there cannot leave this union silently behind. `company_not_found` and
 * `access_denied` are app-level — the code throws them itself, they are not SQLSTATEs.
 */
export type CompanyWorkspaceErrorCode = DatabaseFailureKind | "company_not_found" | "access_denied";

export type CompanyWorkspaceError = {
  code: CompanyWorkspaceErrorCode;
  requestId: string;
  retryable: boolean;
  section?: CompanyWorkspaceSection;
};

export type SectionState<T> =
  | { status: "ready"; data: T }
  | { status: "empty"; data: T }
  | { status: "error"; error: CompanyWorkspaceError; staleData?: T };

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

/**
 * Which optional Overview aggregates the caller may see.
 *
 * The core read loads the Overview before any section capability is evaluated; its quote
 * totals belong to `quotes.view` and its open signals to `engagements.view`. The handler
 * evaluates both as optional capabilities on the account and passes the flags here, so a
 * caller denied either capability gets an empty aggregate instead of data from a table it
 * cannot read.
 */
export type CompanyWorkspaceOverviewAccess = {
  quotes: boolean;
  engagements: boolean;
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
    jobSheets: JobSheetListItem[];
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
  /**
   * Which section reads the caller may load, evaluated on the same account target as the
   * section handlers. The UI hides tabs whose section is denied instead of firing a read the
   * server is certain to refuse; the section handlers remain the authoritative gate.
   */
  sectionAccess: Record<CompanyWorkspaceSection, boolean>;
  cache: {
    core: CompanyWorkspaceCacheMetadata;
    overview: CompanyWorkspaceCacheMetadata;
    sections: Partial<Record<CompanyWorkspaceSection, CompanyWorkspaceCacheMetadata>>;
  };
};

/** The loader payload before the request-level `sectionAccess` flags are attached. */
export type CompanyWorkspaceReadData = Omit<CompanyWorkspaceRead, "sectionAccess">;
