import type { Account, AccountContact, Client, Lead, Quote, Task } from "@/lib/types";

export type CompanyWorkspaceSummary = {
  id: string;
  displayName: string;
  lifecycleLabel: "Lead" | "Client" | "At risk" | "Former client" | "Partner" | "Vendor";
  relationshipHealth: number;
  lastActivityAt: string | null;
  nextAction: string | null;
  primaryContactId: string | null;
  counts: {
    contacts: number;
    clients: number;
    leads: number;
    openQuotes: number;
    openTasks: number;
  };
};

export type CompanyWorkspaceSummaryInput = {
  account: Account;
  contacts: Array<Pick<AccountContact, "id" | "is_primary">>;
  clients: Array<Pick<Client, "id">>;
  leads: Array<Pick<Lead, "id">>;
  quotes: Array<Pick<Quote, "id" | "status">>;
  tasks: Array<Pick<Task, "id" | "status">>;
};

const lifecycleLabels: Record<Account["lifecycle_stage"], CompanyWorkspaceSummary["lifecycleLabel"]> = {
  prospect: "Lead",
  active_client: "Client",
  at_risk: "At risk",
  churned: "Former client",
  partner: "Partner",
  vendor: "Vendor",
};

const closedQuoteStatuses = new Set<Quote["status"]>(["accepted", "rejected", "expired"]);

export function toCompanyWorkspaceSummary(
  input: CompanyWorkspaceSummaryInput,
): CompanyWorkspaceSummary {
  return {
    id: input.account.id,
    displayName: input.account.name,
    lifecycleLabel: lifecycleLabels[input.account.lifecycle_stage],
    relationshipHealth: input.account.relationship_health ?? input.account.health_score ?? 0,
    lastActivityAt: input.account.last_activity_at ?? null,
    nextAction: input.account.next_action ?? null,
    primaryContactId: input.contacts.find((contact) => contact.is_primary)?.id ?? null,
    counts: {
      contacts: input.contacts.length,
      clients: input.clients.length,
      leads: input.leads.length,
      openQuotes: input.quotes.filter((quote) => !closedQuoteStatuses.has(quote.status)).length,
      openTasks: input.tasks.filter((task) => task.status !== "done").length,
    },
  };
}
