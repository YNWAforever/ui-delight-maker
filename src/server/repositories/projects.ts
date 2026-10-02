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

import type { CustomerSuccessProfile, Deal, EngagementEvent, Project, Task } from "@/lib/types";

const PROJECT_WRITE_COLUMNS = [
  "account_id",
  "contact_id",
  "deal_id",
  "quote_id",
  "name",
  "status",
  "start_date",
  "target_end_date",
  "owner",
  "value",
  "currency",
] as const;

export type ProjectFilters = {
  status?: string;
  owner?: string;
  account_id?: string;
  contact_id?: string;
  deal_id?: string;
};

export type CreateProjectInput = Pick<Project, "name"> &
  Partial<
    Pick<
      Project,
      | "account_id"
      | "contact_id"
      | "deal_id"
      | "quote_id"
      | "status"
      | "start_date"
      | "target_end_date"
      | "owner"
      | "value"
      | "currency"
    >
  >;

export type ProjectWorkspace = {
  project: Project;
  engagementEvents: EngagementEvent[];
  tasks: Task[];
  customerSuccessProfile: CustomerSuccessProfile | null;
};

export async function listProjects(
  filters: ProjectFilters = {},
  context?: RequestAuthorization,
): Promise<Project[]> {
  return domainOperation("load projects", () =>
    readDomainRows<Project>(
      "projects",
      pickColumns(filters, ["status", "owner", "account_id", "contact_id", "deal_id"]),
      context,
    ),
  );
}
export async function getProjectWorkspace(
  id: string,
  context?: RequestAuthorization,
): Promise<ProjectWorkspace> {
  return readDomainWorkspace<ProjectWorkspace>({
    project: {
      description: "load this project",
      promise: requireDomainRow<Project>("projects", id, context),
    },
    engagementEvents: {
      description: "load this project's engagement events",
      promise: readDomainRows<EngagementEvent>("engagement_events", { project_id: id }, context, {
        order: "d.occurred_at desc,d.id",
        limit: 50,
      }),
    },
    tasks: {
      description: "load this project's tasks",
      promise: readDomainRows<Task>("tasks", { project_id: id }, context),
    },
    customerSuccessProfile: {
      description: "load this project's customer-success profile",
      promise: readDomainRows<CustomerSuccessProfile>(
        "customer_success_profiles",
        { project_id: id },
        context,
      ).then((rows) => rows[0] ?? null),
    },
  });
}
export async function createProject(input: CreateProjectInput): Promise<Project> {
  return domainOperation("create this project", () =>
    insertDomainRow<Project>("projects", pickColumns(input, PROJECT_WRITE_COLUMNS)),
  );
}
export async function updateProject(id: string, updates: Partial<Project>): Promise<Project> {
  return domainOperation("update this project", () =>
    updateDomainRow<Project>("projects", id, pickColumns(updates, PROJECT_WRITE_COLUMNS)),
  );
}
export async function getDealForProject(dealId: string): Promise<Deal> {
  return domainOperation("load this deal", () => requireDomainRow<Deal>("deals", dealId));
}
