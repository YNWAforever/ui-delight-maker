import type {
  ActivityLog,
  AgentRun,
  AgentToolCall,
  AutomationPlaybook,
  AutomationRun,
  HumanApproval,
  Lead,
  Quote,
  Task,
} from "@/lib/types";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type SerializableActivityLog = Omit<ActivityLog, "diff_data"> & {
  diff_data: JsonValue;
};

export type SerializableAgentRun = Omit<AgentRun, "input_data" | "output_data"> & {
  input_data: JsonValue;
  output_data: JsonValue;
};

export type SerializableAgentToolCall = Omit<AgentToolCall, "input_params" | "output_result"> & {
  input_params: JsonValue;
  output_result: JsonValue;
};

export type SerializableAutomationPlaybook = Omit<AutomationPlaybook, "steps"> & {
  steps: JsonValue;
};

export type SerializableAutomationRun = Omit<AutomationRun, "context_data" | "output_data"> & {
  context_data: JsonValue;
  output_data: JsonValue;
};

export type SerializableHumanApproval = Omit<HumanApproval, "context_data"> & {
  context_data: JsonValue;
};

export type SerializablePipelineData = {
  leads: Lead[];
  quotes: Quote[];
  tasks: Task[];
  approvals: SerializableHumanApproval[];
  agentRuns: SerializableAgentRun[];
};

export function toJsonValue(value: unknown): JsonValue {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value ?? null)) as JsonValue;
}

export function serializeActivityLog(log: ActivityLog): SerializableActivityLog {
  return {
    ...log,
    diff_data: toJsonValue(log.diff_data),
  };
}

export function serializeAgentRun(run: AgentRun): SerializableAgentRun {
  return {
    ...run,
    input_data: toJsonValue(run.input_data),
    output_data: toJsonValue(run.output_data),
  };
}

export function serializeAgentToolCall(call: AgentToolCall): SerializableAgentToolCall {
  return {
    ...call,
    input_params: toJsonValue(call.input_params),
    output_result: toJsonValue(call.output_result),
  };
}

export function serializeAutomationPlaybook(
  playbook: AutomationPlaybook,
): SerializableAutomationPlaybook {
  return {
    ...playbook,
    steps: toJsonValue(playbook.steps),
  };
}

export function serializeAutomationRun(run: AutomationRun): SerializableAutomationRun {
  return {
    ...run,
    context_data: toJsonValue(run.context_data),
    output_data: toJsonValue(run.output_data),
  };
}

export function serializeHumanApproval(approval: HumanApproval): SerializableHumanApproval {
  return {
    ...approval,
    context_data: toJsonValue(approval.context_data),
  };
}

export function serializePipelineData(input: {
  leads: Lead[];
  quotes: Quote[];
  tasks: Task[];
  approvals: HumanApproval[];
  agentRuns: AgentRun[];
}): SerializablePipelineData {
  return {
    leads: input.leads,
    quotes: input.quotes,
    tasks: input.tasks,
    approvals: input.approvals.map(serializeHumanApproval),
    agentRuns: input.agentRuns.map(serializeAgentRun),
  };
}
