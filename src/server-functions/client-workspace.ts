import { createServerFn } from "@tanstack/react-start";
import { requireCapability } from "@/server/auth/authorization.server";
import {
  clientWorkspaceSections,
  loadClientWorkspaceRead,
  loadClientWorkspaceSection,
  type ClientWorkspaceSection,
} from "@/server/read-models/client-workspace";

type ClientWorkspaceInput = { clientId: string };
type ClientWorkspaceSectionInput = ClientWorkspaceInput & { section: ClientWorkspaceSection };

function validateClientWorkspaceInput(data: unknown): ClientWorkspaceInput {
  const clientId =
    data && typeof data === "object" ? (data as { clientId?: unknown }).clientId : undefined;
  if (typeof clientId !== "string" || !clientId.trim()) {
    throw new Error("Client Workspace client ID is required");
  }
  return { clientId: clientId.trim() };
}

function validateClientWorkspaceSectionInput(data: unknown): ClientWorkspaceSectionInput {
  const input = validateClientWorkspaceInput(data);
  const section = (data as { section?: unknown }).section;
  if (!clientWorkspaceSections.includes(section as ClientWorkspaceSection)) {
    throw new Error("Invalid Client Workspace section");
  }
  return { ...input, section: section as ClientWorkspaceSection };
}

async function authorizeClientRead(clientId: string) {
  await requireCapability("accounts.view", { resourceType: "client", resourceId: clientId });
}

export const getClientWorkspaceRead = createServerFn({ method: "GET" })
  .validator(validateClientWorkspaceInput)
  .handler(async ({ data }) => {
    await authorizeClientRead(data.clientId);
    return loadClientWorkspaceRead(data.clientId);
  });

export const getClientWorkspaceSection = createServerFn({ method: "GET" })
  .validator(validateClientWorkspaceSectionInput)
  .handler(async ({ data }) => {
    await authorizeClientRead(data.clientId);
    return loadClientWorkspaceSection(data.clientId, data.section);
  });
