import { describe, expect, it } from "vitest";
import type { AutomationPlaybook, AutomationRun } from "@/lib/types";
import { serializeAutomationPlaybook, serializeAutomationRun } from "../serializers";

describe("server function serializers", () => {
  it("serializes automation playbook and run JSON columns", () => {
    const playbook: AutomationPlaybook = {
      id: "playbook-1",
      name: "Renewal save motion",
      description: "Escalate renewal risk",
      trigger_type: "renewal_risk",
      status: "active",
      steps: [
        {
          type: "create_task",
          assignee: "cs",
          message: undefined,
        },
      ],
      created_by: "user-1",
      created_at: "2026-07-09T00:00:00.000Z",
      updated_at: "2026-07-09T00:00:00.000Z",
    };
    const run: AutomationRun = {
      id: "run-1",
      playbook_id: "playbook-1",
      contact_id: "contact-1",
      account_id: "account-1",
      deal_id: null,
      project_id: null,
      trigger_event_id: "event-1",
      status: "completed",
      context_data: {
        risk: "high",
        nextAction: undefined,
      },
      output_data: {
        taskCreated: true,
      },
      error_message: null,
      started_at: "2026-07-09T00:00:00.000Z",
      finished_at: "2026-07-09T00:01:00.000Z",
      created_at: "2026-07-09T00:00:00.000Z",
    };

    expect(serializeAutomationPlaybook(playbook)).toMatchObject({
      id: "playbook-1",
      steps: [{ type: "create_task", assignee: "cs" }],
    });
    expect(serializeAutomationRun(run)).toMatchObject({
      id: "run-1",
      context_data: { risk: "high" },
      output_data: { taskCreated: true },
    });
  });
});
