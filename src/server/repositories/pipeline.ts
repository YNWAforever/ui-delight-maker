import type { AgentRun, HumanApproval, Lead, Quote, Task } from "@/lib/types";
import { listRecentAgentRuns } from "./agent-runs";
import { listActiveApprovals } from "./approvals";
import { listLeads } from "./leads";
import { listQuotes } from "./quotes";
import { listOpenTasksByDueDate } from "./tasks";

export interface PipelineData {
  leads: Lead[];
  quotes: Quote[];
  tasks: Task[];
  approvals: HumanApproval[];
  agentRuns: AgentRun[];
}

export async function getPipelineData(): Promise<PipelineData> {
  const [leads, quotes, tasks, approvals, agentRuns] = await Promise.all([
    listLeads(),
    listQuotes(),
    listOpenTasksByDueDate(),
    listActiveApprovals(),
    listRecentAgentRuns(50),
  ]);

  return { leads, quotes, tasks, approvals, agentRuns };
}
