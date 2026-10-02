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

import type { CustomerSuccessProfile, Project, SuccessTouchpoint, Task } from "@/lib/types";

const PROFILE_UPSERT_COLUMNS = [
  "account_id",
  "primary_contact_id",
  "project_id",
  "cs_owner",
  "health_score",
  "onboarding_status",
  "renewal_date",
  "renewal_risk",
  "next_best_action",
  "expansion_signal",
  "last_touch_at",
] as const;
const PROFILE_UPDATE_COLUMNS = [
  "primary_contact_id",
  "project_id",
  "cs_owner",
  "health_score",
  "onboarding_status",
  "renewal_date",
  "renewal_risk",
  "next_best_action",
  "expansion_signal",
  "last_touch_at",
] as const;
const TOUCHPOINT_CREATE_COLUMNS = [
  "account_id",
  "contact_id",
  "project_id",
  "touchpoint_type",
  "sentiment",
  "notes",
  "occurred_at",
  "created_by",
] as const;

export type CustomerSuccessProfileFilters = {
  cs_owner?: string;
  renewal_risk?: string;
  onboarding_status?: string;
  renewal_before?: string;
};

export type UpsertCustomerSuccessProfileInput = Pick<CustomerSuccessProfile, "account_id"> &
  Partial<
    Pick<
      CustomerSuccessProfile,
      | "primary_contact_id"
      | "project_id"
      | "cs_owner"
      | "health_score"
      | "onboarding_status"
      | "renewal_date"
      | "renewal_risk"
      | "next_best_action"
      | "expansion_signal"
      | "last_touch_at"
    >
  >;

export type CreateSuccessTouchpointInput = Pick<SuccessTouchpoint, "account_id"> &
  Partial<
    Pick<
      SuccessTouchpoint,
      | "contact_id"
      | "project_id"
      | "touchpoint_type"
      | "sentiment"
      | "notes"
      | "occurred_at"
      | "created_by"
    >
  >;

export type CustomerSuccessAccountWorkspace = {
  profile: CustomerSuccessProfile | null;
  touchpoints: SuccessTouchpoint[];
  projects: Project[];
  tasks: Task[];
};

export type CustomerSuccessRiskInputs = Pick<
  CustomerSuccessProfile,
  "health_score" | "renewal_date"
>;

export type RenewalRiskOverride = Pick<
  CustomerSuccessProfile,
  "renewal_risk" | "next_best_action"
> | null;

export async function listCustomerSuccessProfiles(
  filters: CustomerSuccessProfileFilters = {},
  context?: RequestAuthorization,
): Promise<CustomerSuccessProfile[]> {
  return domainOperation("load customer-success profiles", () =>
    readDomainRows<CustomerSuccessProfile>(
      "customer_success_profiles",
      pickColumns(filters, ["cs_owner", "renewal_risk", "onboarding_status"]),
      context,
      {
        order: "d.renewal_date asc nulls last,d.id",
        before: filters.renewal_before ? ["renewal_date", filters.renewal_before] : undefined,
      },
    ),
  );
}
export async function listCustomerSuccessProfilesForDashboard(
  context?: RequestAuthorization,
): Promise<CustomerSuccessProfile[]> {
  return listCustomerSuccessProfiles({}, context);
}
export async function getCustomerSuccessAccountWorkspace(
  accountId: string,
  context?: RequestAuthorization,
): Promise<CustomerSuccessAccountWorkspace> {
  return readDomainWorkspace<CustomerSuccessAccountWorkspace>({
    profile: {
      description: "load this customer-success profile",
      promise: readDomainRows<CustomerSuccessProfile>(
        "customer_success_profiles",
        { account_id: accountId },
        context,
      ).then((rows) => rows[0] ?? null),
    },
    touchpoints: {
      description: "load this account's success touchpoints",
      promise: readDomainRows<SuccessTouchpoint>(
        "success_touchpoints",
        { account_id: accountId },
        context,
        { order: "d.occurred_at desc,d.id", limit: 50 },
      ),
    },
    projects: {
      description: "load this account's projects",
      promise: readDomainRows<Project>("projects", { account_id: accountId }, context),
    },
    tasks: {
      description: "load this account's tasks",
      promise: readDomainRows<Task>("tasks", { account_id: accountId }, context),
    },
  });
}
export async function upsertCustomerSuccessProfile(
  input: UpsertCustomerSuccessProfileInput,
): Promise<CustomerSuccessProfile> {
  return domainOperation("save this customer-success profile", () =>
    insertDomainRow<CustomerSuccessProfile>(
      "customer_success_profiles",
      pickColumns(input, PROFILE_UPSERT_COLUMNS),
      undefined,
      { columns: ["account_id"], update: PROFILE_UPDATE_COLUMNS },
    ),
  );
}
export async function getCustomerSuccessRiskInputs(id: string): Promise<CustomerSuccessRiskInputs> {
  return domainOperation("load this customer-success profile", async () => {
    const row = await requireDomainRow<CustomerSuccessProfile>("customer_success_profiles", id);
    return { health_score: row.health_score, renewal_date: row.renewal_date };
  });
}
export async function updateCustomerSuccessProfile(
  id: string,
  updates: Partial<CustomerSuccessProfile>,
  riskOverride: RenewalRiskOverride = null,
): Promise<CustomerSuccessProfile> {
  return domainOperation("update this customer-success profile", () =>
    updateDomainRow<CustomerSuccessProfile>("customer_success_profiles", id, {
      ...pickColumns(updates, PROFILE_UPDATE_COLUMNS),
      ...riskOverride,
    }),
  );
}
export async function createSuccessTouchpoint(
  input: CreateSuccessTouchpointInput,
): Promise<SuccessTouchpoint> {
  return domainOperation("record this success touchpoint", () =>
    transaction(async (db) => {
      const row = await insertDomainRow<SuccessTouchpoint>(
        "success_touchpoints",
        pickColumns(input, TOUCHPOINT_CREATE_COLUMNS),
        db,
      );
      await query(
        "update customer_success_profiles set last_touch_at=greatest(last_touch_at,$2::timestamptz),updated_at=now() where account_id=$1",
        [row.account_id, row.occurred_at],
        db,
      );
      return row;
    }),
  );
}
