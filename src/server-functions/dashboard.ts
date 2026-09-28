import { createServerFn } from "@tanstack/react-start";
import { loadRequestAuthorization, requireAnyCapability } from "@/server/auth/authorization.server";
import { getDashboardReadModel } from "@/server/read-models/dashboard";
import {
  serializeActivityLog,
  serializeAgentRun,
  serializeHumanApproval,
} from "@/lib/serializable";

export const getDashboard = createServerFn({ method: "GET" }).handler(async () => {
  const context = await loadRequestAuthorization();
  await requireAnyCapability(
    ["leads.view", "job_sheets.view", "quotes.view", "tasks.view", "approvals.view"],
    {},
    context,
  );
  const dashboard = await getDashboardReadModel(context);

  return {
    ...dashboard,
    approvals: dashboard.approvals.map(serializeHumanApproval),
    agentRuns: dashboard.agentRuns.map(serializeAgentRun),
    activityLogs: dashboard.activityLogs.map(serializeActivityLog),
  };
});

export const getDashboardRead = getDashboard;
