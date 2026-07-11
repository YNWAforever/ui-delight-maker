import { describe, expect, it } from "vitest";
import type { Account } from "@/lib/types";
import { toCompanyWorkspaceSummary } from "../company-workspace";

describe("toCompanyWorkspaceSummary", () => {
  it("maps an Account into a Company workspace summary", () => {
    expect(
      toCompanyWorkspaceSummary({
        account: {
          id: "a1",
          name: "Acme",
          lifecycle_stage: "active_client",
          relationship_health: 72,
          last_activity_at: "2026-07-10T09:00:00Z",
          next_action: "Renewal review",
        } as Account,
        contacts: [{ id: "c1", is_primary: true }],
        clients: [{ id: "client-1" }],
        leads: [{ id: "lead-1" }],
        quotes: [
          { id: "quote-1", status: "sent" },
          { id: "quote-2", status: "accepted" },
        ],
        tasks: [
          { id: "task-1", status: "open" },
          { id: "task-2", status: "done" },
        ],
      }),
    ).toMatchObject({
      id: "a1",
      displayName: "Acme",
      lifecycleLabel: "Client",
      relationshipHealth: 72,
      primaryContactId: "c1",
      counts: {
        contacts: 1,
        clients: 1,
        leads: 1,
        openQuotes: 1,
        openTasks: 1,
      },
    });
  });

  it("uses safe defaults when relationship data is sparse", () => {
    expect(
      toCompanyWorkspaceSummary({
        account: { id: "a2", name: "New Co", lifecycle_stage: "prospect" } as Account,
        contacts: [],
        clients: [],
        leads: [],
        quotes: [],
        tasks: [],
      }),
    ).toMatchObject({
      lifecycleLabel: "Lead",
      relationshipHealth: 0,
      lastActivityAt: null,
      nextAction: null,
      primaryContactId: null,
    });
  });
});
