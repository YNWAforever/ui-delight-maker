import { authorizeDomainLinks } from "@/server/auth/domain-links.server";
// src/server-functions/automation-playbooks.ts
import { createServerFn } from "@tanstack/react-start";
import { requireCapability, loadRequestAuthorization } from "@/server/auth/authorization.server";
import { serializeAutomationPlaybook, serializeAutomationRun } from "@/lib/serializable";
import {
  createAutomationPlaybook as createAutomationPlaybookInRepository,
  createAutomationRun as createAutomationRunInRepository,
  getAutomationPlaybookDetail,
  listAutomationPlaybooks,
  updateAutomationPlaybook as updateAutomationPlaybookInRepository,
  updateAutomationRun as updateAutomationRunInRepository,
  type AutomationPlaybookFilters,
  type CreateAutomationPlaybookInput,
  type CreateAutomationRunInput,
} from "@/server/repositories/automation-playbooks";
import type { AutomationPlaybook, AutomationRun } from "@/lib/types";

export const getAutomationPlaybooks = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as AutomationPlaybookFilters)
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability("automation.manage", {}, context);
    return (await listAutomationPlaybooks(data, context)).map(serializeAutomationPlaybook);
  });

export const getAutomationPlaybook = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability(
      "automation.manage",
      {
        resourceType: "automation_playbook",
        resourceId: data.id,
      },
      context,
    );
    const detail = await getAutomationPlaybookDetail(data.id, context);
    return {
      playbook: serializeAutomationPlaybook(detail.playbook),
      runs: detail.runs.map(serializeAutomationRun),
    };
  });

export const createAutomationPlaybook = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as CreateAutomationPlaybookInput)
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability("automation.manage", {}, context);
    await authorizeDomainLinks("automation.manage", data, context);
    return serializeAutomationPlaybook(
      await createAutomationPlaybookInRepository({ ...data, created_by: context.actor.profileId }),
    );
  });

export const updateAutomationPlaybook = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; updates: Partial<AutomationPlaybook> })
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability(
      "automation.manage",
      {
        resourceType: "automation_playbook",
        resourceId: data.id,
      },
      context,
    );
    return serializeAutomationPlaybook(
      await updateAutomationPlaybookInRepository(data.id, data.updates),
    );
  });

export const createAutomationRun = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as CreateAutomationRunInput)
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability(
      "automation.manage",
      data.playbook_id
        ? { resourceType: "automation_playbook", resourceId: data.playbook_id }
        : data.account_id
          ? { resourceType: "account", resourceId: data.account_id }
          : {},
      context,
    );
    await authorizeDomainLinks("automation.manage", data, context);
    return serializeAutomationRun(await createAutomationRunInRepository(data));
  });

export const updateAutomationRun = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; updates: Partial<AutomationRun> })
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability(
      "automation.manage",
      {
        resourceType: "automation_run",
        resourceId: data.id,
      },
      context,
    );
    return serializeAutomationRun(await updateAutomationRunInRepository(data.id, data.updates));
  });
