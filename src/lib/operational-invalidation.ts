import { crmQueryKeys } from "@/lib/query-keys";

type OperationalMutation =
  | { type: "task-status"; id: string }
  | { type: "approval-decision"; id: string }
  | { type: "notification-read"; id: string }
  | { type: "agent-run"; agent: string };

export function getOperationalMutationKeys(mutation: OperationalMutation) {
  switch (mutation.type) {
    case "task-status":
      return [crmQueryKeys.tasks.detail(mutation.id), crmQueryKeys.tasks.lists()];
    case "approval-decision":
      return [
        crmQueryKeys.approvals.detail(mutation.id),
        crmQueryKeys.approvals.lists(),
        crmQueryKeys.aiReview.all(),
      ];
    case "notification-read":
      return [
        crmQueryKeys.notifications.detail(mutation.id),
        crmQueryKeys.notifications.lists(),
        crmQueryKeys.shell(),
      ];
    case "agent-run":
      return [
        crmQueryKeys.agents.section(mutation.agent, "history"),
        crmQueryKeys.agents.lists(),
        crmQueryKeys.aiReview.all(),
      ];
  }
}
