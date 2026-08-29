import { createServerFn } from "@tanstack/react-start";
import { requireCapability } from "@/server/auth/authorization.server";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import { setAgentPolicy } from "@/server/repositories/agent-policy";
import type { AgentWorkflowType } from "@/lib/agents";

export const setAgentPolicyFn = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        workflowType: AgentWorkflowType;
        status: "active" | "inactive";
        humanApproval: boolean;
        reason?: string;
      },
  )
  .handler(async ({ data }) => {
    // `agents.configure`, not `agents.run`. Pausing an agent stops it for every user, so
    // this is a governance action while three roles hold the operational one.
    await requireCapability("agents.configure");
    const session = await requireNeonAuthSession();
    return setAgentPolicy({ ...data, changedBy: session.profile.id });
  });
