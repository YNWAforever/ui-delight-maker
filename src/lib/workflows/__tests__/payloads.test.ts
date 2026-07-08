import { describe, expect, it } from "vitest";
import {
  buildQualificationPayload,
  buildRelationshipIntelligencePayload,
  buildQuoteDraftPayload,
  buildReplyDraftPayload,
} from "../payloads";

describe("workflow payload builders", () => {
  it("builds a qualification payload without embedding the workflow token", () => {
    expect(buildQualificationPayload({ leadId: "lead-1", agentRunId: "run-1" })).toEqual({
      trigger: "lead.qualify_requested",
      lead_id: "lead-1",
      agent_run_id: "run-1",
    });
  });

  it("builds a draft reply payload", () => {
    expect(buildReplyDraftPayload({ leadId: "lead-2", agentRunId: "run-2" })).toMatchObject({
      trigger: "lead.reply_draft_requested",
      lead_id: "lead-2",
      agent_run_id: "run-2",
    });
  });

  it("builds a quote draft payload", () => {
    expect(buildQuoteDraftPayload({ leadId: "lead-3", agentRunId: "run-3" })).toEqual({
      trigger: "quote.draft_requested",
      lead_id: "lead-3",
      agent_run_id: "run-3",
    });
  });

  it("builds a relationship intelligence payload", () => {
    expect(
      buildRelationshipIntelligencePayload({ accountId: "account-1", agentRunId: "run-1" }),
    ).toEqual({
      trigger: "account.relationship_intelligence_requested",
      account_id: "account-1",
      agent_run_id: "run-1",
    });
  });
});
