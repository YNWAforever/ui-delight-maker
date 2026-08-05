import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertWorkflowToken } from "@/server/workflows/assert-workflow-token.server";

const originalToken = process.env.N8N_WORKFLOW_TOKEN;

function requestWithToken(token?: string) {
  return new Request("https://clientops.example.com/api/workflows/qualify-lead", {
    method: "POST",
    headers: token ? { "x-workflow-token": token } : {},
    body: "{}",
  });
}

describe("assertWorkflowToken", () => {
  beforeEach(() => {
    process.env.N8N_WORKFLOW_TOKEN = "expected-token";
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env.N8N_WORKFLOW_TOKEN;
    else process.env.N8N_WORKFLOW_TOKEN = originalToken;
  });

  it("accepts the configured token", () => {
    expect(() => assertWorkflowToken(requestWithToken("expected-token"))).not.toThrow();
  });

  it("rejects a wrong token with 401", () => {
    try {
      assertWorkflowToken(requestWithToken("wrong-token"));
      throw new Error("expected assertWorkflowToken to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      expect((error as Response).status).toBe(401);
    }
  });

  it("rejects a missing token with 401", () => {
    try {
      assertWorkflowToken(requestWithToken());
      throw new Error("expected assertWorkflowToken to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      expect((error as Response).status).toBe(401);
    }
  });

  /**
   * Fails closed, not open. An unset token must never mean "no check required" — these
   * endpoints are publicly routable and this header is the only thing in front of them.
   */
  it("refuses to serve at all when no token is configured", () => {
    delete process.env.N8N_WORKFLOW_TOKEN;

    try {
      assertWorkflowToken(requestWithToken("anything"));
      throw new Error("expected assertWorkflowToken to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      expect((error as Response).status).toBe(500);
    }
  });

  it("stays closed when the configured token is the empty string", () => {
    process.env.N8N_WORKFLOW_TOKEN = "";

    try {
      assertWorkflowToken(requestWithToken(""));
      throw new Error("expected assertWorkflowToken to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      expect((error as Response).status).toBe(500);
    }
  });
});
