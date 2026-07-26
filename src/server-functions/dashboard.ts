import { createServerFn } from "@tanstack/react-start";
import { requireCapability } from "@/server/auth/authorization.server";
import { getDashboardReadModel } from "@/server/read-models/dashboard";
import {
  serializeActivityLog,
  serializeAgentRun,
  serializeHumanApproval,
} from "@/lib/serializable";

export const getDashboard = createServerFn({ method: "GET" }).handler(async () => {
  await requireCapability("leads.view");
  const dashboard = await getDashboardReadModel();

  return {
    ...dashboard,
    approvals: dashboard.approvals.map(serializeHumanApproval),
    agentRuns: dashboard.agentRuns.map(serializeAgentRun),
    activityLogs: dashboard.activityLogs.map(serializeActivityLog),
  };
});

export const getDashboardRead = getDashboard;
