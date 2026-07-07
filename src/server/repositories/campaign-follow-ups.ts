import { query, transaction } from "@/server/db/neon.server";
import { createTask } from "@/server/repositories/tasks";
import type { CampaignMember } from "@/lib/types";

type CampaignFollowUpMember = Pick<
  CampaignMember,
  | "id"
  | "campaign_id"
  | "account_id"
  | "contact_id"
  | "raw_company_name"
  | "raw_contact_name"
  | "raw_email"
  | "interests"
  | "notes"
  | "follow_up_owner"
>;

export type CreateCampaignFollowUpTasksInput = {
  campaignId: string;
  actorId: string;
};

export type CreateCampaignFollowUpTasksResult = {
  createdTasks: number;
  skippedMembers: number;
};

function attendeeLabel(member: CampaignFollowUpMember) {
  return (
    member.raw_contact_name?.trim() ||
    member.raw_email?.trim() ||
    member.raw_company_name?.trim() ||
    "event attendee"
  );
}

function buildTaskDescription(member: CampaignFollowUpMember) {
  const parts = [
    member.raw_company_name?.trim() ? `Company: ${member.raw_company_name.trim()}` : null,
    member.raw_email?.trim() ? `Email: ${member.raw_email.trim()}` : null,
    member.interests && member.interests.length > 0
      ? `Interests: ${member.interests.join(", ")}`
      : null,
    member.notes?.trim() ? `Notes: ${member.notes.trim()}` : null,
    `Campaign member: ${member.id}`,
  ].filter(Boolean);

  return parts.join("\n");
}

export async function createCampaignFollowUpTasks(
  input: CreateCampaignFollowUpTasksInput,
): Promise<CreateCampaignFollowUpTasksResult> {
  return transaction(async (db) => {
    const members = await query<CampaignFollowUpMember>(
      `
        select id, campaign_id, account_id, contact_id, raw_company_name, raw_contact_name,
               raw_email, interests, notes, follow_up_owner
        from campaign_members
        where campaign_id = $1
          and follow_up_status = 'not_started'
        order by created_at asc
        for update
      `,
      [input.campaignId],
      db,
    );

    let createdTasks = 0;
    let skippedMembers = 0;

    for (const member of members) {
      const owner = member.follow_up_owner ?? input.actorId;
      const task = await createTask(
        {
          title: `Follow up event attendee: ${attendeeLabel(member)}`,
          description: buildTaskDescription(member),
          assigned_to: owner,
          contact_id: member.contact_id,
          account_id: member.account_id,
          priority: "medium",
        },
        db,
      );

      if (!task) {
        skippedMembers += 1;
        continue;
      }

      await query(
        `
          update campaign_members
          set follow_up_status = 'task_created',
              follow_up_owner = coalesce(follow_up_owner, $2)
          where id = $1
            and follow_up_status = 'not_started'
        `,
        [member.id, owner],
        db,
      );
      createdTasks += 1;
    }

    return { createdTasks, skippedMembers };
  });
}
