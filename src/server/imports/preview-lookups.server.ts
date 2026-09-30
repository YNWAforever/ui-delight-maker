import type { ImportRow } from "@/lib/csv-import";
import { query } from "@/server/db/neon.server";
import type { ImportKind } from "./import-session.server";

export type PreviewLookups = {
  owners: Set<string>;
  products: Set<string>;
  identities: Map<string, string>;
  versions: Map<string, number>;
  candidates: Set<string>;
  attendees: Set<string>;
};
export const previewPairKey = (company: string, email: string) => JSON.stringify([company, email]);
const text = (row: ImportRow, key: string) => (row[key] ?? "").trim();
const unique = (values: string[]) => [...new Set(values.filter(Boolean))];
type Pair = { company: string; email: string };

/** One CSV request, at most 5,000 rows. SQL retains the existing matching rules.
 * This cache is never shared across requests or consulted by applyRow. */
export async function loadPreviewLookups(
  kind: ImportKind,
  rows: ImportRow[],
  input: { namespace: string | null; campaignId: string | null; explicitIds: string[] },
): Promise<PreviewLookups> {
  const lookups: PreviewLookups = {
    owners: new Set(),
    products: new Set(),
    identities: new Map(),
    versions: new Map(),
    candidates: new Set(),
    attendees: new Set(),
  };
  const owners = unique(rows.map((row) => text(row, "owner_email")));
  const products = kind === "client" ? unique(rows.map((row) => text(row, "product_name"))) : [];
  const externalIds = unique(rows.map((row) => text(row, "external_id")));
  const pairs = [
    ...new Map(
      rows
        .filter((row) => !text(row, "external_id"))
        .map((row) => {
          const company = text(row, "company_name");
          const email = text(row, kind === "lead" ? "contact_email" : "email");
          return [previewPairKey(company, email), { company, email }] as const;
        }),
    ).values(),
  ];
  await Promise.all([
    owners.length
      ? (async () => {
          const result = await query<{ email: string }>(
            "select x.email from unnest($1::text[]) as x(email) where exists (select 1 from profiles p where lower(p.email)=lower(x.email) and p.status='active')",
            [owners],
          );
          lookups.owners = new Set(result.map((row) => row.email));
        })()
      : undefined,
    products.length
      ? (async () => {
          const result = await query<{ name: string }>(
            "select name from products where name=any($1::text[]) and active=true",
            [products],
          );
          lookups.products = new Set(result.map((row) => row.name));
        })()
      : undefined,
    input.namespace && externalIds.length
      ? (async () => {
          const result = await query<{ external_key: string; resource_id: string }>(
            "select external_key,resource_id from import_identity_keys where source_namespace=$1 and resource_type=$2 and external_key=any($3::text[])",
            [input.namespace, kind === "event" ? "campaign_member" : kind, externalIds],
          );
          lookups.identities = new Map(result.map((row) => [row.external_key, row.resource_id]));
        })()
      : undefined,
    pairs.length
      ? (async () => {
          const comparison =
            kind === "lead"
              ? "trim(lower(t.company_name))=trim(lower(x.company)) and trim(lower(coalesce(t.contact_email,'')))=trim(lower(x.email))"
              : kind === "client"
                ? "trim(lower(t.company_name))=trim(lower(x.company))"
                : "lower(t.name)=lower(x.company)";
          const table = kind === "lead" ? "leads" : kind === "client" ? "clients" : "accounts";
          const result = await query<Pair>(
            `select x.company,x.email from jsonb_to_recordset($1::jsonb) as x(company text,email text)
         where x.company<>'' and exists (select 1 from ${table} t where ${comparison})`,
            [JSON.stringify(pairs)],
          );
          lookups.candidates = new Set(
            result.map((row) => previewPairKey(row.company, kind === "lead" ? row.email : "")),
          );
        })()
      : undefined,
    kind === "event" && input.campaignId && pairs.length
      ? (async () => {
          const result = await query<Pair>(
            `select x.company,x.email from jsonb_to_recordset($1::jsonb) as x(company text,email text)
         where exists (select 1 from campaign_members m where m.campaign_id=$2
           and lower(coalesce(m.raw_email,''))=lower(x.email)
           and lower(coalesce(m.raw_company_name,''))=lower(x.company))`,
            [JSON.stringify(pairs), input.campaignId],
          );
          lookups.attendees = new Set(result.map((row) => previewPairKey(row.company, row.email)));
        })()
      : undefined,
  ]);
  // Event identity targets are campaign members, not accounts. They are skipped.
  const ids = unique([
    ...input.explicitIds,
    ...(kind === "event" ? [] : lookups.identities.values()),
  ]);
  if (ids.length) {
    const table = kind === "lead" ? "leads" : kind === "client" ? "clients" : "accounts";
    const result = await query<{ id: string; row_version: number }>(
      `select id,row_version from ${table} where id=any($1::uuid[])`,
      [ids],
    );
    lookups.versions = new Map(result.map((row) => [row.id, row.row_version]));
  }
  return lookups;
}
