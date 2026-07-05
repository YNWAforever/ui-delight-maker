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
  DEMO_AGENT_RUNS,
  DEMO_APPROVALS,
  DEMO_CLIENTS,
  DEMO_CONTACTS,
  DEMO_ENGAGEMENTS,
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
  productIds: Map<string, string>;
  pricingIds: Map<string, string>;
  leadIds: Map<string, string>;
  clientIds: Map<string, string>;
  contactIds: Map<string, string>;
  engagementIds: Map<string, string>;
  quoteIds: Map<string, string>;
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
    productIds: new Map(),
    pricingIds: new Map(),
    leadIds: new Map(),
    clientIds: new Map(),
    contactIds: new Map(),
    engagementIds: new Map(),
    quoteIds: new Map(),
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
    "notifications",
    "touchpoints",
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
             assigned_to, lead_score, qualification_data, enquiry_text)
          values
            ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
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
            enquiry_text = $11
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
      ],
    );

    ctx.leadIds.set(lead.key, id);
  }
}

async function seedClients(db: Queryable, ctx: SeedContext) {
  if (!isFullDemoSeedMode(ctx.mode)) return;

  for (const client of DEMO_CLIENTS) {
    const ownerId = ctx.profileIds.get(client.ownerKey) ?? null;
    const existing = await db.query<{ id: string }>(
      "select id from clients where lower(company_name) = lower($1) limit 1",
      [client.company_name],
    );
    let id = existing.rows[0]?.id;

    if (!id) {
      const inserted = await db.query<{ id: string }>(
        `
          insert into clients
            (company_name, industry, tier, account_owner, health_score, onboarding_status)
          values
            ($1, $2, $3, $4, 50, 'live')
          returning id
        `,
        [client.company_name, client.industry, client.tier, ownerId],
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
            onboarding_status = 'live'
        where id = $1
      `,
      [id, client.company_name, client.industry, client.tier, ownerId],
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
    const leadId = quote.leadKey ? (ctx.leadIds.get(quote.leadKey) ?? null) : null;
    const clientId = quote.clientKey ? (ctx.clientIds.get(quote.clientKey) ?? null) : null;
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
            (number, lead_id, client_id, status, total_value, currency, valid_until, line_items, created_by)
          values
            ($1, $2, $3, $4, $5, 'HKD', $6, $7::jsonb, $8)
          returning id
        `,
        [
          quote.number,
          leadId,
          clientId,
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
            status = $5,
            total_value = $6,
            currency = 'HKD',
            valid_until = $7,
            line_items = $8::jsonb,
            created_by = $9
        where id = $1
      `,
      [
        id,
        quote.number,
        leadId,
        clientId,
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
  await seedProducts(db, ctx, capabilities.hasProducts);
  await seedPricing(db, ctx, capabilities.pricingHasProductId);
  await seedLeads(db, ctx);
  await seedClients(db, ctx);
  await seedClientContacts(db, ctx, capabilities.hasClientContacts);
  await seedEngagements(db, ctx, capabilities.hasEngagements);
  await seedQuotes(db, ctx);
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
    product_ids: Object.fromEntries(ctx.productIds),
    pricing_template_ids: Object.fromEntries(ctx.pricingIds),
    lead_ids: Object.fromEntries(ctx.leadIds),
    client_ids: Object.fromEntries(ctx.clientIds),
    contact_ids: Object.fromEntries(ctx.contactIds),
    engagement_ids: Object.fromEntries(ctx.engagementIds),
    quote_ids: Object.fromEntries(ctx.quoteIds),
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
