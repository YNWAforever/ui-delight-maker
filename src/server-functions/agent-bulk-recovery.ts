import { createServerFn } from "@tanstack/react-start";
import { parseOperationInput } from "@/lib/operations/errors";
import { loadRequestAuthorization } from "@/server/auth/authorization.server";
import {
  AgentBulkPreviewSchema,
  AgentBulkExecuteSchema,
  AgentBulkOperationSchema,
  previewAgentRecovery,
  executeAgentRecovery,
  getAgentRecoveryOperation,
  resumeAgentRecovery,
} from "@/server/commands/agent-bulk-recovery.server";
export const previewAgentRecoveryFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOperationInput(AgentBulkPreviewSchema, data))
  .handler(async ({ data }) => previewAgentRecovery(await loadRequestAuthorization(), data));
export const executeAgentRecoveryFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOperationInput(AgentBulkExecuteSchema, data))
  .handler(async ({ data }) => executeAgentRecovery(await loadRequestAuthorization(), data));
export const getAgentRecoveryOperationFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => parseOperationInput(AgentBulkOperationSchema, data))
  .handler(async ({ data }) => getAgentRecoveryOperation(await loadRequestAuthorization(), data));
export const resumeAgentRecoveryFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOperationInput(AgentBulkOperationSchema, data))
  .handler(async ({ data }) => resumeAgentRecovery(await loadRequestAuthorization(), data));
export type { AgentRecoveryReceipt } from "@/server/commands/agent-bulk-recovery.server";
