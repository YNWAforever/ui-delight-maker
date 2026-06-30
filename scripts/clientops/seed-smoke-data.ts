import { Pool } from "@neondatabase/serverless";

type Queryable = {
  query<T = unknown>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
};

type ProfileSeed = {
  id: string;
  email: string;
  name: string;
};

const PRICING = [
  {
    service: "AI Sales Desk Discovery Sprint",
    description:
      "Two-week sprint to map lead intake, qualification, reply drafting, and quote workflow.",
    category: "AI transformation",
    unit_price: 38000,
    currency: "HKD",
  },
  {
    service: "ClientOps CRM Retainer",
    description: "Monthly CRM operations, pipeline hygiene, lead follow-up, and reporting support.",
    category: "CRM",
    unit_price: 28000,
    currency: "HKD",
  },
];

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function assertStagingSeedAllowed(databaseUrl: string) {
  if (process.env.CLIENTOPS_ALLOW_STAGING_SEED !== "1") {
    throw new Error("Refusing to seed: CLIENTOPS_ALLOW_STAGING_SEED must be 1");
  }

  const lowered = databaseUrl.toLowerCase();
  if (lowered.includes("prod") || lowered.includes("production")) {
    throw new Error("Refusing to seed: DATABASE_URL looks like production");
  }
}

async function upsertProfile(db: Queryable, profile: ProfileSeed) {
  const result = await db.query<{ id: string }>(
    `
      insert into profiles (id, email, name, role, assignment_labels)
      values ($1, $2, $3, 'sales', array['smoke'])
      on conflict (id) do update set
        email = excluded.email,
        name = excluded.name,
        role = 'sales',
        assignment_labels = (
          select array_agg(distinct label)
          from unnest(
            coalesce(profiles.assignment_labels, '{}'::text[]) || excluded.assignment_labels
          ) as label
        )
      returning id
    `,
    [profile.id, profile.email, profile.name],
  );

  return result.rows[0].id;
}

async function upsertPricing(db: Queryable) {
  const ids: string[] = [];

  for (const item of PRICING) {
    const existing = await db.query<{ id: string }>(
      "select id from pricing_templates where service = $1 and active is true limit 1",
      [item.service],
    );

    if (existing.rows[0]) {
      await db.query(
        `
          update pricing_templates
          set description = $2, category = $3, unit_price = $4, currency = $5, active = true
          where id = $1
        `,
        [existing.rows[0].id, item.description, item.category, item.unit_price, item.currency],
      );
      ids.push(existing.rows[0].id);
      continue;
    }

    const inserted = await db.query<{ id: string }>(
      `
        insert into pricing_templates (service, description, category, unit_price, currency, active)
        values ($1, $2, $3, $4, $5, true)
        returning id
      `,
      [item.service, item.description, item.category, item.unit_price, item.currency],
    );
    ids.push(inserted.rows[0].id);
  }

  return ids;
}

async function upsertLead(db: Queryable, profileId: string) {
  const email = "smoke.lead@fimmick-clientops.example";
  const existing = await db.query<{ id: string }>(
    "select id from leads where contact_email = $1 and source = 'manual' limit 1",
    [email],
  );

  const values = [
    "Smoke Test Retail Group",
    "Maya Chan",
    email,
    "+852 5555 0101",
    "We need urgent help improving lead follow-up, CRM visibility, and AI-assisted reply drafting before a Q3 campaign launch. Budget is likely HKD 80k-150k.",
    profileId,
  ];

  if (existing.rows[0]) {
    const updated = await db.query<{ id: string }>(
      `
        update leads
        set company_name = $1,
            contact_name = $2,
            contact_phone = $4,
            enquiry_text = $5,
            assigned_to = $6,
            status = 'new',
            lead_score = 0,
            qualification_data = null
        where id = $7
        returning id
      `,
      [...values, existing.rows[0].id],
    );
    return updated.rows[0].id;
  }

  const inserted = await db.query<{ id: string }>(
    `
      insert into leads
        (company_name, contact_name, contact_email, contact_phone, source, status, enquiry_text, assigned_to)
      values
        ($1, $2, $3, $4, 'manual', 'new', $5, $6)
      returning id
    `,
    values,
  );

  return inserted.rows[0].id;
}

async function main() {
  const databaseUrl = requiredEnv("DATABASE_URL");
  assertStagingSeedAllowed(databaseUrl);
  const profile = {
    id: requiredEnv("CLIENTOPS_SMOKE_PROFILE_ID"),
    email: requiredEnv("CLIENTOPS_SMOKE_PROFILE_EMAIL"),
    name: requiredEnv("CLIENTOPS_SMOKE_PROFILE_NAME"),
  };

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    await client.query("begin");
    const profileId = await upsertProfile(client, profile);
    const pricingTemplateIds = await upsertPricing(client);
    const leadId = await upsertLead(client, profileId);
    await client.query("commit");

    console.log(
      JSON.stringify(
        {
          ok: true,
          profile_id: profileId,
          lead_id: leadId,
          pricing_template_ids: pricingTemplateIds,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
