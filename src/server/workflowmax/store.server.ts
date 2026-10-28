import { randomUUID } from "node:crypto";
import { includedWfmObjects } from "./children.server";
import type { WfmQueryable as Queryable } from "./db-types.server";
import type { WfmObject } from "./http.server";
import type { WfmStoredType } from "./plan.server";
import {
  currencyValue,
  dateValue,
  decimalValue,
  object,
  textValue,
  uuidKey,
} from "./values.server";

export type WfmConnection = Queryable & { release(): void };
export type WfmDatabase = { connect(): Promise<WfmConnection> };

/** Atomic identity reservation: a concurrent retry returns the original resource ID. */
export async function upsertWfmIdentity(
  db: Queryable,
  namespace: string,
  type: WfmStoredType,
  key: string,
) {
  const result = await db.query<{ resource_id: string; created: boolean }>(
    `insert into import_identity_keys(source_namespace,resource_type,external_key,resource_id)
     values($1,$2,$3,$4) on conflict(source_namespace,resource_type,external_key)
     do update set external_key=excluded.external_key
     returning resource_id,(xmax=0) as created`,
    [namespace, type, key, randomUUID()],
  );
  return result.rows[0];
}

async function findIdentity(db: Queryable, namespace: string, type: string, key: unknown) {
  if (!key) return null;
  return (
    (
      await db.query<{ resource_id: string }>(
        "select resource_id from import_identity_keys where source_namespace=$1 and resource_type=$2 and external_key=$3",
        [namespace, type, key],
      )
    ).rows[0]?.resource_id ?? null
  );
}

export class WfmHistoryStore {
  private constructor(
    private readonly db: WfmConnection,
    readonly namespace: string,
    readonly runId: string,
    private readonly currency?: string,
  ) {}

  static async open(
    pool: WfmDatabase,
    namespace: string,
    updatedSince?: string,
    currency?: string,
  ) {
    const db = await pool.connect();
    try {
      // A session lock prevents two import processes from racing this org's projections.
      await db.query("select pg_advisory_lock(hashtextextended($1,0))", [namespace]);
      const result = await db.query<{ id: string }>(
        `insert into wfm_import_runs(source_namespace,mode,updated_since) values($1,$2,$3) returning id`,
        [namespace, updatedSince ? "incremental" : "full", updatedSince ?? null],
      );
      return new WfmHistoryStore(db, namespace, result.rows[0].id, currency);
    } catch (error) {
      try {
        await db.query("select pg_advisory_unlock(hashtextextended($1,0))", [namespace]);
      } finally {
        db.release();
      }
      throw error;
    }
  }

  async close(succeeded: boolean) {
    try {
      await this.db.query("update wfm_import_runs set state=$2,completed_at=now() where id=$1", [
        this.runId,
        succeeded ? "completed" : "failed",
      ]);
    } finally {
      try {
        await this.db.query("select pg_advisory_unlock(hashtextextended($1,0))", [this.namespace]);
      } finally {
        this.db.release();
      }
    }
  }

  async upsert(type: WfmStoredType, row: WfmObject) {
    const key = uuidKey(row);
    await this.db.query("begin");
    try {
      const result = await this.write(type, row);
      await this.db.query("commit");
      return result;
    } catch (error) {
      await this.db.query("rollback");
      // Safe code only: PostgreSQL details may contain full source values.
      await this.recordFailure(type, key, error);
      throw error;
    }
  }

  async recordFailure(type: WfmStoredType, key: string, error: unknown) {
    const code = object(error).code;
    const message = error instanceof Error ? error.message : "";
    const safeCode =
      typeof code === "string" && /^[A-Z0-9]{5}$/.test(code)
        ? `WFM_DB_${code}`
        : /^[A-Z][A-Z_]+$/.test(message)
          ? message
          : "WFM_ROW_FAILED";
    await this.receipt(type, key, null, "failed", safeCode);
  }

  private async receipt(
    type: WfmStoredType,
    key: string,
    id: string | null,
    action: "created" | "updated" | "failed",
    errorCode?: string,
  ) {
    await this.db.query(
      `insert into wfm_import_receipts(run_id,source_namespace,resource_type,external_key,resource_id,status,action,error_code)
       values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(run_id,resource_type,external_key)
       do update set resource_id=excluded.resource_id,status=excluded.status,action=excluded.action,
         error_code=excluded.error_code,processed_at=now()`,
      [
        this.runId,
        this.namespace,
        type,
        key,
        id,
        action === "failed" ? "failed" : "succeeded",
        action,
        action === "failed" ? (errorCode ?? "WFM_ROW_FAILED") : null,
      ],
    );
  }

  private async write(
    type: WfmStoredType,
    row: WfmObject,
  ): Promise<{ id: string; action: "created" | "updated" }> {
    const key = uuidKey(row);
    const identity = await upsertWfmIdentity(this.db, this.namespace, type, key);
    const id = identity.resource_id;
    const action = identity.created ? "created" : "updated";
    const stored = await this.db.query(
      `insert into wfm_raw_objects(id,source_namespace,resource_type,external_key,payload)
       values($1,$2,$3,$4,$5::jsonb) on conflict(id) do update set payload=excluded.payload,pulled_at=now()
       where wfm_raw_objects.source_namespace=excluded.source_namespace
         and wfm_raw_objects.resource_type=excluded.resource_type and wfm_raw_objects.external_key=excluded.external_key
       returning id`,
      [id, this.namespace, type, key, JSON.stringify(row)],
    );
    if (!stored.rows.length) throw new Error("WFM_IDENTITY_TARGET_COLLISION");
    await this.project(type, id, row);
    for (const child of includedWfmObjects(type, row)) {
      if (child.row.uuid) await this.write(child.type, child.row);
    }
    await this.receipt(type, key, id, action);
    return { id, action };
  }

  private async project(type: WfmStoredType, id: string, row: WfmObject) {
    const db = this.db;
    const ns = this.namespace;
    const key = row.uuid;
    const raw = JSON.stringify(row);
    const lookup = (type: string, key: unknown) => findIdentity(db, ns, type, key);
    if (type === "client") {
      // WFM clients provide account identity. Commercial client/lead promotion is a stub.
      await this.write("account", row);
    } else if (type === "account") {
      const name = textValue(row.name);
      if (!name) throw new Error("WFM_CLIENT_NAME_REQUIRED");
      await db.query(
        `insert into accounts(id,name,source) values($1,$2,'workflowmax') on conflict(id)
         do update set name=excluded.name,updated_at=now()`,
        [id, name],
      );
    } else if (type === "account_contact") {
      const account = await lookup("account", row.clientUUID);
      const name = [row.firstName, row.lastName].filter(Boolean).join(" ").trim();
      if (!account || !name) throw new Error("WFM_CONTACT_CONTEXT_REQUIRED");
      const details = object(row.contactDetails);
      const result = await db.query(
        `insert into account_contacts(id,account_id,name,email,phone) values($1,$2,$3,$4,$5)
         on conflict(id) do update set name=excluded.name,email=excluded.email,phone=excluded.phone,updated_at=now()
         where account_contacts.account_id=excluded.account_id returning id`,
        [id, account, name, textValue(details.email), textValue(details.phone)],
      );
      if (!result.rows.length) throw new Error("WFM_CONTACT_ACCOUNT_COLLISION");
    } else if (type === "project") {
      const account = await lookup("account", row.clientUUID);
      if (row.clientUUID && !account) throw new Error("WFM_PROJECT_CLIENT_NOT_IMPORTED");
      const name = textValue(row.name);
      if (!name) throw new Error("WFM_JOB_NAME_REQUIRED");
      // Only directly equivalent statuses are mapped. Other WFM states remain in raw.
      const status =
        row.status === "completed"
          ? "completed"
          : row.status === "cancelled"
            ? "cancelled"
            : "not_started";
      await db.query(
        `insert into projects(id,account_id,name,status) values($1,$2,$3,$4) on conflict(id)
         do update set account_id=excluded.account_id,name=excluded.name,status=excluded.status,updated_at=now()`,
        [id, account, name, status],
      );
    } else if (type === "staff_map") {
      await db
        .query(
          `insert into wfm_staff_map(wfm_staff_id,id,source_namespace,email,raw) values($1,$2,$3,$4,$5::jsonb)
         on conflict(wfm_staff_id) do update set email=excluded.email,raw=excluded.raw,updated_at=now()
         where wfm_staff_map.source_namespace=excluded.source_namespace returning id`,
          [key, id, ns, textValue(object(row.contactDetails).email), raw],
        )
        .then((result) => {
          if (!result.rows.length) throw new Error("WFM_STAFF_ORG_COLLISION");
        });
    } else if (type === "invoice") {
      const jobs = Array.isArray(row.jobs) ? row.jobs.map(object) : [];
      const project = jobs.length === 1 ? await lookup("project", jobs[0].uuid) : null;
      await db.query(
        `insert into wfm_invoices(id,source_namespace,external_key,account_id,project_id,wfm_client_id,
           number,status,invoice_date,due_date,paid_date,currency,subtotal,total,paid,raw,metadata)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb)
         on conflict(id) do update set account_id=excluded.account_id,project_id=excluded.project_id,
           wfm_client_id=excluded.wfm_client_id,number=excluded.number,status=excluded.status,
           invoice_date=excluded.invoice_date,due_date=excluded.due_date,paid_date=excluded.paid_date,
           currency=excluded.currency,subtotal=excluded.subtotal,total=excluded.total,paid=excluded.paid,
           raw=excluded.raw,metadata=excluded.metadata,updated_at=now()`,
        [
          id,
          ns,
          key,
          await lookup("account", row.clientUUID),
          project,
          textValue(row.clientUUID),
          textValue(row.invoiceNumber),
          textValue(row.status),
          dateValue(row.date),
          dateValue(row.dueDate),
          dateValue(row.datePaid),
          currencyValue(row, this.currency),
          decimalValue(row.amountExTax),
          decimalValue(row.amountIncTax),
          decimalValue(row.amountPaid),
          raw,
          JSON.stringify({
            currencySource: row.currency ? "payload" : this.currency ? "operator" : "unresolved",
          }),
        ],
      );
    } else if (type === "invoice_payment" || type === "invoice_line_item") {
      const invoice = await lookup("invoice", row.invoiceUUID);
      if (!invoice) throw new Error("WFM_INVOICE_NOT_IMPORTED");
      if (type === "invoice_payment") {
        await db.query(
          `insert into wfm_invoice_payments(id,source_namespace,external_key,invoice_id,payment_date,amount,reference,raw)
           values($1,$2,$3,$4,$5,$6,$7,$8::jsonb) on conflict(id) do update set
           invoice_id=excluded.invoice_id,payment_date=excluded.payment_date,amount=excluded.amount,reference=excluded.reference,raw=excluded.raw`,
          [
            id,
            ns,
            key,
            invoice,
            dateValue(row.date),
            decimalValue(row.amount),
            textValue(row.reference),
            raw,
          ],
        );
      } else {
        await db.query(
          `insert into wfm_invoice_line_items(id,source_namespace,external_key,invoice_id,description,quantity,amount,raw)
           values($1,$2,$3,$4,$5,$6,$7,$8::jsonb) on conflict(id) do update set
           invoice_id=excluded.invoice_id,description=excluded.description,quantity=excluded.quantity,amount=excluded.amount,raw=excluded.raw`,
          [
            id,
            ns,
            key,
            invoice,
            textValue(row.description) ?? textValue(row.name),
            decimalValue(row.quantity),
            decimalValue(row.amount),
            raw,
          ],
        );
      }
    } else if (type === "timesheet") {
      const staff = textValue(object(row.staff).uuid);
      const job = textValue(object(row.job).uuid);
      const wip = object(row.wip);
      await db.query(
        `insert into wfm_timesheets(id,source_namespace,external_key,wfm_staff_id,wfm_job_id,wfm_task_id,
           project_id,work_date,minutes,cost_amount,billable_amount,currency,raw)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb) on conflict(id) do update set
           wfm_staff_id=excluded.wfm_staff_id,wfm_job_id=excluded.wfm_job_id,wfm_task_id=excluded.wfm_task_id,
           project_id=excluded.project_id,work_date=excluded.work_date,minutes=excluded.minutes,
           cost_amount=excluded.cost_amount,billable_amount=excluded.billable_amount,currency=excluded.currency,
           raw=excluded.raw,updated_at=now()`,
        [
          id,
          ns,
          key,
          staff,
          job,
          textValue(object(row.jobTask).uuid),
          await lookup("project", job),
          dateValue(row.date),
          decimalValue(row.time),
          decimalValue(wip.costAmount),
          decimalValue(wip.chargeAmount),
          currencyValue(row, this.currency),
          raw,
        ],
      );
    }
    // Leads/quotes/tasks/settings/POs/notes are intentionally staged losslessly.
    // No accepted_at, quote version, commercial lock, or Xero evidence is invented.
  }
}
