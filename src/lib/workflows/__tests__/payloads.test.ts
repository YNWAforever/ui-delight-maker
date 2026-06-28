import { describe, expect, it } from "vitest";
import {
  buildQualificationPayload,
  buildQuoteDraftPayload,
  buildReplyDraftPayload,
} from "../payloads";

describe("workflow payload builders", () => {
  it("builds a qualification payload with shared token omitted from code", () => {
    process.env.N8N_WORKFLOW_TOKEN = "test-token";
    expect(buildQualificationPayload({ leadId: "lead-1", agentRunId: "run-1" })).toEqual({
      trigger: "lead.qualify_requested",
      lead_id: "lead-1",
      agent_run_id: "run-1",
      workflow_token: "test-token",
    });
  });

  it("builds a draft reply payload", () => {
    process.env.N8N_WORKFLOW_TOKEN = "test-token";
    expect(buildReplyDraftPayload({ leadId: "lead-2", agentRunId: "run-2" })).toMatchObject({
      trigger: "lead.reply_draft_requested",
      lead_id: "lead-2",
      agent_run_id: "run-2",
      workflow_token: "test-token",
    });
  });

  it("throws when workflow token is missing", () => {
    delete process.env.N8N_WORKFLOW_TOKEN;
    expect(() => buildQuoteDraftPayload({ leadId: "lead-3", agentRunId: "run-3" })).toThrow(
      "Missing required env var: N8N_WORKFLOW_TOKEN",
    );
  });
});
