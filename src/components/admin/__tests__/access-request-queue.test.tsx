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

    expect(screen.getByRole("button", { name: "Capability approval unavailable" })).toHaveProperty(
      "disabled",
      true,
    );
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

  it("requires a decision reason before rejection", async () => {
    const onDecide = vi.fn();
    const actor = userEvent.setup();

    render(<AccessRequestQueue requests={[teamRequest]} actorRole="admin" onDecide={onDecide} />);

    await actor.click(screen.getByRole("button", { name: "Reject request-team" }));
    expect(screen.getByRole("alert").textContent).toContain("Decision reason is required");
    expect(onDecide).not.toHaveBeenCalled();
  });
});
