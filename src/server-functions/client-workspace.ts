import { createServerFn } from "@tanstack/react-start";
import { requireCapabilitySet } from "@/server/auth/authorization.server";
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

const sectionCapabilities = {
  contacts: ["accounts.view", "contacts.view"],
  activity: ["accounts.view", "engagements.view"],
  commercial: ["accounts.view", "quotes.view"],
  engagements: ["accounts.view", "engagements.view"],
  job_sheets: ["accounts.view", "job_sheets.view"],
} as const;

const optionalWorkspaceCapabilities = [
  "contacts.view",
  "engagements.view",
  "quotes.view",
  "job_sheets.view",
] as const;

const clientTarget = (clientId: string) => ({
  resourceType: "client",
  resourceId: clientId,
});

async function authorizeClientRead(clientId: string) {
  return requireCapabilitySet(["accounts.view"], {
    optional: optionalWorkspaceCapabilities,
    target: clientTarget(clientId),
  });
}

async function authorizeClientSection(clientId: string, section: ClientWorkspaceSection) {
  await requireCapabilitySet(sectionCapabilities[section], {
    target: clientTarget(clientId),
  });
}
export const getClientWorkspaceRead = createServerFn({ method: "GET" })
  .validator(validateClientWorkspaceInput)
  .handler(async ({ data }) => {
    const access = await authorizeClientRead(data.clientId);
    return loadClientWorkspaceRead(data.clientId, undefined, {
      contacts: access["contacts.view"] === true,
      engagements: access["engagements.view"] === true,
      quotes: access["quotes.view"] === true,
      jobSheets: access["job_sheets.view"] === true,
    });
  });

export const getClientWorkspaceSection = createServerFn({ method: "GET" })
  .validator(validateClientWorkspaceSectionInput)
  .handler(async ({ data }) => {
    await authorizeClientSection(data.clientId, data.section);
    return loadClientWorkspaceSection(data.clientId, data.section);
  });
