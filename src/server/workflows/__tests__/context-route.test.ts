import { describe, expect, it } from "vitest";

import {
  getAccountWorkflowContextErrorResponse,
  readAccountWorkflowContextRequestPayload,
  getEngagementWorkflowContextErrorResponse,
  readEngagementWorkflowContextRequestPayload,
  getWorkflowContextErrorResponse,
  readWorkflowContextRequestPayload,
} from "@/server/workflows/context-route.server";

describe("workflow context route helpers", () => {
  it("returns a 400 response for malformed JSON", async () => {
    const request = new Request("https://example.com/api/workflows/context/lead", {
      method: "POST",
      body: "{",
    });

    const result = await readWorkflowContextRequestPayload(request);

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(400);
    await expect((result as Response).text()).resolves.toBe("Missing lead_id or agent_run_id");
  });

  it("returns a 400 response for non-object payloads", async () => {
    const payloads = [null, [], "lead-1"];

    for (const payload of payloads) {
      const request = new Request("https://example.com/api/workflows/context/lead", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const result = await readWorkflowContextRequestPayload(request);

      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(400);
    }
  });

  it("returns a 400 response for missing or non-string ids", async () => {
    const payloads = [
      {},
      { lead_id: "lead-1" },
      { agent_run_id: "run-1" },
      { lead_id: 123, agent_run_id: "run-1" },
      { lead_id: "lead-1", agent_run_id: null },
      { lead_id: "", agent_run_id: "run-1" },
    ];

    for (const payload of payloads) {
      const request = new Request("https://example.com/api/workflows/context/lead", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const result = await readWorkflowContextRequestPayload(request);

      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(400);
      await expect((result as Response).text()).resolves.toBe("Missing lead_id or agent_run_id");
    }
  });

  it("returns validated context ids", async () => {
    const request = new Request("https://example.com/api/workflows/context/lead", {
      method: "POST",
      body: JSON.stringify({ lead_id: "lead-1", agent_run_id: "run-1" }),
    });

    await expect(readWorkflowContextRequestPayload(request)).resolves.toEqual({
      lead_id: "lead-1",
      agent_run_id: "run-1",
    });
  });

  it("maps missing lead and agent run errors to 404 responses", async () => {
    for (const message of ["Lead not found", "Agent run not found"]) {
      const response = getWorkflowContextErrorResponse(new Error(message));

      expect(response).toBeInstanceOf(Response);
      expect(response?.status).toBe(404);
      await expect(response?.text()).resolves.toBe(message);
    }
  });

  it("maps mismatched lead ownership to a 400 response", async () => {
    const response = getWorkflowContextErrorResponse(
      new Error("Agent run does not belong to lead"),
    );

    expect(response).toBeInstanceOf(Response);
    expect(response?.status).toBe(400);
    await expect(response?.text()).resolves.toBe("Agent run does not belong to lead");
  });

  it("does not map unexpected errors", () => {
    expect(getWorkflowContextErrorResponse(new Error("Database unavailable"))).toBeNull();
    expect(getWorkflowContextErrorResponse("Lead not found")).toBeNull();
  });

  it("validates engagement context request payloads", async () => {
    const badRequest = new Request("https://example.com/api/workflows/context/engagement", {
      method: "POST",
      body: JSON.stringify({ engagement_id: "", agent_run_id: "run-1" }),
    });

    const badResult = await readEngagementWorkflowContextRequestPayload(badRequest);

    expect(badResult).toBeInstanceOf(Response);
    expect((badResult as Response).status).toBe(400);
    await expect((badResult as Response).text()).resolves.toBe(
      "Missing engagement_id or agent_run_id",
    );

    const goodRequest = new Request("https://example.com/api/workflows/context/engagement", {
      method: "POST",
      body: JSON.stringify({ engagement_id: "engagement-1", agent_run_id: "run-1" }),
    });

    await expect(readEngagementWorkflowContextRequestPayload(goodRequest)).resolves.toEqual({
      engagement_id: "engagement-1",
      agent_run_id: "run-1",
    });
  });

  it("maps engagement workflow context errors", async () => {
    for (const message of ["Engagement not found", "Agent run not found"]) {
      const response = getEngagementWorkflowContextErrorResponse(new Error(message));

      expect(response).toBeInstanceOf(Response);
      expect(response?.status).toBe(404);
      await expect(response?.text()).resolves.toBe(message);
    }

    const mismatch = getEngagementWorkflowContextErrorResponse(
      new Error("Agent run does not belong to this engagement"),
    );

    expect(mismatch).toBeInstanceOf(Response);
    expect(mismatch?.status).toBe(400);
    await expect(mismatch?.text()).resolves.toBe("Agent run does not belong to this engagement");
  });

  it("validates account context request payloads", async () => {
    const badRequest = new Request("https://example.com/api/workflows/context/account", {
      method: "POST",
      body: JSON.stringify({ account_id: "", agent_run_id: "run-1" }),
    });

    const badResult = await readAccountWorkflowContextRequestPayload(badRequest);

    expect(badResult).toBeInstanceOf(Response);
    expect((badResult as Response).status).toBe(400);
    await expect((badResult as Response).text()).resolves.toBe(
      "Missing account_id or agent_run_id",
    );

    const goodRequest = new Request("https://example.com/api/workflows/context/account", {
      method: "POST",
      body: JSON.stringify({ account_id: "account-1", agent_run_id: "run-1" }),
    });

    await expect(readAccountWorkflowContextRequestPayload(goodRequest)).resolves.toEqual({
      account_id: "account-1",
      agent_run_id: "run-1",
    });
  });

  it("maps account workflow context errors", async () => {
    for (const message of ["Account not found", "Agent run not found"]) {
      const response = getAccountWorkflowContextErrorResponse(new Error(message));

      expect(response).toBeInstanceOf(Response);
      expect(response?.status).toBe(404);
      await expect(response?.text()).resolves.toBe(message);
    }

    const mismatch = getAccountWorkflowContextErrorResponse(
      new Error("Agent run does not belong to this account"),
    );

    expect(mismatch).toBeInstanceOf(Response);
    expect(mismatch?.status).toBe(400);
    await expect(mismatch?.text()).resolves.toBe("Agent run does not belong to this account");
  });
});
