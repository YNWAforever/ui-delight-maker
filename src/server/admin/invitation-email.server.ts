import { getN8nDispatchConfig, triggerN8n } from "@/lib/n8n";

export type InvitationEmailPayload = {
  type: "clientops_user_invitation";
  email: string;
  invite_url: string;
  expires_at: string;
  inviter_name: string;
};

export type InvitationEmailInput = {
  email: string;
  inviteUrl: string;
  expiresAt: Date | string;
  inviterName: string;
};

export type InvitationEmailResult =
  | { delivered: true }
  | { delivered: false; reason: "missing_webhook" };

export async function dispatchInvitationEmail(
  input: InvitationEmailInput,
): Promise<InvitationEmailResult> {
  const config = getN8nDispatchConfig(process.env.N8N_USER_INVITATION_WEBHOOK_URL);

  if (!config) {
    return { delivered: false, reason: "missing_webhook" };
  }

  const payload: InvitationEmailPayload = {
    type: "clientops_user_invitation",
    email: input.email,
    invite_url: input.inviteUrl,
    expires_at: input.expiresAt instanceof Date ? input.expiresAt.toISOString() : input.expiresAt,
    inviter_name: input.inviterName,
  };

  await triggerN8n(config, payload);
  return { delivered: true };
}
