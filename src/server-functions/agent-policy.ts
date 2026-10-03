import { createServerFn } from "@tanstack/react-start";
import { requireCapability, requirePageAuthorization } from "@/server/auth/authorization.server";
import {
  readAgentPolicyHistory,
  setAgentPolicyStatus,
  rollbackAgentPolicyStatus,
} from "@/server/repositories/agent-policy";
import {
  agentPolicyChangeSchema,
  agentPolicyRollbackSchema,
  agentPolicyHistorySchema,
} from "@/lib/agent-policy-input";
import { parseOperationInput } from "@/lib/operations/errors";
import { AdminError } from "@/lib/admin/errors";

async function policyAuthorization<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required")
      throw new AdminError("UNAUTHENTICATED", "Sign in before accessing agent policy.");
    throw error;
  }
}

export const setAgentPolicyFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOperationInput(agentPolicyChangeSchema, data))
  .handler(async ({ data }) => {
    // `agents.configure`, not `agents.run`. Pausing an agent stops it for every user, so
    // this is a governance action while three roles hold the operational one.
    const session = await policyAuthorization(() => requireCapability("agents.configure"));
    // Revalidate direct handler calls too. Transport validators are not an authorization gate.
    const input = parseOperationInput(agentPolicyChangeSchema, data);
    return setAgentPolicyStatus({ ...input, changedBy: session.profile.id });
  });

export const rollbackAgentPolicyFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseOperationInput(agentPolicyRollbackSchema, data))
  .handler(async ({ data }) => {
    const session = await policyAuthorization(() => requireCapability("agents.configure"));
    return rollbackAgentPolicyStatus({
      ...parseOperationInput(agentPolicyRollbackSchema, data),
      changedBy: session.profile.id,
    });
  });

export const getAgentPolicyHistory = createServerFn({ method: "GET" })
  .validator((data: unknown) => parseOperationInput(agentPolicyHistorySchema, data))
  .handler(async ({ data }) => {
    const { access } = await policyAuthorization(() =>
      requirePageAuthorization(["agents.view"], { optional: ["agents.configure"] }),
    );
    const history = await readAgentPolicyHistory(
      parseOperationInput(agentPolicyHistorySchema, data),
    );
    return { ...history, canConfigure: access["agents.configure"] === true };
  });
