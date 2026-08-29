import { createServerFn } from "@tanstack/react-start";
import { requireCapability } from "@/server/auth/authorization.server";
import { loadEffectiveAgentCatalogue } from "@/server/read-models/agent-catalogue";

/**
 * The catalogue as it governs, for any surface that displays an agent's status.
 *
 * Gated on `agents.view` rather than `agents.configure`: this is the read every page showing an
 * agent needs, and a paused agent is something anyone who can see the agent should see.
 */
export const getEffectiveAgentCatalogue = createServerFn({ method: "GET" }).handler(async () => {
  await requireCapability("agents.view");
  return loadEffectiveAgentCatalogue();
});
