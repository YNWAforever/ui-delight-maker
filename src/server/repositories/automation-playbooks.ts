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

import type { AutomationPlaybook, AutomationRun } from "@/lib/types";

const PLAYBOOK_CREATE_COLUMNS = [
  "name",
  "trigger_type",
  "description",
  "status",
  "steps",
  "created_by",
] as const;
const PLAYBOOK_UPDATE_COLUMNS = ["name", "description", "trigger_type", "status", "steps"] as const;
const RUN_CREATE_COLUMNS = [
  "playbook_id",
  "contact_id",
  "account_id",
  "deal_id",
  "project_id",
  "trigger_event_id",
  "status",
  "context_data",
  "started_at",
] as const;
const RUN_UPDATE_COLUMNS = [
  "status",
  "output_data",
  "error_message",
  "started_at",
  "finished_at",
] as const;

export type AutomationPlaybookFilters = {
  status?: string;
  trigger_type?: string;
};

export type CreateAutomationPlaybookInput = Pick<AutomationPlaybook, "name" | "trigger_type"> &
  Partial<Pick<AutomationPlaybook, "description" | "status" | "steps" | "created_by">>;

export type CreateAutomationRunInput = Partial<
  Pick<
    AutomationRun,
    | "playbook_id"
    | "contact_id"
    | "account_id"
    | "deal_id"
    | "project_id"
    | "trigger_event_id"
    | "status"
    | "context_data"
    | "started_at"
  >
>;

export type AutomationPlaybookDetail = {
  playbook: AutomationPlaybook;
  runs: AutomationRun[];
};

export async function listAutomationPlaybooks(
  filters: AutomationPlaybookFilters = {},
  context?: RequestAuthorization,
): Promise<AutomationPlaybook[]> {
  return domainOperation("load automation playbooks", () =>
    readDomainRows<AutomationPlaybook>(
      "automation_playbooks",
      pickColumns(filters, ["status", "trigger_type"]),
      context,
    ),
  );
}
export async function getAutomationPlaybookDetail(
  id: string,
  context?: RequestAuthorization,
): Promise<AutomationPlaybookDetail> {
  return readDomainWorkspace<AutomationPlaybookDetail>({
    playbook: {
      description: "load this automation playbook",
      promise: requireDomainRow<AutomationPlaybook>("automation_playbooks", id, context),
    },
    runs: {
      description: "load this playbook's runs",
      promise: readDomainRows<AutomationRun>("automation_runs", { playbook_id: id }, context, {
        limit: 100,
      }),
    },
  });
}
export async function createAutomationPlaybook(
  input: CreateAutomationPlaybookInput,
): Promise<AutomationPlaybook> {
  return domainOperation("create this automation playbook", () =>
    insertDomainRow<AutomationPlaybook>(
      "automation_playbooks",
      pickColumns(input, PLAYBOOK_CREATE_COLUMNS),
    ),
  );
}
export async function updateAutomationPlaybook(
  id: string,
  updates: Partial<AutomationPlaybook>,
): Promise<AutomationPlaybook> {
  return domainOperation("update this automation playbook", () =>
    updateDomainRow<AutomationPlaybook>(
      "automation_playbooks",
      id,
      pickColumns(updates, PLAYBOOK_UPDATE_COLUMNS),
    ),
  );
}
export async function createAutomationRun(input: CreateAutomationRunInput): Promise<AutomationRun> {
  return domainOperation("start this automation run", () =>
    insertDomainRow<AutomationRun>("automation_runs", pickColumns(input, RUN_CREATE_COLUMNS)),
  );
}
export async function updateAutomationRun(
  id: string,
  updates: Partial<AutomationRun>,
): Promise<AutomationRun> {
  return domainOperation("update this automation run", () =>
    updateDomainRow<AutomationRun>("automation_runs", id, pickColumns(updates, RUN_UPDATE_COLUMNS)),
  );
}
