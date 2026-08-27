// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AccessRequest } from "@/server/repositories/admin-access";
import { AccessRequestQueue } from "../access-request-queue";

const teamRequest: AccessRequest = {
  id: "request-team",
  requesterProfileId: "profile-1",
  requestType: "team",
  capability: null,
  teamId: "team-1",
  reason: "Need temporary account coverage",
  status: "pending",
  decidedBy: null,
  decisionReason: null,
  decidedAt: null,
  accessExpiresAt: null,
  createdAt: "2026-07-18T00:00:00.000Z",
  updatedAt: "2026-07-18T00:00:00.000Z",
};

const capabilityRequest: AccessRequest = {
  ...teamRequest,
  id: "request-capability",
  requestType: "capability",
  capability: "accounts.update",
  teamId: null,
};

describe("AccessRequestQueue", () => {
  afterEach(() => cleanup());

  it("lets a manager approve a team request but blocks capability approval", async () => {
    const onDecide = vi.fn().mockResolvedValue(undefined);
    const actor = userEvent.setup();

    render(
      <AccessRequestQueue
        requests={[teamRequest, capabilityRequest]}
        actorRole="manager"
        onDecide={onDecide}
      />,
    );

    // The server refuses a manager *any* decision on a capability request, approve or
    // reject, so neither control is offered and the rule is stated instead of the symptom.
    expect(screen.queryByRole("button", { name: "Approve capability access" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject request-capability" })).toBeNull();
    expect(screen.getByText(/Managers decide team access requests/)).toBeTruthy();
    await actor.click(screen.getByRole("button", { name: "Approve team access" }));
    await actor.type(
      screen.getByLabelText("Decision reason for request-team"),
      "Coverage approved",
    );
    await actor.click(screen.getByRole("button", { name: "Approve request-team" }));

    expect(onDecide).toHaveBeenCalledWith({
      id: "request-team",
      decision: "approved",
      reason: "Coverage approved",
      accessExpiresAt: null,
    });
  });

  it("renders each request's real state instead of a hardcoded Pending pill", () => {
    // Every row wore an amber "Pending" regardless of the record, which the state filter now
    // makes visible: an approved or cancelled request read as still waiting on a decision.
    render(
      <AccessRequestQueue
        requests={[
          {
            ...teamRequest,
            id: "request-approved",
            status: "approved",
            decidedAt: "2026-07-19T00:00:00.000Z",
          },
          { ...capabilityRequest, id: "request-cancelled", status: "cancelled" },
        ]}
        actorRole="admin"
        filtered
        onDecide={vi.fn()}
      />,
    );

    expect(screen.getByText("Approved")).toBeTruthy();
    expect(screen.getByText("Cancelled")).toBeTruthy();
    expect(screen.queryByText("Pending")).toBeNull();
  });

  it("offers no decision on a request that has already been decided", () => {
    render(
      <AccessRequestQueue
        requests={[{ ...teamRequest, status: "rejected" }]}
        actorRole="admin"
        onDecide={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull();
    expect(screen.getByText("This request has already been decided.")).toBeTruthy();
  });

  it("states the segregation-of-duties rule instead of letting the server refuse it", () => {
    // `decideAdminAccessRequestFn` refuses "You cannot decide your own access request". The
    // client knows who it is, so it says so before a reason is typed and a round trip spent.
    render(
      <AccessRequestQueue
        requests={[teamRequest]}
        actorRole="admin"
        actorProfileId="profile-1"
        onDecide={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull();
    expect(screen.getByText(/You raised this request/)).toBeTruthy();
  });

  it("requires a decision reason before rejection", async () => {
    const onDecide = vi.fn();
    const actor = userEvent.setup();

    render(<AccessRequestQueue requests={[teamRequest]} actorRole="admin" onDecide={onDecide} />);

    await actor.click(screen.getByRole("button", { name: "Reject request-team" }));
    expect(screen.getByRole("alert").textContent).toContain("Decision reason is required");
    expect(onDecide).not.toHaveBeenCalled();
  });
});
