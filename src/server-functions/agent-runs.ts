import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import { listActivityLogs } from "@/server/repositories/activity-logs";
import { getAgentRunWithCalls, listAgentRuns } from "@/server/repositories/agent-runs";
import {
  serializeActivityLog,
  serializeAgentRun,
  serializeAgentToolCall,
} from "@/server-functions/serializers";

export const getAgentRuns = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as { agent?: string; status?: string })
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    const runs = await listAgentRuns(data);
    return runs.map(serializeAgentRun);
  });

export const getAgentRun = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    const result = await getAgentRunWithCalls(data.id);
    return {
      run: serializeAgentRun(result.run),
      toolCalls: result.toolCalls.map(serializeAgentToolCall),
    };
  });

export const getActivityLogs = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as { object_id?: string })
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    const logs = await listActivityLogs(data);
    return logs.map(serializeActivityLog);
  });
