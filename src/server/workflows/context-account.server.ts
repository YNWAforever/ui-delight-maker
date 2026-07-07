import type { AccountWorkflowContextResponse } from "@/lib/workflows/types";
import type { AgentRun } from "@/lib/types";
import { listAccountContacts } from "@/server/repositories/account-contacts";
import { getAccountTimeline } from "@/server/repositories/account-timeline";
import { getAccount } from "@/server/repositories/accounts";
import { getAgentRunWithCalls, type SubjectType } from "@/server/repositories/agent-runs";
import { listRelationshipSignals } from "@/server/repositories/relationship-signals";

type AgentRunWithSubject = AgentRun & { subject_type: SubjectType; subject_id: string };

export async function getAccountWorkflowContext(input: {
  accountId: string;
  agentRunId: string;
}): Promise<AccountWorkflowContextResponse> {
  const [account, contacts, timeline, openSignals, agentRun] = await Promise.all([
    getAccount(input.accountId),
    listAccountContacts(input.accountId),
    getAccountTimeline({ accountId: input.accountId }),
    listRelationshipSignals({ account_id: input.accountId, openOnly: true }),
    getAgentRunWithCalls(input.agentRunId),
  ]);

  const run = agentRun.run as AgentRunWithSubject;
  if (run.subject_type !== "account" || run.subject_id !== input.accountId) {
    throw new Error("Agent run does not belong to this account");
  }

  return {
    account,
    contacts,
    timeline: timeline.slice(0, 50),
    open_signals: openSignals,
    agent_run: run,
  };
}
