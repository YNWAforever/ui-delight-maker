import { z } from "zod";
import type { WfmQueryable as Queryable } from "./db-types.server";
import type { WfmObject } from "./http.server";
import { WFM_PLAN, type WfmResourceType } from "./plan.server";
import { wfmNamespace } from "./oauth.server";
import { currencyValue, decimalText, decimalUnits, uuidKey } from "./values.server";
import { includedWfmObjects, WFM_CHILD_TYPES } from "./children.server";

export const WFM_RECON_TYPES = [
  ...WFM_PLAN.map((step) => step.type),
  "account",
  ...WFM_CHILD_TYPES,
];

const decimalSchema = z.string().refine((value) => {
  try {
    decimalUnits(value);
    return true;
  } catch {
    return false;
  }
}, "Invalid decimal");
const currencyTotals = z.record(
  z.string(),
  z.object({ total: decimalSchema, paid: decimalSchema }),
);
export const snapshotSchema = z.object({
  version: z.literal(1),
  sourceNamespace: z.string().regex(/^workflowmax:[a-zA-Z0-9-]+$/),
  mode: z.enum(["full", "incremental"]),
  complete: z.boolean(),
  startedAt: z.string().datetime(),
  capturedAt: z.string().datetime(),
  runId: z.uuid().optional(),
  resources: z.record(z.string(), z.array(z.string())),
  // Optional so version-1 snapshots captured before shared contacts still parse.
  contactClientLinks: z.record(z.string(), z.array(z.string())).optional(),
  invoiceTotals: currencyTotals,
  timesheetMinutes: decimalSchema,
  issues: z.array(z.string()),
});
export type WfmSnapshot = z.infer<typeof snapshotSchema>;

/** Build expected evidence from fetched source rows, before any database write. */
export class WfmSourceSnapshot {
  readonly value: WfmSnapshot;
  private readonly keys = new Map<string, Set<string>>();
  constructor(
    namespace: string,
    incremental = false,
    private readonly currency?: string,
  ) {
    if (namespace !== wfmNamespace(namespace.replace(/^workflowmax:/, "")))
      throw new Error("Invalid namespace");
    this.value = {
      version: 1,
      sourceNamespace: namespace,
      mode: incremental ? "incremental" : "full",
      complete: false,
      startedAt: new Date().toISOString(),
      capturedAt: new Date().toISOString(),
      resources: Object.fromEntries(WFM_RECON_TYPES.map((type) => [type, []])),
      contactClientLinks: {},
      invoiceTotals: {},
      timesheetMinutes: "0",
      issues: [],
    };
  }
  add(type: WfmResourceType, row: WfmObject) {
    const key = uuidKey(row);
    this.addKey(type, key);
    if (type === "client") this.addKey("account", key);
    for (const child of includedWfmObjects(type, row)) {
      if (!child.row.uuid) this.value.issues.push(`${type}:${key}:unkeyed_${child.type}`);
      else {
        const childKey = uuidKey(child.row);
        this.addKey(child.type, childKey);
        if (child.type === "account_contact") {
          const links = (this.value.contactClientLinks ??= {});
          const clients = (links[childKey] ??= []);
          if (!clients.includes(key)) clients.push(key);
        }
      }
    }
    if (type === "invoice") {
      const currency = currencyValue(row, this.currency) ?? "unknown";
      if (currency === "unknown") this.value.issues.push(`invoice:${key}:unknown_currency`);
      const totals = this.value.invoiceTotals[currency] ?? { total: "0", paid: "0" };
      for (const [field, source] of [
        ["total", "amountIncTax"],
        ["paid", "amountPaid"],
      ] as const) {
        if (row[source] == null) this.value.issues.push(`invoice:${key}:missing_${source}`);
        else totals[field] = decimalText(decimalUnits(totals[field]) + decimalUnits(row[source]));
      }
      this.value.invoiceTotals[currency] = totals;
    } else if (type === "timesheet") {
      if (row.time == null) this.value.issues.push(`timesheet:${key}:missing_time`);
      else
        this.value.timesheetMinutes = decimalText(
          decimalUnits(this.value.timesheetMinutes) + decimalUnits(row.time),
        );
    }
  }
  private addKey(type: string, key: string) {
    const keys = this.keys.get(type) ?? new Set<string>();
    if (keys.has(key)) {
      // A contact can be included by multiple clients, or repeated by one client.
      if (type === "account_contact") return;
      throw new Error("DUPLICATE_SOURCE_UUID");
    }
    keys.add(key);
    this.keys.set(type, keys);
    this.value.resources[type].push(key);
  }
  finish(complete: boolean, runId?: string): WfmSnapshot {
    this.value.complete = complete;
    this.value.capturedAt = new Date().toISOString();
    this.value.runId = runId;
    return this.value;
  }
}

export type ReconThresholds = { count?: number; amount?: string; hours?: string };

export async function reconcileWfm(
  db: Queryable,
  input: unknown,
  thresholds: ReconThresholds = {},
) {
  const source = snapshotSchema.parse(input);
  if (!source.complete || source.mode !== "full")
    throw new Error("Reconciliation requires a complete full-source snapshot");
  const countThreshold = thresholds.count ?? 0;
  const amountThreshold = decimalUnits(thresholds.amount ?? "0");
  const minutesThreshold = decimalUnits(thresholds.hours ?? "0") * 60n;
  if (
    !Number.isSafeInteger(countThreshold) ||
    countThreshold < 0 ||
    amountThreshold < 0n ||
    minutesThreshold < 0n
  )
    throw new Error("Reconciliation thresholds must be nonnegative");
  const issues = [...source.issues];
  if (source.runId) {
    const run = (
      await db.query<{ state: string; source_namespace: string; mode: string }>(
        "select state,source_namespace,mode from wfm_import_runs where id=$1",
        [source.runId],
      )
    ).rows[0];
    if (
      !run ||
      run.state !== "completed" ||
      run.mode !== "full" ||
      run.source_namespace !== source.sourceNamespace
    )
      issues.push("source_import_run_not_completed_for_namespace");
  }
  const keys = (
    await db.query<{ resource_type: string; external_key: string }>(
      `select r.resource_type,r.external_key from wfm_raw_objects r
     where r.source_namespace=$1 and
       (r.resource_type not in ('invoice','timesheet','invoice_payment','staff_map','project','account','account_contact','invoice_line_item')
        or (r.resource_type='invoice' and exists(select 1 from wfm_invoices i where i.id=r.id and i.source_namespace=r.source_namespace))
        or (r.resource_type='timesheet' and exists(select 1 from wfm_timesheets t where t.id=r.id and t.source_namespace=r.source_namespace))
        or (r.resource_type='invoice_payment' and exists(select 1 from wfm_invoice_payments p where p.id=r.id and p.source_namespace=r.source_namespace))
        or (r.resource_type='staff_map' and exists(select 1 from wfm_staff_map s where s.id=r.id and s.source_namespace=r.source_namespace))
        or (r.resource_type='project' and exists(select 1 from projects p where p.id=r.id))
        or (r.resource_type='account' and exists(select 1 from accounts a where a.id=r.id))
        or (r.resource_type='account_contact' and exists(select 1 from account_contacts c where c.id=r.id))
        or (r.resource_type='invoice_line_item' and exists(select 1 from wfm_invoice_line_items l where l.id=r.id and l.source_namespace=r.source_namespace)))`,
      [source.sourceNamespace],
    )
  ).rows;
  const counts = WFM_RECON_TYPES.map((type) => {
    const sourceKeys = source.resources[type];
    if (!sourceKeys) throw new Error(`Snapshot missing resource: ${type}`);
    if (new Set(sourceKeys).size !== sourceKeys.length)
      throw new Error(`Snapshot contains duplicate UUIDs: ${type}`);
    const actual = new Set(
      keys.filter((row) => row.resource_type === type).map((row) => row.external_key),
    );
    const expected = new Set(sourceKeys);
    const missing = sourceKeys.filter((key) => !actual.has(key));
    const extra = [...actual].filter((key) => !expected.has(key));
    return {
      resource: type,
      wfm: expected.size,
      db: actual.size,
      missing: missing.slice(0, 100),
      extra: extra.slice(0, 100),
      missingCount: missing.length,
      extraCount: extra.length,
      ok: Math.max(missing.length, extra.length) <= countThreshold,
    };
  });
  if (source.contactClientLinks) {
    const expected = new Set(
      Object.entries(source.contactClientLinks).flatMap(([contact, clients]) =>
        clients.map((client) => JSON.stringify([contact, client])),
      ),
    );
    const links = (
      await db.query<{ contact_key: string; client_key: string | null }>(
        `select c.external_key as contact_key,a.external_key as client_key
         from account_contact_links l
         join wfm_raw_objects c on c.id=l.contact_id and c.resource_type='account_contact'
         left join wfm_raw_objects a on a.id=l.account_id and a.resource_type='account'
           and a.source_namespace=c.source_namespace
         where c.source_namespace=$1`,
        [source.sourceNamespace],
      )
    ).rows;
    if (links.some((link) => link.client_key === null))
      issues.push("account_contact_links:invalid_account_namespace");
    const actual = new Set(
      links
        .filter((link) => link.client_key !== null)
        .map((link) => JSON.stringify([link.contact_key, link.client_key])),
    );
    const missing = [...expected].filter((key) => !actual.has(key));
    const extra = [...actual].filter((key) => !expected.has(key));
    counts.push({
      resource: "account_contact_link",
      wfm: expected.size,
      db: actual.size,
      missing: missing.slice(0, 100),
      extra: extra.slice(0, 100),
      missingCount: missing.length,
      extraCount: extra.length,
      ok: Math.max(missing.length, extra.length) <= countThreshold,
    });
  }
  const invoiceRows = (
    await db.query<{ currency: string; total: string; paid: string; missing: number }>(
      `select coalesce(currency,'unknown') as currency,coalesce(sum(total),0)::text as total,
       coalesce(sum(paid),0)::text as paid,count(*) filter(where total is null or paid is null or currency is null)::int as missing
     from wfm_invoices where source_namespace=$1 group by currency`,
      [source.sourceNamespace],
    )
  ).rows;
  const currencies = new Set([
    ...Object.keys(source.invoiceTotals),
    ...invoiceRows.map((row) => row.currency),
  ]);
  const invoiceTotals = [...currencies].sort().flatMap((currency) => {
    const actual = invoiceRows.find((row) => row.currency === currency);
    if (actual?.missing) issues.push(`invoice:${currency}:missing_values_in_db`);
    return (["total", "paid"] as const).map((field) => {
      const expected = source.invoiceTotals[currency]?.[field] ?? "0";
      const value = actual?.[field] ?? "0";
      const diff = decimalUnits(value) - decimalUnits(expected);
      return {
        currency,
        field,
        wfm: expected,
        db: value,
        difference: decimalText(diff),
        ok: abs(diff) <= amountThreshold,
      };
    });
  });
  const time = (
    await db.query<{ minutes: string; missing: number }>(
      `select coalesce(sum(minutes),0)::text as minutes,count(*) filter(where minutes is null)::int as missing
     from wfm_timesheets where source_namespace=$1`,
      [source.sourceNamespace],
    )
  ).rows[0];
  if (time.missing) issues.push("timesheet:missing_minutes_in_db");
  const diff = decimalUnits(time.minutes) - decimalUnits(source.timesheetMinutes);
  const timesheets = {
    wfmMinutes: source.timesheetMinutes,
    dbMinutes: time.minutes,
    differenceMinutes: decimalText(diff),
    wfmHours: decimalText(decimalUnits(source.timesheetMinutes) / 60n),
    dbHours: decimalText(decimalUnits(time.minutes) / 60n),
    ok: abs(diff) <= minutesThreshold,
  };
  return {
    sourceNamespace: source.sourceNamespace,
    counts,
    invoiceTotals,
    timesheets,
    issues,
    ok:
      issues.length === 0 &&
      counts.every((row) => row.ok) &&
      invoiceTotals.every((row) => row.ok) &&
      timesheets.ok,
  };
}
function abs(value: bigint) {
  return value < 0n ? -value : value;
}
