import { Pool } from "@neondatabase/serverless";
import {
  addDaysToDateString,
  assertSeedAllowed,
  buildSeedDates,
  getSeedMode,
  isFullDemoSeedMode,
  type ClientOpsSeedMode,
} from "../../src/lib/clientops-seed";
import {
  DEMO_ACCOUNT_CONTACTS,
  DEMO_ACCOUNTS,
  DEMO_AGENT_RUNS,
  DEMO_APPROVALS,
  DEMO_CAMPAIGN_MEMBERS,
  DEMO_CAMPAIGNS,
  DEMO_CLIENTS,
  DEMO_CONTACTS,
  DEMO_ENGAGEMENTS,
  DEMO_JOB_SHEETS,
  DEMO_LEADS,
  DEMO_NOTIFICATIONS,
  DEMO_PRICING,
  DEMO_PRODUCTS,
  DEMO_PROFILES,
  DEMO_QUOTES,
  DEMO_TASKS,
  DEMO_TOUCHPOINTS,
} from "./seed-data";

type Queryable = {
  query<T = unknown>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
};

type ReleasableQueryable = Queryable & {
  release(): void;
};

type SeedContext = {
  mode: ClientOpsSeedMode;
  dates: ReturnType<typeof buildSeedDates>;
  profileIds: Map<string, string>;
  accountIds: Map<string, string>;
  accountContactIds: Map<string, string>;
  campaignIds: Map<string, string>;
  campaignMemberIds: Map<string, string>;
  productIds: Map<string, string>;
  pricingIds: Map<string, string>;
  leadIds: Map<string, string>;
  clientIds: Map<string, string>;
  contactIds: Map<string, string>;
  engagementIds: Map<string, string>;
  quoteIds: Map<string, string>;
  jobSheetIds: Map<string, string>;
  agentRunIds: Map<string, string>;
  approvalIds: Map<string, string>;
};

type RetentionCapabilities = {
  hasProducts: boolean;
  hasClientContacts: boolean;
  hasEngagements: boolean;
  hasTouchpoints: boolean;
  hasNotifications: boolean;
  pricingHasProductId: boolean;
};

const LOCAL_DEMO_RETENTION_REQUIREMENTS = [
  ["products", "hasProducts"],
  ["client_contacts", "hasClientContacts"],
  ["engagements", "hasEngagements"],
  ["touchpoints", "hasTouchpoints"],
  ["notifications", "hasNotifications"],
] as const satisfies readonly (readonly [string, keyof RetentionCapabilities])[];

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function makeSeedContext(mode: ClientOpsSeedMode): SeedContext {
  return {
    mode,
    dates: buildSeedDates(process.env.CLIENTOPS_SEED_TODAY),
    profileIds: new Map(),
    accountIds: new Map(),
    accountContactIds: new Map(),
    campaignIds: new Map(),
    campaignMemberIds: new Map(),
    productIds: new Map(),
    pricingIds: new Map(),
    leadIds: new Map(),
    clientIds: new Map(),
    contactIds: new Map(),
    engagementIds: new Map(),
    quoteIds: new Map(),
    jobSheetIds: new Map(),
    agentRunIds: new Map(),
    approvalIds: new Map(),
  };
}

async function tableExists(db: Queryable, tableName: string) {
  const result = await db.query<{ exists: boolean }>(
    `
      select exists (
        select 1
        from information_schema.tables
        where table_schema = 'public'
          and table_name = $1
      ) as exists
    `,
    [tableName],
  );
  return result.rows[0]?.exists ?? false;
}

async function columnExists(db: Queryable, tableName: string, columnName: string) {
  const result = await db.query<{ exists: boolean }>(
    `
      select exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = $1
          and column_name = $2
      ) as exists
    `,
    [tableName, columnName],
  );
  return result.rows[0]?.exists ?? false;
}

async function getRetentionCapabilities(db: Queryable): Promise<RetentionCapabilities> {
  return {
    hasProducts: await tableExists(db, "products"),
    hasClientContacts: await tableExists(db, "client_contacts"),
    hasEngagements: await tableExists(db, "engagements"),
    hasTouchpoints: await tableExists(db, "touchpoints"),
    hasNotifications: await tableExists(db, "notifications"),
    pricingHasProductId: await columnExists(db, "pricing_templates", "product_id"),
  };
}

function tableIdentifier(tableName: string) {
  if (!/^[a-z_][a-z0-9_]*$/.test(tableName)) {
    throw new Error(`Unsafe table name: ${tableName}`);
  }
  return `"${tableName}"`;
}

function jsonb(value: unknown) {
  return value == null ? null : JSON.stringify(value);
}

function assertLocalDemoRetentionSurface(capabilities: RetentionCapabilities) {
  const missingTables = LOCAL_DEMO_RETENTION_REQUIREMENTS.filter(
    ([, capability]) => !capabilities[capability],
  ).map(([tableName]) => tableName);

  if (missingTables.length === 0) return;

  throw new Error(
    `local-demo-reset requires retention tables before truncating data. Missing tables: ${missingTables.join(
      ", ",
    )}. Apply the retention migration before running the local demo seed.`,
  );
}

async function resetLocalDemoData(db: Queryable) {
  const tables = [
    "job_sheet_activity",
    "job_sheet_portions",
    "job_sheets",
    "quote_versions",
    "quote_line_items",
    "notifications",
    "touchpoints",
    "relationship_signals",
    "campaign_members",
    "campaigns",
    "account_contacts",
    "human_approvals",
    "agent_tool_calls",
    "agent_runs",
    "activity_logs",
    "tasks",
    "quotes",
    "engagements",
    "client_contacts",
    "leads",
    "clients",
    "accounts",
    "pricing_templates",
    "products",
    "profiles",
  ];
  const existingTables: string[] = [];

  for (const table of tables) {
    if (await tableExists(db, table)) {
      existingTables.push(table);
    }
  }

  if (existingTables.length === 0) return;

  await db.query(`
    truncate table ${existingTables.map(tableIdentifier).join(", ")}
    restart identity cascade
  `);
}

async function seedProfiles(db: Queryable, ctx: SeedContext) {
  const profiles =
    ctx.mode === "staging-smoke"
      ? [
          {
            key: "sales",
            id: requiredEnv("CLIENTOPS_SMOKE_PROFILE_ID"),
            email: requiredEnv("CLIENTOPS_SMOKE_PROFILE_EMAIL"),
            name: requiredEnv("CLIENTOPS_SMOKE_PROFILE_NAME"),
            role: "sales" as const,
          },
        ]
      : DEMO_PROFILES;
  const label = ctx.mode === "staging-smoke" ? "smoke" : "demo";

  for (const profile of profiles) {
    const result = await db.query<{ id: string }>(
      `
        insert into profiles (id, email, name, role, assignment_labels)
        values ($1, $2, $3, $4, array[$5])
        on conflict (id) do update set
          email = excluded.email,
          name = excluded.name,
          role = excluded.role,
          assignment_labels = (
            select array_agg(distinct label)
            from unnest(
              coalesce(profiles.assignment_labels, '{}'::text[]) || excluded.assignment_labels
            ) as labels(label)
          )
        returning id
      `,
      [profile.id, profile.email, profile.name, profile.role, label],
    );
    ctx.profileIds.set(profile.key, result.rows[0].id);
  }
}

async function seedAccounts(db: Queryable, ctx: SeedContext) {
  if (!isFullDemoSeedMode(ctx.mode)) return;

  for (const account of DEMO_ACCOUNTS) {
    const existing = await db.query<{ id: string }>(
      "select id from accounts where lower(name) = lower($1) limit 1",
      [account.name],
    );
    let id = existing.rows[0]?.id;
    const ownerId = ctx.profileIds.get(account.ownerKey) ?? null;
    const csOwnerId = account.csOwnerKey ? (ctx.profileIds.get(account.csOwnerKey) ?? null) : null;
    const lastActivityAt = account.lastActivityKey ? ctx.dates[account.lastActivityKey] : null;

    if (!id) {
      const inserted = await db.query<{ id: string }>(
        `
          insert into accounts
            (name, website, domain, industry, region, tier, lifecycle_stage, account_owner,
             cs_owner, source, tags, notes, relationship_health, last_activity_at, next_action)
          values
            ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::text[], $12, $13, $14, $15)
          returning id
        `,
        [
          account.name,
          account.website,
          account.domain,
          account.industry,
          account.region,
          account.tier,
          account.lifecycle_stage,
          ownerId,
          csOwnerId,
          account.source,
          account.tags,
          account.notes,
          account.relationship_health,
          lastActivityAt,
          account.next_action,
        ],
      );
      id = inserted.rows[0].id;
    }

    await db.query(
      `
        update accounts
        set name = $2,
            website = $3,
            domain = $4,
            industry = $5,
            region = $6,
            tier = $7,
            lifecycle_stage = $8,
            account_owner = $9,
            cs_owner = $10,
            source = $11,
            tags = $12::text[],
            notes = $13,
            relationship_health = $14,
            last_activity_at = $15,
            next_action = $16
        where id = $1
      `,
      [
        id,
        account.name,
        account.website,
        account.domain,
        account.industry,
        account.region,
        account.tier,
        account.lifecycle_stage,
        ownerId,
        csOwnerId,
        account.source,
        account.tags,
        account.notes,
        account.relationship_health,
        lastActivityAt,
        account.next_action,
      ],
    );

    ctx.accountIds.set(account.key, id);
  }
}

async function seedAccountContacts(db: Queryable, ctx: SeedContext) {
  if (!isFullDemoSeedMode(ctx.mode)) return;

  for (const contact of DEMO_ACCOUNT_CONTACTS) {
    const accountId = ctx.accountIds.get(contact.accountKey);
    if (!accountId) continue;

    const existing = await db.query<{ id: string }>(
      `
        select id
        from account_contacts
        where account_id = $1
          and lower(coalesce(email, '')) = lower($2)
        limit 1
      `,
      [accountId, contact.email],
    );
    let id = existing.rows[0]?.id;
    const lastContactedAt = contact.lastContactedKey ? ctx.dates[contact.lastContactedKey] : null;

    if (!id) {
      const inserted = await db.query<{ id: string }>(
        `
          insert into account_contacts
            (account_id, name, title, department, email, phone, preferred_channel,
             relationship_role, influence_level, sentiment, relationship_strength,
             is_primary, notes, last_contacted_at)
          values
            ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          returning id
        `,
        [
          accountId,
          contact.name,
          contact.title,
          contact.department,
          contact.email,
          contact.phone,
          contact.preferred_channel,
          contact.relationship_role,
          contact.influence_level,
          contact.sentiment,
          contact.relationship_strength,
          contact.is_primary,
          contact.notes,
          lastContactedAt,
        ],
      );
      id = inserted.rows[0].id;
    }

    await db.query(
      `
        update account_contacts
        set account_id = $2,
            name = $3,
            title = $4,
            department = $5,
            email = $6,
            phone = $7,
            preferred_channel = $8,
            relationship_role = $9,
            influence_level = $10,
            sentiment = $11,
            relationship_strength = $12,
            is_primary = $13,
            notes = $14,
            last_contacted_at = $15,
            active = true
        where id = $1
      `,
      [
        id,
        accountId,
        contact.name,
        contact.title,
        contact.department,
        contact.email,
        contact.phone,
        contact.preferred_channel,
        contact.relationship_role,
        contact.influence_level,
        contact.sentiment,
        contact.relationship_strength,
        contact.is_primary,
        contact.notes,
        lastContactedAt,
      ],
    );

    ctx.accountContactIds.set(contact.key, id);
  }
}

async function seedCampaigns(db: Queryable, ctx: SeedContext) {
  if (!isFullDemoSeedMode(ctx.mode)) return;

  for (const campaign of DEMO_CAMPAIGNS) {
    const existing = await db.query<{ id: string }>(
      "select id from campaigns where name = $1 limit 1",
      [campaign.name],
    );
    let id = existing.rows[0]?.id;
    const startsAt = `${addDaysToDateString(ctx.dates.today, campaign.startsAtOffsetDays)}T09:00:00.000Z`;
    const endsAt = `${addDaysToDateString(ctx.dates.today, campaign.endsAtOffsetDays)}T11:00:00.000Z`;
    const ownerId = ctx.profileIds.get(campaign.ownerKey) ?? null;

    if (!id) {
      const inserted = await db.query<{ id: string }>(
        `
          insert into campaigns (name, type, status, objective, owner, starts_at, ends_at, notes)
          values ($1, $2, $3, $4, $5, $6, $7, $8)
          returning id
        `,
        [
          campaign.name,
          campaign.type,
          campaign.status,
          campaign.objective,
          ownerId,
          startsAt,
          endsAt,
          campaign.notes,
        ],
      );
      id = inserted.rows[0].id;
    }

    await db.query(
      `
        update campaigns
        set name = $2,
            type = $3,
            status = $4,
            objective = $5,
            owner = $6,
            starts_at = $7,
            ends_at = $8,
            notes = $9
        where id = $1
      `,
      [
        id,
        campaign.name,
        campaign.type,
        campaign.status,
        campaign.objective,
        ownerId,
        startsAt,
        endsAt,
        campaign.notes,
      ],
    );

    ctx.campaignIds.set(campaign.key, id);
  }
}

async function seedCampaignMembers(db: Queryable, ctx: SeedContext) {
  if (!isFullDemoSeedMode(ctx.mode)) return;

  for (const member of DEMO_CAMPAIGN_MEMBERS) {
    const campaignId = ctx.campaignIds.get(member.campaignKey);
    if (!campaignId) continue;
    const accountId = member.accountKey ? (ctx.accountIds.get(member.accountKey) ?? null) : null;
    const contactId = member.accountContactKey
      ? (ctx.accountContactIds.get(member.accountContactKey) ?? null)
      : null;
    const followUpOwner = member.followUpOwnerKey
      ? (ctx.profileIds.get(member.followUpOwnerKey) ?? null)
      : null;
    const existing = await db.query<{ id: string }>(
      `
        select id
        from campaign_members
        where campaign_id = $1
          and lower(coalesce(raw_email, '')) = lower($2)
        limit 1
      `,
      [campaignId, member.raw_email],
    );
    let id = existing.rows[0]?.id;

    if (!id) {
      const inserted = await db.query<{ id: string }>(
        `
          insert into campaign_members
            (campaign_id, account_id, contact_id, raw_company_name, raw_contact_name,
             raw_email, raw_phone, attendee_status, interests, follow_up_owner,
             follow_up_status, conversion_outcome, notes)
          values
            ($1, $2, $3, $4, $5, $6, $7, $8, $9::text[], $10, $11, $12, $13)
          returning id
        `,
        [
          campaignId,
          accountId,
          contactId,
          member.raw_company_name,
          member.raw_contact_name,
          member.raw_email,
          member.raw_phone,
          member.attendee_status,
          member.interests,
          followUpOwner,
          member.follow_up_status,
          member.conversion_outcome,
          member.notes,
        ],
      );
      id = inserted.rows[0].id;
    }

    await db.query(
      `
        update campaign_members
        set campaign_id = $2,
            account_id = $3,
            contact_id = $4,
            raw_company_name = $5,
            raw_contact_name = $6,
            raw_email = $7,
            raw_phone = $8,
            attendee_status = $9,
            interests = $10::text[],
            follow_up_owner = $11,
            follow_up_status = $12,
            conversion_outcome = $13,
            notes = $14
        where id = $1
      `,
      [
        id,
        campaignId,
        accountId,
        contactId,
        member.raw_company_name,
        member.raw_contact_name,
        member.raw_email,
        member.raw_phone,
        member.attendee_status,
        member.interests,
        followUpOwner,
        member.follow_up_status,
        member.conversion_outcome,
        member.notes,
      ],
    );

    ctx.campaignMemberIds.set(member.key, id);
  }
}

async function seedProducts(db: Queryable, ctx: SeedContext, hasProducts: boolean) {
  if (!hasProducts) return;

  for (const product of DEMO_PRODUCTS) {
    const existing = await db.query<{ id: string }>(
      "select id from products where name = $1 limit 1",
      [product.name],
    );
    const existingId = existing.rows[0]?.id;

    if (existingId) {
      await db.query(
        `
          update products
          set description = $2,
              category = $3,
              billing_type = $4,
              default_term_months = $5,
              active = true
          where id = $1
        `,
        [
          existingId,
          product.description,
          product.category,
          product.billing_type,
          product.default_term_months,
        ],
      );
      ctx.productIds.set(product.key, existingId);
      continue;
    }

    const inserted = await db.query<{ id: string }>(
      `
        insert into products (name, description, category, billing_type, default_term_months, active)
        values ($1, $2, $3, $4, $5, true)
        returning id
      `,
      [
        product.name,
        product.description,
        product.category,
        product.billing_type,
        product.default_term_months,
      ],
    );
    ctx.productIds.set(product.key, inserted.rows[0].id);
  }
}

async function seedPricing(db: Queryable, ctx: SeedContext, pricingHasProductId: boolean) {
  const pricingRows = ctx.mode === "staging-smoke" ? DEMO_PRICING.slice(0, 2) : DEMO_PRICING;

  for (const item of pricingRows) {
    const productId = pricingHasProductId ? (ctx.productIds.get(item.productKey) ?? null) : null;
    const existing = await db.query<{ id: string }>(
      "select id from pricing_templates where service = $1 and active is true limit 1",
      [item.service],
    );
    let id = existing.rows[0]?.id;

    if (!id) {
      const inserted = pricingHasProductId
        ? await db.query<{ id: string }>(
            `
              insert into pricing_templates
                (service, description, category, unit_price, currency, active, product_id)
              values
                ($1, $2, $3, $4, $5, true, $6)
              returning id
            `,
            [
              item.service,
              item.description,
              item.category,
              item.unit_price,
              item.currency,
              productId,
            ],
          )
        : await db.query<{ id: string }>(
            `
              insert into pricing_templates
                (service, description, category, unit_price, currency, active)
              values
                ($1, $2, $3, $4, $5, true)
              returning id
            `,
            [item.service, item.description, item.category, item.unit_price, item.currency],
          );
      id = inserted.rows[0].id;
    }

    if (pricingHasProductId) {
      await db.query(
        `
          update pricing_templates
          set description = $2,
              category = $3,
              unit_price = $4,
              currency = $5,
              active = true,
              product_id = coalesce($6, product_id)
          where id = $1
        `,
        [id, item.description, item.category, item.unit_price, item.currency, productId],
      );
    } else {
      await db.query(
        `
          update pricing_templates
          set description = $2,
              category = $3,
              unit_price = $4,
              currency = $5,
              active = true
          where id = $1
        `,
        [id, item.description, item.category, item.unit_price, item.currency],
      );
    }

    ctx.pricingIds.set(item.key, id);
  }
}

async function seedLeads(db: Queryable, ctx: SeedContext) {
  const leadRows = ctx.mode === "staging-smoke" ? DEMO_LEADS.slice(0, 1) : DEMO_LEADS;

  for (const lead of leadRows) {
    const accountId = lead.accountKey ? (ctx.accountIds.get(lead.accountKey) ?? null) : null;
    const existing = await db.query<{ id: string }>(
      "select id from leads where contact_email = $1 and source = $2 limit 1",
      [lead.contact_email, lead.source],
    );
    let id = existing.rows[0]?.id;

    if (!id) {
      const inserted = await db.query<{ id: string }>(
        `
          insert into leads
            (company_name, contact_name, contact_email, contact_phone, source, status,
             assigned_to, lead_score, qualification_data, enquiry_text, account_id)
          values
            ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
          returning id
        `,
        [
          lead.company_name,
          lead.contact_name,
          lead.contact_email,
          lead.contact_phone,
          lead.source,
          lead.status,
          ctx.profileIds.get(lead.ownerKey) ?? null,
          lead.lead_score,
          jsonb(lead.qualification_data),
          lead.enquiry_text,
          accountId,
        ],
      );
      id = inserted.rows[0].id;
    }

    await db.query(
      `
        update leads
        set company_name = $2,
            contact_name = $3,
            contact_email = $4,
            contact_phone = $5,
            source = $6,
            status = $7,
            assigned_to = $8,
            lead_score = $9,
            qualification_data = $10::jsonb,
            enquiry_text = $11,
            account_id = $12
        where id = $1
      `,
      [
        id,
        lead.company_name,
        lead.contact_name,
        lead.contact_email,
        lead.contact_phone,
        lead.source,
        lead.status,
        ctx.profileIds.get(lead.ownerKey) ?? null,
        lead.lead_score,
        jsonb(lead.qualification_data),
        lead.enquiry_text,
        accountId,
      ],
    );

    ctx.leadIds.set(lead.key, id);
  }
}

async function seedClients(db: Queryable, ctx: SeedContext) {
  if (!isFullDemoSeedMode(ctx.mode)) return;

  for (const client of DEMO_CLIENTS) {
    const ownerId = ctx.profileIds.get(client.ownerKey) ?? null;
    const accountId = client.accountKey ? (ctx.accountIds.get(client.accountKey) ?? null) : null;
    const existing = await db.query<{ id: string }>(
      "select id from clients where lower(company_name) = lower($1) limit 1",
      [client.company_name],
    );
    let id = existing.rows[0]?.id;

    if (!id) {
      const inserted = await db.query<{ id: string }>(
        `
          insert into clients
            (company_name, industry, tier, account_owner, health_score, onboarding_status, account_id)
          values
            ($1, $2, $3, $4, 50, 'live', $5)
          returning id
        `,
        [client.company_name, client.industry, client.tier, ownerId, accountId],
      );
      id = inserted.rows[0].id;
    }

    await db.query(
      `
        update clients
        set company_name = $2,
            industry = $3,
            tier = $4,
            account_owner = $5,
            health_score = 50,
            onboarding_status = 'live',
            account_id = $6
        where id = $1
      `,
      [id, client.company_name, client.industry, client.tier, ownerId, accountId],
    );

    ctx.clientIds.set(client.key, id);
  }
}

async function seedClientContacts(db: Queryable, ctx: SeedContext, hasClientContacts: boolean) {
  if (!isFullDemoSeedMode(ctx.mode) || !hasClientContacts) return;

  for (const contact of DEMO_CONTACTS) {
    const clientId = ctx.clientIds.get(contact.clientKey);
    if (!clientId) continue;

    const existing = await db.query<{ id: string }>(
      `
        select id
        from client_contacts
        where client_id = $1
          and lower(coalesce(email, '')) = lower($2)
        limit 1
      `,
      [clientId, contact.email],
    );
    let id = existing.rows[0]?.id;

    if (!id) {
      const inserted = await db.query<{ id: string }>(
        `
          insert into client_contacts (client_id, name, title, email, phone, is_primary)
          values ($1, $2, $3, $4, $5, $6)
          returning id
        `,
        [clientId, contact.name, contact.title, contact.email, contact.phone, contact.is_primary],
      );
      id = inserted.rows[0].id;
    }

    await db.query(
      `
        update client_contacts
        set client_id = $2,
            name = $3,
            title = $4,
            email = $5,
            phone = $6,
            is_primary = $7
        where id = $1
      `,
      [id, clientId, contact.name, contact.title, contact.email, contact.phone, contact.is_primary],
    );

    ctx.contactIds.set(contact.key, id);
  }
}

async function seedEngagements(db: Queryable, ctx: SeedContext, hasEngagements: boolean) {
  if (!isFullDemoSeedMode(ctx.mode) || !hasEngagements) return;

  for (const engagement of DEMO_ENGAGEMENTS) {
    const productId = ctx.productIds.get(engagement.productKey);
    const clientId = ctx.clientIds.get(engagement.clientKey);
    if (!productId || !clientId) continue;
    const leadId = engagement.leadKey ? (ctx.leadIds.get(engagement.leadKey) ?? null) : null;

    const existing = await db.query<{ id: string }>(
      `
        select id
        from engagements
        where client_id = $1
          and product_id = $2
        limit 1
      `,
      [clientId, productId],
    );
    let id = existing.rows[0]?.id;

    if (!id) {
      const inserted = await db.query<{ id: string }>(
        `
          insert into engagements
            (client_id, product_id, owner, value, billing_period, start_date, renewal_date, status,
             health_score, renewal_risk, risk_reasoning, next_action, last_touch_at, lead_id)
          values
            ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          returning id
        `,
        [
          clientId,
          productId,
          ctx.profileIds.get(engagement.ownerKey) ?? null,
          engagement.value,
          engagement.billing_period,
          ctx.dates[engagement.startDateKey],
          ctx.dates[engagement.renewalDateKey],
          engagement.status,
          engagement.health_score,
          engagement.renewal_risk,
          engagement.risk_reasoning,
          engagement.next_action,
          engagement.lastTouchKey ? ctx.dates[engagement.lastTouchKey] : null,
          leadId,
        ],
      );
      id = inserted.rows[0].id;
    }

    await db.query(
      `
        update engagements
        set client_id = $2,
            product_id = $3,
            owner = $4,
            value = $5,
            billing_period = $6,
            start_date = $7,
            renewal_date = $8,
            status = $9,
            health_score = $10,
            renewal_risk = $11,
            risk_reasoning = $12,
            next_action = $13,
            last_touch_at = $14,
            lead_id = $15
        where id = $1
      `,
      [
        id,
        clientId,
        productId,
        ctx.profileIds.get(engagement.ownerKey) ?? null,
        engagement.value,
        engagement.billing_period,
        ctx.dates[engagement.startDateKey],
        ctx.dates[engagement.renewalDateKey],
        engagement.status,
        engagement.health_score,
        engagement.renewal_risk,
        engagement.risk_reasoning,
        engagement.next_action,
        engagement.lastTouchKey ? ctx.dates[engagement.lastTouchKey] : null,
        leadId,
      ],
    );

    ctx.engagementIds.set(engagement.key, id);
  }
}

async function seedQuotes(db: Queryable, ctx: SeedContext) {
  if (!isFullDemoSeedMode(ctx.mode)) return;

  for (const quote of DEMO_QUOTES) {
    const accountId = quote.accountKey ? (ctx.accountIds.get(quote.accountKey) ?? null) : null;
    const leadId = quote.leadKey ? (ctx.leadIds.get(quote.leadKey) ?? null) : null;
    const clientId = quote.clientKey ? (ctx.clientIds.get(quote.clientKey) ?? null) : null;
    const contactId = quote.accountContactKey
      ? (ctx.accountContactIds.get(quote.accountContactKey) ?? null)
      : null;
    const validUntil = addDaysToDateString(ctx.dates.today, quote.validUntilOffsetDays);
    const createdBy = ctx.profileIds.get(quote.createdByKey) ?? null;
    const lineItems = jsonb(quote.line_items);
    const existing = await db.query<{ id: string }>(
      "select id from quotes where number = $1 limit 1",
      [quote.number],
    );
    let id = existing.rows[0]?.id;

    if (!id) {
      const inserted = await db.query<{ id: string }>(
        `
          insert into quotes
            (number, lead_id, client_id, contact_id, account_id, status, total_value, currency,
             valid_until, line_items, created_by)
          values
            ($1, $2, $3, $4, $5, $6, $7, 'HKD', $8, $9::jsonb, $10)
          returning id
        `,
        [
          quote.number,
          leadId,
          clientId,
          contactId,
          accountId,
          quote.status,
          quote.total_value,
          validUntil,
          lineItems,
          createdBy,
        ],
      );
      id = inserted.rows[0].id;
    }

    await db.query(
      `
        update quotes
        set number = $2,
            lead_id = $3,
            client_id = $4,
            contact_id = $5,
            account_id = $6,
            status = $7,
            total_value = $8,
            currency = 'HKD',
            valid_until = $9,
            line_items = $10::jsonb,
            created_by = $11
        where id = $1
      `,
      [
        id,
        quote.number,
        leadId,
        clientId,
        contactId,
        accountId,
        quote.status,
        quote.total_value,
        validUntil,
        lineItems,
        createdBy,
      ],
    );

    ctx.quoteIds.set(quote.key, id);
  }
}

async function seedJobSheets(db: Queryable, ctx: SeedContext) {
  if (!isFullDemoSeedMode(ctx.mode)) return;

  for (const jobSheet of DEMO_JOB_SHEETS) {
    const quoteId = ctx.quoteIds.get(jobSheet.quoteKey);
    const accountId = ctx.accountIds.get(jobSheet.accountKey);
    const clientId = ctx.clientIds.get(jobSheet.clientKey);
    const contactId = ctx.accountContactIds.get(jobSheet.accountContactKey);
    if (!quoteId || !accountId || !clientId || !contactId) continue;

    const quote = DEMO_QUOTES.find((candidate) => candidate.key === jobSheet.quoteKey);
    if (!quote) continue;
    const versionSnapshot = jsonb({
      demo: true,
      quote_key: quote.key,
      id: quoteId,
      number: quote.number,
      status: "accepted",
      total_value: quote.total_value,
      currency: "HKD",
      line_items: quote.line_items,
    });
    const existingVersion = await db.query<{ id: string }>(
      `
        select id
        from quote_versions
        where quote_id = $1
          and reason = 'accepted'
        order by version_number desc
        limit 1
      `,
      [quoteId],
    );
    let acceptedVersionId = existingVersion.rows[0]?.id;

    if (!acceptedVersionId) {
      const insertedVersion = await db.query<{ id: string }>(
        `
          insert into quote_versions
            (quote_id, version_number, reason, snapshot, pdf_url, created_by)
          values
            (
              $1,
              coalesce((select max(version_number) + 1 from quote_versions where quote_id = $1), 1),
              'accepted',
              $2::jsonb,
              $3,
              $4
            )
          returning id
        `,
        [
          quoteId,
          versionSnapshot,
          `/quotes/${quoteId}/pdf`,
          ctx.profileIds.get(jobSheet.salesOwnerKey) ?? null,
        ],
      );
      acceptedVersionId = insertedVersion.rows[0].id;
    } else {
      await db.query(
        `
          update quote_versions
          set snapshot = $2::jsonb,
              pdf_url = $3,
              created_by = $4
          where id = $1
        `,
        [
          acceptedVersionId,
          versionSnapshot,
          `/quotes/${quoteId}/pdf`,
          ctx.profileIds.get(jobSheet.salesOwnerKey) ?? null,
        ],
      );
    }

    await db.query(
      `
        update quotes
        set status = 'accepted',
            accepted_version_id = $2,
            accepted_at = coalesce(accepted_at, now()),
            accepted_by = $3,
            account_id = $4,
            client_id = $5,
            contact_id = $6
        where id = $1
      `,
      [
        quoteId,
        acceptedVersionId,
        ctx.profileIds.get(jobSheet.salesOwnerKey) ?? null,
        accountId,
        clientId,
        contactId,
      ],
    );

    const existingJobSheet = await db.query<{ id: string }>(
      "select id from job_sheets where number = $1 limit 1",
      [jobSheet.number],
    );
    let jobSheetId = existingJobSheet.rows[0]?.id;

    if (!jobSheetId) {
      const insertedJobSheet = await db.query<{ id: string }>(
        `
          insert into job_sheets
            (number, quote_id, accepted_quote_version_id, account_id, client_id, contact_id,
             sales_owner, accounting_owner, status, accepted_scope_summary, po_number,
             client_order_number, xero_customer_reference, accounting_notes,
             special_billing_instructions, total_amount, currency, created_by)
          values
            ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'HKD', $17)
          returning id
        `,
        [
          jobSheet.number,
          quoteId,
          acceptedVersionId,
          accountId,
          clientId,
          contactId,
          ctx.profileIds.get(jobSheet.salesOwnerKey) ?? null,
          ctx.profileIds.get(jobSheet.accountingOwnerKey) ?? null,
          jobSheet.status,
          jobSheet.accepted_scope_summary,
          jobSheet.po_number,
          jobSheet.client_order_number,
          jobSheet.xero_customer_reference,
          jobSheet.accounting_notes,
          jobSheet.special_billing_instructions,
          jobSheet.total_amount,
          ctx.profileIds.get(jobSheet.salesOwnerKey) ?? null,
        ],
      );
      jobSheetId = insertedJobSheet.rows[0].id;
    }

    await db.query(
      `
        update job_sheets
        set quote_id = $2,
            accepted_quote_version_id = $3,
            account_id = $4,
            client_id = $5,
            contact_id = $6,
            sales_owner = $7,
            accounting_owner = $8,
            status = $9,
            accepted_scope_summary = $10,
            po_number = $11,
            client_order_number = $12,
            xero_customer_reference = $13,
            accounting_notes = $14,
            special_billing_instructions = $15,
            total_amount = $16,
            currency = 'HKD',
            created_by = $17
        where id = $1
      `,
      [
        jobSheetId,
        quoteId,
        acceptedVersionId,
        accountId,
        clientId,
        contactId,
        ctx.profileIds.get(jobSheet.salesOwnerKey) ?? null,
        ctx.profileIds.get(jobSheet.accountingOwnerKey) ?? null,
        jobSheet.status,
        jobSheet.accepted_scope_summary,
        jobSheet.po_number,
        jobSheet.client_order_number,
        jobSheet.xero_customer_reference,
        jobSheet.accounting_notes,
        jobSheet.special_billing_instructions,
        jobSheet.total_amount,
        ctx.profileIds.get(jobSheet.salesOwnerKey) ?? null,
      ],
    );

    for (const portion of jobSheet.portions) {
      const existingPortion = await db.query<{ id: string }>(
        `
          select id
          from job_sheet_portions
          where job_sheet_id = $1
            and name = $2
          limit 1
        `,
        [jobSheetId, portion.name],
      );
      let portionId = existingPortion.rows[0]?.id;
      const targetInvoiceDate = addDaysToDateString(
        ctx.dates.today,
        portion.targetInvoiceOffsetDays,
      );

      if (!portionId) {
        const insertedPortion = await db.query<{ id: string }>(
          `
            insert into job_sheet_portions
              (job_sheet_id, name, source_quote_line_item_ids, description, amount,
               currency, target_invoice_date, billing_type, status, sort_order)
            values
              ($1, $2, '{}'::uuid[], $3, $4, 'HKD', $5, $6, $7, $8)
            returning id
          `,
          [
            jobSheetId,
            portion.name,
            portion.description,
            portion.amount,
            targetInvoiceDate,
            portion.billing_type,
            portion.status,
            portion.sort_order,
          ],
        );
        portionId = insertedPortion.rows[0].id;
      }

      await db.query(
        `
          update job_sheet_portions
          set name = $2,
              source_quote_line_item_ids = '{}'::uuid[],
              description = $3,
              amount = $4,
              currency = 'HKD',
              target_invoice_date = $5,
              billing_type = $6,
              status = $7,
              sort_order = $8
          where id = $1
        `,
        [
          portionId,
          portion.name,
          portion.description,
          portion.amount,
          targetInvoiceDate,
          portion.billing_type,
          portion.status,
          portion.sort_order,
        ],
      );
    }

    ctx.jobSheetIds.set(jobSheet.key, jobSheetId);
  }
}

async function seedAgentRuns(db: Queryable, ctx: SeedContext) {
  if (!isFullDemoSeedMode(ctx.mode)) return;

  for (const run of DEMO_AGENT_RUNS) {
    const subjectId =
      run.subjectType === "lead"
        ? ctx.leadIds.get(run.subjectKey)
        : ctx.engagementIds.get(run.subjectKey);
    if (!subjectId) continue;
    const inputData = jsonb({ demo: true, demo_key: run.key, subject_key: run.subjectKey });
    const outputData = jsonb({ demo: true, demo_key: run.key, summary: run.output_summary });

    const existing = await db.query<{ id: string }>(
      `
        select id
        from agent_runs
        where input_data->>'demo_key' = $1
           or (
             agent_name = $2
             and workflow_type = $3
             and subject_type = $4
             and subject_id = $5
             and input_data->>'subject_key' = $6
           )
        limit 1
      `,
      [run.key, run.agent_name, run.workflow_type, run.subjectType, subjectId, run.subjectKey],
    );
    let id = existing.rows[0]?.id;

    if (!id) {
      const inserted = await db.query<{ id: string }>(
        `
          insert into agent_runs
            (agent_name, workflow_type, trigger_type, subject_type, subject_id, input_data,
             output_data, output_summary, status, confidence_score, human_review_required, model_used, created_by)
          values
            ($1, $2, 'manual', $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11, $12)
          returning id
        `,
        [
          run.agent_name,
          run.workflow_type,
          run.subjectType,
          subjectId,
          inputData,
          outputData,
          run.output_summary,
          run.status,
          run.confidence_score,
          run.human_review_required,
          run.model_used,
          ctx.profileIds.get("sales") ?? null,
        ],
      );
      id = inserted.rows[0].id;
    }

    await db.query(
      `
        update agent_runs
        set agent_name = $2,
            workflow_type = $3,
            trigger_type = 'manual',
            subject_type = $4,
            subject_id = $5,
            input_data = $6::jsonb,
            output_data = $7::jsonb,
            output_summary = $8,
            status = $9,
            confidence_score = $10,
            human_review_required = $11,
            model_used = $12,
            created_by = $13
        where id = $1
      `,
      [
        id,
        run.agent_name,
        run.workflow_type,
        run.subjectType,
        subjectId,
        inputData,
        outputData,
        run.output_summary,
        run.status,
        run.confidence_score,
        run.human_review_required,
        run.model_used,
        ctx.profileIds.get("sales") ?? null,
      ],
    );

    ctx.agentRunIds.set(run.key, id);
  }
}

async function seedApprovals(db: Queryable, ctx: SeedContext) {
  if (!isFullDemoSeedMode(ctx.mode)) return;

  for (const approval of DEMO_APPROVALS) {
    const agentRunId = ctx.agentRunIds.get(approval.runKey);
    if (!agentRunId) continue;
    const contextData = jsonb({ demo: true, demo_key: approval.key, approval_key: approval.key });
    const assignedTo = ctx.profileIds.get(approval.assignedToKey) ?? null;

    const existing = await db.query<{ id: string }>(
      `
        select id
        from human_approvals
        where context_data->>'demo_key' = $1
           or (
             agent_run_id = $2
             and approval_type = $3
             and context_data->>'approval_key' = $1
           )
        limit 1
      `,
      [approval.key, agentRunId, approval.approval_type],
    );
    let id = existing.rows[0]?.id;

    if (!id) {
      const inserted = await db.query<{ id: string }>(
        `
          insert into human_approvals
            (agent_run_id, approval_type, requested_by, assigned_to, status, context_data, context_summary)
          values
            ($1, $2, 'Demo Agent', $3, $4, $5::jsonb, $6)
          returning id
        `,
        [
          agentRunId,
          approval.approval_type,
          assignedTo,
          approval.status,
          contextData,
          approval.context_summary,
        ],
      );
      id = inserted.rows[0].id;
    }

    await db.query(
      `
        update human_approvals
        set agent_run_id = $2,
            approval_type = $3,
            requested_by = 'Demo Agent',
            assigned_to = $4,
            status = $5,
            context_data = $6::jsonb,
            context_summary = $7
        where id = $1
      `,
      [
        id,
        agentRunId,
        approval.approval_type,
        assignedTo,
        approval.status,
        contextData,
        approval.context_summary,
      ],
    );

    ctx.approvalIds.set(approval.key, id);
  }
}

async function seedTasks(db: Queryable, ctx: SeedContext) {
  if (!isFullDemoSeedMode(ctx.mode)) return;

  for (const task of DEMO_TASKS) {
    const leadId = task.leadKey ? (ctx.leadIds.get(task.leadKey) ?? null) : null;
    const clientId = task.clientKey ? (ctx.clientIds.get(task.clientKey) ?? null) : null;
    const dueDate = task.dueDateKey ? ctx.dates[task.dueDateKey] : null;
    const assignedTo = ctx.profileIds.get(task.assignedToKey) ?? null;
    const existing = await db.query<{ id: string }>(
      `
        select id
        from tasks
        where title = $1
          and lead_id is not distinct from $2::uuid
          and client_id is not distinct from $3::uuid
        limit 1
      `,
      [task.title, leadId, clientId],
    );
    const id = existing.rows[0]?.id;

    if (!id) {
      await db.query(
        `
          insert into tasks
            (title, description, assigned_to, lead_id, client_id, due_date, priority, status)
          values
            ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          task.title,
          task.description,
          assignedTo,
          leadId,
          clientId,
          dueDate,
          task.priority,
          task.status,
        ],
      );
      continue;
    }

    await db.query(
      `
        update tasks
        set title = $2,
            description = $3,
            assigned_to = $4,
            lead_id = $5,
            client_id = $6,
            due_date = $7,
            priority = $8,
            status = $9
        where id = $1
      `,
      [
        id,
        task.title,
        task.description,
        assignedTo,
        leadId,
        clientId,
        dueDate,
        task.priority,
        task.status,
      ],
    );
  }
}

async function seedTouchpoints(db: Queryable, ctx: SeedContext, hasTouchpoints: boolean) {
  if (!isFullDemoSeedMode(ctx.mode) || !hasTouchpoints) return;

  for (const touchpoint of DEMO_TOUCHPOINTS) {
    const clientId = ctx.clientIds.get(touchpoint.clientKey);
    if (!clientId) continue;
    const engagementId = touchpoint.engagementKey
      ? (ctx.engagementIds.get(touchpoint.engagementKey) ?? null)
      : null;
    const contactId = touchpoint.contactKey
      ? (ctx.contactIds.get(touchpoint.contactKey) ?? null)
      : null;
    const occurredAt = ctx.dates[touchpoint.occurredAtKey];
    const loggedBy = ctx.profileIds.get(touchpoint.loggedByKey) ?? null;
    const existing = await db.query<{ id: string }>(
      `
        select id
        from touchpoints
        where client_id = $1
          and type = $2
          and notes = $3
        limit 1
      `,
      [clientId, touchpoint.type, touchpoint.notes],
    );
    const id = existing.rows[0]?.id;

    if (!id) {
      await db.query(
        `
          insert into touchpoints
            (client_id, engagement_id, contact_id, type, sentiment, notes, occurred_at, logged_by)
          values
            ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          clientId,
          engagementId,
          contactId,
          touchpoint.type,
          touchpoint.sentiment,
          touchpoint.notes,
          occurredAt,
          loggedBy,
        ],
      );
      continue;
    }

    await db.query(
      `
        update touchpoints
        set client_id = $2,
            engagement_id = $3,
            contact_id = $4,
            type = $5,
            sentiment = $6,
            notes = $7,
            occurred_at = $8,
            logged_by = $9
        where id = $1
      `,
      [
        id,
        clientId,
        engagementId,
        contactId,
        touchpoint.type,
        touchpoint.sentiment,
        touchpoint.notes,
        occurredAt,
        loggedBy,
      ],
    );
  }
}

async function seedNotifications(db: Queryable, ctx: SeedContext, hasNotifications: boolean) {
  if (!isFullDemoSeedMode(ctx.mode) || !hasNotifications) return;

  for (const notification of DEMO_NOTIFICATIONS) {
    const objectId =
      notification.objectType === "engagement"
        ? ctx.engagementIds.get(notification.objectKey)
        : ctx.approvalIds.get(notification.objectKey);
    if (!objectId) continue;
    const userId = ctx.profileIds.get(notification.userKey);
    if (!userId) continue;
    const dedupeKey = `demo:${notification.key}`;
    const readAt = notification.read ? ctx.dates.recentTouch : null;
    const existing = await db.query<{ id: string }>(
      "select id from notifications where dedupe_key = $1 limit 1",
      [dedupeKey],
    );
    const id = existing.rows[0]?.id;

    if (!id) {
      await db.query(
        `
          insert into notifications
            (user_id, type, title, body, object_type, object_id, dedupe_key, read_at)
          values
            ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          userId,
          notification.type,
          notification.title,
          notification.body,
          notification.objectType,
          objectId,
          dedupeKey,
          readAt,
        ],
      );
      continue;
    }

    await db.query(
      `
        update notifications
        set user_id = $2,
            type = $3,
            title = $4,
            body = $5,
            object_type = $6,
            object_id = $7,
            dedupe_key = $8,
            read_at = $9
        where id = $1
      `,
      [
        id,
        userId,
        notification.type,
        notification.title,
        notification.body,
        notification.objectType,
        objectId,
        dedupeKey,
        readAt,
      ],
    );
  }
}

async function seedActivityLogs(db: Queryable, ctx: SeedContext) {
  if (!isFullDemoSeedMode(ctx.mode)) return;

  const logs = [
    ["log-qualify-beauty", "agent", "run-qualify-beauty", "qualified lead", "lead", "lead-beauty"],
    ["log-quote-fitness", "agent", "run-quote-fitness", "drafted quote", "quote", "quote-fitness"],
    ["log-risk-apex", "user", "manager", "escalated approval", "approval", "approval-risk-apex"],
    ["log-touch-apex", "user", "cs", "logged renewal touchpoint", "engagement", "apex-crm"],
    [
      "log-won-cafe",
      "user",
      "sales",
      "converted won lead to engagement",
      "engagement",
      "cafe-whatsapp",
    ],
  ] as const;

  for (const [logKey, actorType, actorKey, action, objectType, objectKey] of logs) {
    const actorId =
      actorType === "agent" ? ctx.agentRunIds.get(actorKey) : ctx.profileIds.get(actorKey);
    const objectId =
      objectType === "lead"
        ? ctx.leadIds.get(objectKey)
        : objectType === "quote"
          ? ctx.quoteIds.get(objectKey)
          : objectType === "approval"
            ? ctx.approvalIds.get(objectKey)
            : ctx.engagementIds.get(objectKey);

    if (!objectId) continue;
    const diffData = jsonb({ demo: true, demo_key: logKey });
    const existing = await db.query<{ id: string }>(
      "select id from activity_logs where diff_data->>'demo_key' = $1 limit 1",
      [logKey],
    );
    const id = existing.rows[0]?.id;

    if (!id) {
      await db.query(
        `
          insert into activity_logs
            (actor_type, actor_id, actor_name, action, object_type, object_id, diff_data)
          values
            ($1, $2, $3, $4, $5, $6, $7::jsonb)
        `,
        [
          actorType,
          actorId ?? null,
          actorType === "agent" ? "Demo Agent" : "Demo User",
          action,
          objectType,
          objectId,
          diffData,
        ],
      );
      continue;
    }

    await db.query(
      `
        update activity_logs
        set actor_type = $2,
            actor_id = $3,
            actor_name = $4,
            action = $5,
            object_type = $6,
            object_id = $7,
            diff_data = $8::jsonb
        where id = $1
      `,
      [
        id,
        actorType,
        actorId ?? null,
        actorType === "agent" ? "Demo Agent" : "Demo User",
        action,
        objectType,
        objectId,
        diffData,
      ],
    );
  }
}

async function seedAll(db: Queryable, ctx: SeedContext) {
  const capabilities = await getRetentionCapabilities(db);

  if (ctx.mode === "local-demo-reset") {
    assertLocalDemoRetentionSurface(capabilities);
    await resetLocalDemoData(db);
  }

  await seedProfiles(db, ctx);
  await seedAccounts(db, ctx);
  await seedAccountContacts(db, ctx);
  await seedProducts(db, ctx, capabilities.hasProducts);
  await seedPricing(db, ctx, capabilities.pricingHasProductId);
  await seedLeads(db, ctx);
  await seedClients(db, ctx);
  await seedClientContacts(db, ctx, capabilities.hasClientContacts);
  await seedEngagements(db, ctx, capabilities.hasEngagements);
  await seedQuotes(db, ctx);
  await seedCampaigns(db, ctx);
  await seedCampaignMembers(db, ctx);
  await seedJobSheets(db, ctx);
  await seedAgentRuns(db, ctx);
  await seedApprovals(db, ctx);
  await seedTasks(db, ctx);
  await seedTouchpoints(db, ctx, capabilities.hasTouchpoints);
  await seedNotifications(db, ctx, capabilities.hasNotifications);
  await seedActivityLogs(db, ctx);

  return {
    mode: ctx.mode,
    dates: ctx.dates,
    capabilities,
    profile_ids: Object.fromEntries(ctx.profileIds),
    account_ids: Object.fromEntries(ctx.accountIds),
    account_contact_ids: Object.fromEntries(ctx.accountContactIds),
    campaign_ids: Object.fromEntries(ctx.campaignIds),
    campaign_member_ids: Object.fromEntries(ctx.campaignMemberIds),
    product_ids: Object.fromEntries(ctx.productIds),
    pricing_template_ids: Object.fromEntries(ctx.pricingIds),
    lead_ids: Object.fromEntries(ctx.leadIds),
    client_ids: Object.fromEntries(ctx.clientIds),
    contact_ids: Object.fromEntries(ctx.contactIds),
    engagement_ids: Object.fromEntries(ctx.engagementIds),
    quote_ids: Object.fromEntries(ctx.quoteIds),
    job_sheet_ids: Object.fromEntries(ctx.jobSheetIds),
    agent_run_ids: Object.fromEntries(ctx.agentRunIds),
    approval_ids: Object.fromEntries(ctx.approvalIds),
  };
}

async function main() {
  const mode = getSeedMode(process.env);
  assertSeedAllowed({ mode, databaseUrl: process.env.DATABASE_URL ?? "", env: process.env });
  const databaseUrl = requiredEnv("DATABASE_URL");
  assertSeedAllowed({ mode, databaseUrl, env: process.env });
  const ctx = makeSeedContext(mode);

  const pool = new Pool({ connectionString: databaseUrl });
  let client: ReleasableQueryable | undefined;

  try {
    client = await pool.connect();
    await client.query("begin");
    const summary = await seedAll(client, ctx);
    await client.query("commit");
    console.log(JSON.stringify({ ok: true, ...summary }, null, 2));
  } catch (error) {
    if (client) {
      try {
        await client.query("rollback");
      } catch (rollbackError) {
        console.error("Failed to rollback seed transaction", rollbackError);
      }
    }
    throw error;
  } finally {
    client?.release();
    await pool.end();
  }
}

await main();
