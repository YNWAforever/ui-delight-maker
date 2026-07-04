import { query, transaction } from "@/server/db/neon.server";
import { touchAllActiveEngagementsForClient, touchEngagement } from "@/server/repositories/engagements";
import type { TouchpointNewSentiment, TouchpointNewType, TouchpointRecord } from "@/lib/types";

type CreateTouchpointInput = {
  client_id: string;
  engagement_id?: string | null;
  contact_id?: string | null;
  type: TouchpointNewType;
  sentiment?: TouchpointNewSentiment;
  notes?: string | null;
  occurred_at?: string;
  logged_by: string;
};

export async function listTouchpointsByClient(clientId: string, limit = 30) {
  return query<TouchpointRecord>(
    "select * from touchpoints where client_id = $1 order by occurred_at desc limit $2",
    [clientId, limit],
  );
}

export async function createTouchpoint(input: CreateTouchpointInput) {
  return transaction(async (client) => {
    const occurredAt = input.occurred_at ?? new Date().toISOString();

    const touchpointResult = await client.query<TouchpointRecord>(
      `
        insert into touchpoints
          (client_id, engagement_id, contact_id, type, sentiment, notes, occurred_at, logged_by)
        values ($1, $2, $3, $4, coalesce($5, 'neutral'), $6, $7, $8)
        returning *
      `,
      [
        input.client_id,
        input.engagement_id ?? null,
        input.contact_id ?? null,
        input.type,
        input.sentiment ?? null,
        input.notes ?? null,
        occurredAt,
        input.logged_by,
      ],
    );
    const touchpoint = touchpointResult.rows[0];
    if (!touchpoint) throw new Error("Failed to create touchpoint");

    if (input.engagement_id) {
      await touchEngagement(input.engagement_id, occurredAt, client);
    } else {
      await touchAllActiveEngagementsForClient(input.client_id, occurredAt, client);
    }

    await client.query(
      `
        insert into activity_logs
          (actor_type, actor_id, action, object_type, object_id, diff_data)
        values ('user', $1, $2, $3, $4, $5::jsonb)
      `,
      [
        input.logged_by,
        `logged touchpoint (${input.type})`,
        input.engagement_id ? "engagement" : "client",
        input.engagement_id ?? input.client_id,
        JSON.stringify({ sentiment: input.sentiment ?? "neutral", touchpoint_id: touchpoint.id }),
      ],
    );

    return touchpoint;
  });
}
