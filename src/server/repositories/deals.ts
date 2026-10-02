import { query, transaction } from "@/server/db/neon.server";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import {
  readDomainWorkspace,
  domainOperation,
  insertDomainRow,
  updateDomainRow,
  readDomainRows,
  requireDomainRow,
  pickColumns,
} from "./domain-sql";

import type { Deal, EngagementEvent, Project, Task } from "@/lib/types";

const DEAL_WRITE_COLUMNS = [
  "account_id",
  "contact_id",
  "lead_id",
  "quote_id",
  "source_campaign_id",
  "name",
  "stage",
  "status",
  "probability",
  "value",
  "currency",
  "expected_close_date",
  "owner",
] as const;

export type DealFilters = {
  status?: string;
  stage?: string;
  owner?: string;
  account_id?: string;
  contact_id?: string;
  source_campaign_id?: string;
};

export type CreateDealInput = Pick<Deal, "name"> &
  Partial<
    Pick<
      Deal,
      | "account_id"
      | "contact_id"
      | "lead_id"
      | "quote_id"
      | "source_campaign_id"
      | "stage"
      | "status"
      | "probability"
      | "value"
      | "currency"
      | "expected_close_date"
      | "owner"
    >
  >;

export type ForecastDealFilters = {
  owner?: string;
  close_before?: string;
};

export type DealWorkspace = {
  deal: Deal | null;
  engagementEvents: EngagementEvent[];
  projects: Project[];
  tasks: Task[];
};

export async function listDeals(
  filters: DealFilters = {},
  context?: RequestAuthorization,
): Promise<Deal[]> {
  return domainOperation("load deals", () =>
    readDomainRows<Deal>(
      "deals",
      pickColumns(filters, [
        "status",
        "stage",
        "owner",
        "account_id",
        "contact_id",
        "source_campaign_id",
      ]),
      context,
    ),
  );
}
export async function getDealWorkspace(
  id: string,
  context?: RequestAuthorization,
): Promise<DealWorkspace> {
  return readDomainWorkspace<DealWorkspace>({
    deal: { description: "load this deal", promise: requireDomainRow<Deal>("deals", id, context) },
    engagementEvents: {
      description: "load this deal's engagement events",
      promise: readDomainRows<EngagementEvent>("engagement_events", { deal_id: id }, context, {
        order: "d.occurred_at desc,d.id",
        limit: 50,
      }),
    },
    projects: {
      description: "load this deal's projects",
      promise: readDomainRows<Project>("projects", { deal_id: id }, context),
    },
    tasks: {
      description: "load this deal's tasks",
      promise: readDomainRows<Task>("tasks", { deal_id: id }, context),
    },
  });
}
export async function createDeal(input: CreateDealInput): Promise<Deal> {
  return domainOperation("create this deal", () =>
    insertDomainRow<Deal>("deals", pickColumns(input, DEAL_WRITE_COLUMNS)),
  );
}
export async function updateDeal(id: string, updates: Partial<Deal>): Promise<Deal> {
  return domainOperation("update this deal", () =>
    updateDomainRow<Deal>("deals", id, pickColumns(updates, DEAL_WRITE_COLUMNS)),
  );
}
export async function listOpenDeals(
  filters: ForecastDealFilters = {},
  context?: RequestAuthorization,
): Promise<Deal[]> {
  return domainOperation("load the forecast", () =>
    readDomainRows<Deal>("deals", { status: "open", owner: filters.owner }, context, {
      before: filters.close_before ? ["expected_close_date", filters.close_before] : undefined,
    }),
  );
}
