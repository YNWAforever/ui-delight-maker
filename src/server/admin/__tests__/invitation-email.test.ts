import { beforeEach, describe, expect, it, vi } from "vitest";

const { getN8nDispatchConfigMock, triggerN8nMock } = vi.hoisted(() => ({
  getN8nDispatchConfigMock: vi.fn(),
  triggerN8nMock: vi.fn(),
}));

vi.mock("@/lib/n8n", () => ({
  getN8nDispatchConfig: getN8nDispatchConfigMock,
  triggerN8n: triggerN8nMock,
}));

describe("dispatchInvitationEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.N8N_USER_INVITATION_WEBHOOK_URL = "https://n8n.example/invitation";
    getN8nDispatchConfigMock.mockReturnValue({
      webhookUrl: "https://n8n.example/invitation",
      workflowToken: "token",
    });
    triggerN8nMock.mockResolvedValue(undefined);
  });

  it("dispatches the invitation email payload through n8n", async () => {
    const { dispatchInvitationEmail } = await import("../invitation-email.server");
    const expiresAt = new Date("2026-07-23T12:00:00.000Z");

    await expect(
      dispatchInvitationEmail({
        email: "new.user@example.com",
        inviteUrl: "https://app.example.com/invite/raw-token",
        expiresAt,
        inviterName: "Ada Lovelace",
      }),
    ).resolves.toEqual({ delivered: true });

    expect(getN8nDispatchConfigMock).toHaveBeenCalledWith("https://n8n.example/invitation");
    expect(triggerN8nMock).toHaveBeenCalledWith(
      {
        webhookUrl: "https://n8n.example/invitation",
        workflowToken: "token",
      },
      {
        type: "clientops_user_invitation",
        email: "new.user@example.com",
        invite_url: "https://app.example.com/invite/raw-token",
        expires_at: "2026-07-23T12:00:00.000Z",
        inviter_name: "Ada Lovelace",
      },
    );
  });

  it("reports a missing webhook without dispatching", async () => {
    delete process.env.N8N_USER_INVITATION_WEBHOOK_URL;
    getN8nDispatchConfigMock.mockReturnValue(null);
    const { dispatchInvitationEmail } = await import("../invitation-email.server");

    await expect(
      dispatchInvitationEmail({
        email: "new.user@example.com",
        inviteUrl: "https://app.example.com/invite/raw-token",
        expiresAt: "2026-07-23T12:00:00.000Z",
        inviterName: "Ada Lovelace",
      }),
    ).resolves.toEqual({ delivered: false, reason: "missing_webhook" });

    expect(triggerN8nMock).not.toHaveBeenCalled();
  });
});
