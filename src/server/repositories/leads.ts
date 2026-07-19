import { buildFilters, buildUpdate } from "@/server/db/query-builders";
import { query, queryOne, transaction, type Queryable } from "@/server/db/neon.server";
import { createClient } from "@/server/repositories/clients";
import { createClientContact } from "@/server/repositories/client-contacts";
import { createEngagement } from "@/server/repositories/engagements";
import type { ActivityLog, Engagement, Lead, LeadStatus } from "@/lib/types";
import {
  normalizePagination,
  parseCount,
  type PaginatedResult,
  type PaginationInput,
} from "@/server/repositories/pagination";

export type LeadFilters = {
  status?: string;
  source?: string;
  assigned_to?: string;
  contact_id?: string;
  account_id?: string;
  source_campaign_id?: string;
};

export type LeadPageFilters = LeadFilters & PaginationInput;

type CreateLeadInput = Pick<Lead, "company_name" | "source"> &
  Partial<
    Pick<
      Lead,
      | "contact_name"
      | "contact_email"
      | "contact_phone"
      | "assigned_to"
      | "contact_id"
      | "account_id"
      | "source_campaign_id"
      | "campaign_member_id"
      | "enquiry_text"
    >
  >;

type UpdateLeadInput = Partial<
  Pick<
    Lead,
    | "status"
    | "assigned_to"
    | "lead_score"
    | "qualification_data"
    | "contact_id"
    | "account_id"
    | "source_campaign_id"
    | "campaign_member_id"
  >
>;

const leadUpdateColumns: Array<keyof UpdateLeadInput & string> = [
  "status",
  "assigned_to",
  "lead_score",
  "qualification_data",
  "contact_id",
  "account_id",
  "source_campaign_id",
  "campaign_member_id",
];

export async function listLeads(filters: LeadFilters = {}) {
  const where = buildFilters([
    ["status", filters.status],
    ["source", filters.source],
    ["assigned_to", filters.assigned_to],
    ["contact_id", filters.contact_id],
    ["account_id", filters.account_id],
    ["source_campaign_id", filters.source_campaign_id],
  ]);

  return query<Lead>(
    `
      select *
      from leads
      ${where.sql}
      order by created_at desc
    `,
    where.values,
  );
}

export async function listLeadsPage(
  filters: LeadPageFilters = {},
): Promise<PaginatedResult<Lead>> {
  const where = buildFilters([
    ["status", filters.status],
    ["source", filters.source],
    ["assigned_to", filters.assigned_to],
    ["contact_id", filters.contact_id],
    ["account_id", filters.account_id],
    ["source_campaign_id", filters.source_campaign_id],
  ]);
  const { page, limit, offset } = normalizePagination(filters);

  const [items, count] = await Promise.all([
    query<Lead>(
      `
        select *
        from leads
        ${where.sql}
        order by created_at desc, id desc
        limit $${where.values.length + 1} offset $${where.values.length + 2}
      `,
      [...where.values, limit, offset],
    ),
    queryOne<{ total: number | string }>(
      `
        select count(*) as total
        from leads
        ${where.sql}
      `,
      where.values,
    ),
  ]);

  return { items, total: parseCount(count), page, limit };
}

export async function getLeadWithActivity(id: string) {
  const [lead, activityLogs] = await Promise.all([
    queryOne<Lead>("select * from leads where id = $1", [id]),
    query<ActivityLog>(
      `
        select *
        from activity_logs
        where object_type = 'lead'
          and object_id = $1
        order by created_at desc
        limit 20
      `,
      [id],
    ),
  ]);

  if (!lead) throw new Error("Lead not found");
  return { lead, activityLogs };
}

export async function assertLeadExists(id: string, db?: Queryable) {
  const lead = await queryOne<Pick<Lead, "id">>("select id from leads where id = $1", [id], db);

  if (!lead) throw new Error("Lead not found");
}

export async function createLead(input: CreateLeadInput) {
  const lead = await queryOne<Lead>(
    `
      insert into leads
        (company_name, source, enquiry_text, contact_name, contact_email, contact_phone, assigned_to, contact_id, account_id, source_campaign_id, campaign_member_id)
      values
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      returning *
    `,
    [
      input.company_name,
      input.source,
      input.enquiry_text ?? null,
      input.contact_name ?? null,
      input.contact_email ?? null,
      input.contact_phone ?? null,
      input.assigned_to ?? null,
      input.contact_id ?? null,
      input.account_id ?? null,
      input.source_campaign_id ?? null,
      input.campaign_member_id ?? null,
    ],
  );

  if (!lead) throw new Error("Failed to create lead");
  return lead;
}

export async function updateLead(id: string, updates: UpdateLeadInput, db?: Queryable) {
  const normalizedUpdates = {
    ...updates,
    qualification_data:
      updates.qualification_data === undefined
        ? undefined
        : JSON.stringify(updates.qualification_data),
  };
  const update = buildUpdate(normalizedUpdates, leadUpdateColumns, 1);

  const lead = await queryOne<Lead>(
    `
      update leads
      set ${update.sql}
      where id = $${update.nextIndex}
      returning *
    `,
    [...update.values, id],
    db,
  );

  if (!lead) throw new Error("Lead not found");
  return lead;
}

export async function moveLeadStage(input: {
  id: string;
  status: LeadStatus;
  actorId: string;
  reason?: string;
}) {
  return transaction(async (client) => {
    const leadResult = await client.query<Lead>(
      "update leads set status = $1 where id = $2 returning *",
      [input.status, input.id],
    );
    const lead = leadResult.rows[0];
    if (!lead) throw new Error("Lead not found");

    await client.query(
      `
        insert into activity_logs
          (actor_type, actor_id, action, object_type, object_id, diff_data)
        values
          ('user', $1, $2, 'lead', $3, $4::jsonb)
      `,
      [
        input.actorId,
        `moved lead to ${input.status.replace(/_/g, " ")}`,
        input.id,
        JSON.stringify({ status: input.status, reason: input.reason ?? null }),
      ],
    );

    return lead;
  });
}

export async function convertWonLeadToEngagement(input: {
  leadId: string;
  actorId: string;
  productId: string;
  value?: number;
  billingPeriod: Engagement["billing_period"];
  startDate?: string;
  renewalDate?: string;
  quoteId?: string;
}) {
  return transaction(async (client) => {
    const leadResult = await client.query<Lead>("select * from leads where id = $1", [
      input.leadId,
    ]);
    const lead = leadResult.rows[0];
    if (!lead) throw new Error("Lead not found");

    const normalizedCompanyName = lead.company_name.trim();

    const existingClientResult = await client.query<{ id: string }>(
      "select id from clients where lower(trim(company_name)) = lower(trim($1)) limit 1",
      [normalizedCompanyName],
    );
    let clientId = existingClientResult.rows[0]?.id ?? null;

    if (!clientId) {
      const newClient = await createClient({ company_name: normalizedCompanyName }, client);
      clientId = newClient.id;
    }

    if (lead.contact_name || lead.contact_email) {
      const existingContact = await client.query<{ id: string }>(
        "select id from client_contacts where client_id = $1 and email = $2",
        [clientId, lead.contact_email ?? ""],
      );
      if (existingContact.rows.length === 0) {
        await createClientContact(
          {
            client_id: clientId,
            name: lead.contact_name ?? "Unnamed",
            email: lead.contact_email ?? undefined,
          },
          client,
        );
      }
    }

    const engagement = await createEngagement(
      {
        client_id: clientId,
        product_id: input.productId,
        value: input.value,
        billing_period: input.billingPeriod,
        start_date: input.startDate,
        renewal_date: input.renewalDate,
        lead_id: input.leadId,
        quote_id: input.quoteId,
      },
      client,
    );

    await client.query(
      `
        insert into activity_logs
          (actor_type, actor_id, action, object_type, object_id, diff_data)
        values ('user', $1, 'converted won lead to engagement', 'engagement', $2, $3::jsonb)
      `,
      [
        input.actorId,
        engagement.id,
        JSON.stringify({ lead_id: input.leadId, client_id: clientId }),
      ],
    );

    return { clientId, engagementId: engagement.id };
  });
}
