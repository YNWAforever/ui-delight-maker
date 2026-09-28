import type { ImportRow } from "@/lib/csv-import";
import { addMonthsToDateString } from "@/lib/engagement-utils";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import { query, queryOne, type Queryable } from "@/server/db/neon.server";
import { authorizeImportRow, type ImportWriteEffect } from "./authorize-row.server";
import {
  ImportRowError,
  type ImportHandler,
  type ImportKind,
  type PreparedImportRow,
} from "./import-session.server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const TIER = new Set(["SME", "mid-market", "enterprise"]);
const ATTENDEE = new Set(["attended", "met", "high_intent", "unknown"]);
type Versioned = { id: string; row_version: number };
type Identity = { resource_id: string };
function text(values: ImportRow, name: string): string {
  return (values[name] ?? "").trim();
}
function status(
  status: PreparedImportRow["status"],
  action: string,
  message: string,
): PreparedImportRow {
  return { status, action, errors: [message] };
}
function kindResource(kind: ImportKind) {
  return kind === "event" ? "campaign_member" : kind;
}
function identityNamespace(
  kind: ImportKind,
  sourceNamespace: string | null,
  campaignId: string | null,
) {
  if (!sourceNamespace) return null;
  return kind === "event"
    ? `${sourceNamespace}:campaign:${campaignId ?? "missing"}`
    : sourceNamespace;
}
async function mappedIdentity(
  namespace: string,
  resourceType: string,
  externalId: string,
  db?: Queryable,
): Promise<string | null> {
  const mapped = await queryOne<Identity>(
    "select resource_id from import_identity_keys where source_namespace=$1 and resource_type=$2 and external_key=$3",
    [namespace, resourceType, externalId],
    db,
  );
  return mapped?.resource_id ?? null;
}
async function targetVersion(kind: ImportKind, id: string, db?: Queryable) {
  const table = kind === "lead" ? "leads" : kind === "client" ? "clients" : "accounts";
  const row = await queryOne<Versioned>(
    `select id,row_version from ${table} where id=$1`,
    [id],
    db,
  );
  return row?.row_version ?? null;
}
async function candidateCount(kind: ImportKind, values: ImportRow) {
  if (kind === "lead") {
    return query<{ id: string }>(
      "select id from leads where trim(lower(company_name))=trim(lower($1)) and trim(lower(coalesce(contact_email,'')))=trim(lower($2)) limit 2",
      [text(values, "company_name"), text(values, "contact_email")],
    );
  }
  if (kind === "client") {
    return query<{ id: string }>(
      "select id from clients where trim(lower(company_name))=trim(lower($1)) limit 2",
      [text(values, "company_name")],
    );
  }
  return query<{ id: string }>("select id from accounts where lower(name)=lower($1) limit 2", [
    text(values, "company_name"),
  ]);
}

export const productionImportHandler: ImportHandler = {
  async prepareRow(_context, kind, values, input) {
    if (text(values, "import_action") === "skip")
      return { status: "skipped", action: "skip", errors: ["Skipped by importer"] };
    const company = text(values, "company_name");
    const externalId = text(values, "external_id");
    const explicitId = text(values, kind === "event" ? "account_id" : "existing_id");
    if (externalId && (!input.sourceNamespace || externalId.length > 200))
      return status(
        "invalid",
        "review",
        "External ID requires a source namespace and at most 200 characters",
      );
    if (explicitId && !UUID.test(explicitId))
      return status("invalid", "review", "Existing record ID is invalid");
    if (kind === "lead" && (!company || !EMAIL.test(text(values, "contact_email"))))
      return status("invalid", "review", "Company and valid contact email are required");
    if (kind === "client" && !company) return status("invalid", "review", "Company is required");
    if (kind === "client" && text(values, "tier") && !TIER.has(text(values, "tier")))
      return status("invalid", "review", "Client tier is invalid");
    if (kind === "event") {
      if (!input.campaignId || !UUID.test(input.campaignId))
        return status("invalid", "review", "Campaign ID is required");
      if (!company && !text(values, "contact_name"))
        return status("invalid", "review", "Company or contact is required");
      if (text(values, "email") && !EMAIL.test(text(values, "email")))
        return status("invalid", "review", "Contact email is invalid");
      if (text(values, "attendee_status") && !ATTENDEE.has(text(values, "attendee_status")))
        return status("invalid", "review", "Attendee status is invalid");
    }
    if (text(values, "owner_email")) {
      const owner = await queryOne<{ id: string }>(
        "select id from profiles where lower(email)=lower($1) and status='active'",
        [text(values, "owner_email")],
      );
      if (!owner) return status("invalid", "review", "Owner is unavailable");
    }
    if (kind === "client" && text(values, "product_name")) {
      const product = await queryOne<{ id: string }>(
        "select id from products where name=$1 and active=true",
        [text(values, "product_name")],
      );
      if (!product) return status("invalid", "review", "Product is unavailable");
    }
    const resourceType = kindResource(kind);
    const namespace = identityNamespace(kind, input.sourceNamespace, input.campaignId);
    const mapped =
      externalId && namespace ? await mappedIdentity(namespace, resourceType, externalId) : null;
    if (mapped && kind === "event")
      return {
        status: "skipped",
        action: "skip",
        targetId: mapped,
        errors: ["External attendee ID already imported"],
      };
    if (mapped && explicitId && mapped !== explicitId)
      return status("ambiguous", "review", "External ID and selected existing ID disagree");
    const targetId = mapped ?? explicitId ?? null;
    if (targetId) {
      const version =
        kind === "event"
          ? await targetVersion("event", targetId)
          : await targetVersion(kind, targetId);
      if (version === null)
        return status("stale", "review", "Selected import target is unavailable");
      return {
        status: null,
        action: kind === "event" ? "attach" : "update",
        targetId,
        expectedVersion: version,
        errors: [],
      };
    }
    if (company && !externalId && (await candidateCount(kind, values)).length > 0)
      return status(
        "ambiguous",
        "review",
        "Existing company or contact requires an explicit existing ID or skip",
      );
    if (kind === "event" && !externalId && input.campaignId) {
      const existing = await query<{ id: string }>(
        "select id from campaign_members where campaign_id=$1 and lower(coalesce(raw_email,''))=lower($2) and lower(coalesce(raw_company_name,''))=lower($3) limit 1",
        [input.campaignId, text(values, "email"), company],
      );
      if (existing.length)
        return status("ambiguous", "review", "Existing attendee requires an external ID or skip");
    }
    return { status: null, action: "create", errors: [] };
  },

  async applyRow(context, kind, values, prepared, db) {
    const externalId = text(values, "external_id");
    const namespace = identityNamespace(kind, prepared.sourceNamespace, prepared.campaignId);
    const resourceType = kindResource(kind);
    if (externalId && namespace) {
      await db.query("select pg_advisory_xact_lock(hashtext($1))", [
        namespace + ":" + resourceType + ":" + externalId,
      ]);
      const mapped = await mappedIdentity(namespace, resourceType, externalId, db);
      if (mapped) {
        if (prepared.targetId && prepared.targetId !== mapped)
          throw new ImportRowError("ambiguous", "IDENTITY_CONFLICT", "External ID target changed");
        if (kind === "event" || prepared.action === "create")
          return { action: "skipped", id: mapped };
      }
    }
    if (kind === "lead") {
      const targetId = prepared.targetId;
      const found = targetId
        ? (
            await db.query<
              Versioned & {
                contact_name: string | null;
                contact_phone: string | null;
                enquiry_text: string | null;
              }
            >(
              "select id,row_version,contact_name,contact_phone,enquiry_text from leads where id=$1 for update",
              [targetId],
            )
          ).rows[0]
        : null;
      if (targetId && !found) throw new ImportRowError("stale", "TARGET_MISSING", "Lead changed");
      if (found && found.row_version !== prepared.expectedVersion)
        throw new ImportRowError("stale", "VERSION_CHANGED", "Lead changed after preview");
      const effects: ImportWriteEffect[] = found
        ? [
            { capability: "leads.view", resource: { type: "lead", id: found.id } },
            { capability: "leads.update", resource: { type: "lead", id: found.id } },
          ]
        : [{ capability: "leads.create" }];
      if (!(await authorizeImportRow(context, { effects }, db)).allowed)
        throw new ImportRowError("forbidden", "FORBIDDEN", "Lead write is outside scope");
      let id: string;
      let action: string;
      if (found) {
        const fills = ["contact_name", "contact_phone", "enquiry_text"].filter(
          (field) => !found[field as keyof typeof found] && text(values, field),
        );
        if (!fills.length) {
          id = found.id;
          action = "skipped";
        } else {
          const assignments = fills.map((field, index) => `${field}=$${index + 2}`).join(",");
          await db.query(`update leads set ${assignments} where id=$1`, [
            found.id,
            ...fills.map((field) => text(values, field)),
          ]);
          id = found.id;
          action = "updated";
        }
      } else {
        const ownerEmail = text(values, "owner_email");
        const owner = ownerEmail
          ? (
              await db.query<{ id: string }>(
                "select id from profiles where lower(email)=lower($1) and status='active'",
                [ownerEmail],
              )
            ).rows[0]
          : null;
        if (ownerEmail && !owner)
          throw new ImportRowError("stale", "OWNER_MISSING", "Owner changed after preview");
        const created = (
          await db.query<{ id: string }>(
            `insert into leads(company_name,contact_name,contact_email,contact_phone,enquiry_text,source,assigned_to)
           values($1,nullif($2,''),$3,nullif($4,''),nullif($5,''),'csv',$6) returning id`,
            [
              text(values, "company_name"),
              text(values, "contact_name"),
              text(values, "contact_email"),
              text(values, "contact_phone"),
              text(values, "enquiry_text"),
              owner?.id ?? null,
            ],
          )
        ).rows[0];
        id = created.id;
        action = "created";
      }
      if (externalId && namespace) {
        await db.query(
          "insert into import_identity_keys(source_namespace,resource_type,external_key,resource_id,created_by_session) values($1,'lead',$2,$3,$4) on conflict (source_namespace,resource_type,external_key) do nothing",
          [namespace, externalId, id, prepared.sessionId],
        );
      }
      return { action, id };
    }
    if (kind === "client") {
      const found = prepared.targetId
        ? (
            await db.query<Versioned & { industry: string | null; tier: string | null }>(
              "select id,row_version,industry,tier from clients where id=$1 for update",
              [prepared.targetId],
            )
          ).rows[0]
        : null;
      if (prepared.targetId && !found)
        throw new ImportRowError("stale", "TARGET_MISSING", "Client changed");
      if (found && found.row_version !== prepared.expectedVersion)
        throw new ImportRowError("stale", "VERSION_CHANGED", "Client changed after preview");
      const contactEmail = text(values, "contact_email");
      const productName = text(values, "product_name");
      const startDate = text(values, "start_date");
      const product = productName
        ? (
            await db.query<{ id: string; default_term_months: number | null }>(
              "select id,default_term_months from products where name=$1 and active=true",
              [productName],
            )
          ).rows[0]
        : null;
      if (productName && !product)
        throw new ImportRowError("stale", "PRODUCT_MISSING", "Product changed after preview");
      const existingContact =
        found && contactEmail
          ? (
              await db.query<{ id: string }>(
                "select id from client_contacts where client_id=$1 and lower(email)=lower($2) for update",
                [found.id, contactEmail],
              )
            ).rows[0]
          : null;
      const existingEngagement =
        found && product && startDate
          ? (
              await db.query<{ id: string }>(
                "select id from engagements where client_id=$1 and product_id=$2 and start_date=$3 for update",
                [found.id, product.id, startDate],
              )
            ).rows[0]
          : null;
      const effects: ImportWriteEffect[] = found
        ? [{ capability: "accounts.view", resource: { type: "client", id: found.id } }]
        : [{ capability: "accounts.create" }];
      if (found && (text(values, "industry") || text(values, "tier")))
        effects.push({ capability: "accounts.update", resource: { type: "client", id: found.id } });
      if (contactEmail && !existingContact)
        effects.push({
          capability: "contacts.create",
          ...(found ? { resource: { type: "client" as const, id: found.id } } : {}),
        });
      if (product && startDate && !existingEngagement)
        effects.push({
          capability: "engagements.create",
          ...(found ? { resource: { type: "client" as const, id: found.id } } : {}),
        });
      if (!(await authorizeImportRow(context, { effects }, db)).allowed)
        throw new ImportRowError("forbidden", "FORBIDDEN", "Client write is outside scope");
      let id = found?.id;
      let action = "skipped";
      if (!id) {
        id = (
          await db.query<{ id: string }>(
            "insert into clients(company_name,industry,tier) values($1,nullif($2,''),nullif($3,'')) returning id",
            [text(values, "company_name"), text(values, "industry"), text(values, "tier")],
          )
        ).rows[0].id;
        action = "created";
      } else if (
        (text(values, "industry") && text(values, "industry") !== found?.industry) ||
        (text(values, "tier") && text(values, "tier") !== found?.tier)
      ) {
        await db.query(
          "update clients set industry=coalesce(nullif($2,''),industry),tier=coalesce(nullif($3,''),tier) where id=$1",
          [id, text(values, "industry"), text(values, "tier")],
        );
        action = "updated";
      }
      if (contactEmail && !existingContact) {
        await db.query("insert into client_contacts(client_id,name,email) values($1,$2,$3)", [
          id,
          text(values, "contact_name") || "Unnamed",
          contactEmail,
        ]);
        if (action === "skipped") action = "updated";
      }
      if (product && startDate && !existingEngagement) {
        const ownerEmail = text(values, "owner_email");
        const owner = ownerEmail
          ? (
              await db.query<{ id: string }>(
                "select id from profiles where lower(email)=lower($1) and status='active'",
                [ownerEmail],
              )
            ).rows[0]
          : null;
        if (ownerEmail && !owner)
          throw new ImportRowError("stale", "OWNER_MISSING", "Owner changed after preview");
        const months = product.default_term_months ?? 12;
        const period = ["monthly", "quarterly", "annual"].includes(text(values, "billing_period"))
          ? text(values, "billing_period")
          : "monthly";
        await db.query(
          `insert into engagements(client_id,product_id,owner,value,billing_period,start_date,renewal_date)
           values($1,$2,$3,$4,$5,$6,$7)`,
          [
            id,
            product.id,
            owner?.id ?? null,
            text(values, "value") || null,
            period,
            startDate,
            addMonthsToDateString(startDate, months),
          ],
        );
        if (action === "skipped") action = "updated";
      }
      if (externalId && namespace)
        await db.query(
          "insert into import_identity_keys(source_namespace,resource_type,external_key,resource_id,created_by_session) values($1,'client',$2,$3,$4) on conflict (source_namespace,resource_type,external_key) do nothing",
          [namespace, externalId, id, prepared.sessionId],
        );
      return { action, id };
    }
    const campaignId = prepared.campaignId;
    if (!campaignId)
      throw new ImportRowError("invalid", "CAMPAIGN_MISSING", "Campaign ID is required");
    const existingAccount = prepared.targetId
      ? (
          await db.query<Versioned>("select id,row_version from accounts where id=$1 for update", [
            prepared.targetId,
          ])
        ).rows[0]
      : null;
    if (prepared.targetId && !existingAccount)
      throw new ImportRowError("stale", "ACCOUNT_MISSING", "Account changed");
    if (existingAccount && existingAccount.row_version !== prepared.expectedVersion)
      throw new ImportRowError("stale", "VERSION_CHANGED", "Account changed after preview");
    const company = text(values, "company_name");
    if (!existingAccount && company) {
      const candidate = (
        await db.query<{ id: string }>(
          "select id from accounts where lower(name)=lower($1) limit 1 for share",
          [company],
        )
      ).rows[0];
      if (candidate)
        throw new ImportRowError(
          "ambiguous",
          "ACCOUNT_MATCH",
          "Existing account requires explicit ID",
        );
    }
    const effects: ImportWriteEffect[] = [
      { capability: "campaigns.manage", resource: { type: "campaign", id: campaignId } },
      { capability: "engagements.create", resource: { type: "campaign", id: campaignId } },
    ];
    if (existingAccount)
      effects.push({
        capability: "accounts.view",
        resource: { type: "account", id: existingAccount.id },
      });
    else if (company) effects.push({ capability: "accounts.create" });
    if (text(values, "contact_name") && !text(values, "contact_id"))
      effects.push({
        capability: "contacts.create",
        ...(existingAccount
          ? { resource: { type: "account" as const, id: existingAccount.id } }
          : {}),
      });
    if (!(await authorizeImportRow(context, { effects }, db)).allowed)
      throw new ImportRowError("forbidden", "FORBIDDEN", "Event write is outside scope");
    let accountId = existingAccount?.id ?? null;
    if (!accountId && company) {
      try {
        accountId = (
          await db.query<{ id: string }>(
            "insert into accounts(name,lifecycle_stage,account_owner,source) values($1,'prospect',$2,'event') returning id",
            [company, context.actor.profileId],
          )
        ).rows[0].id;
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "23505")
          throw new ImportRowError(
            "ambiguous",
            "ACCOUNT_MATCH",
            "Existing account requires explicit ID",
          );
        throw error;
      }
    }
    let contactId: string | null = null;
    if (accountId && text(values, "contact_name")) {
      const explicitContactId = text(values, "contact_id");
      if (explicitContactId) {
        if (!UUID.test(explicitContactId))
          throw new ImportRowError("invalid", "CONTACT_ID", "Contact ID is invalid");
        const contact = (
          await db.query<{ id: string }>(
            "select id from account_contacts where id=$1 and account_id=$2 for share",
            [explicitContactId, accountId],
          )
        ).rows[0];
        if (!contact) throw new ImportRowError("stale", "CONTACT_MISSING", "Contact changed");
        if (
          !(
            await authorizeImportRow(
              context,
              {
                effects: [
                  {
                    capability: "contacts.view",
                    resource: { type: "account_contact", id: contact.id },
                  },
                ],
              },
              db,
            )
          ).allowed
        )
          throw new ImportRowError("forbidden", "FORBIDDEN", "Contact is outside scope");
        contactId = contact.id;
      } else {
        const email = text(values, "email");
        if (email) {
          const matched = (
            await db.query<{ id: string }>(
              "select id from account_contacts where account_id=$1 and lower(email)=lower($2) limit 1 for share",
              [accountId, email],
            )
          ).rows[0];
          if (matched)
            throw new ImportRowError(
              "ambiguous",
              "CONTACT_MATCH",
              "Existing contact requires explicit ID",
            );
        }
        contactId = (
          await db.query<{ id: string }>(
            `insert into account_contacts(account_id,name,email,phone,relationship_role,preferred_channel)
           values($1,$2,nullif($3,''),nullif($4,''),'event_attendee',$5) returning id`,
            [
              accountId,
              text(values, "contact_name"),
              email,
              text(values, "phone"),
              email ? "email" : "unknown",
            ],
          )
        ).rows[0].id;
      }
    }
    const memberId = (
      await db.query<{ id: string }>(
        `insert into campaign_members(campaign_id,account_id,contact_id,raw_company_name,
         raw_contact_name,raw_email,raw_phone,attendee_status,interests,follow_up_owner,notes)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
        [
          campaignId,
          accountId,
          contactId,
          company,
          text(values, "contact_name"),
          text(values, "email"),
          text(values, "phone"),
          text(values, "attendee_status") || "attended",
          text(values, "interests")
            .split(";")
            .map((s) => s.trim())
            .filter(Boolean),
          context.actor.profileId,
          text(values, "notes"),
        ],
      )
    ).rows[0].id;
    if (externalId && namespace)
      await db.query(
        "insert into import_identity_keys(source_namespace,resource_type,external_key,resource_id,created_by_session) values($1,'campaign_member',$2,$3,$4) on conflict (source_namespace,resource_type,external_key) do nothing",
        [namespace, externalId, memberId, prepared.sessionId],
      );
    return { action: "created", id: memberId };
  },
};
