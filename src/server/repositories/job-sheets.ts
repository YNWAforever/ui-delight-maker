import { buildDefaultPortionsFromLineItems, canAcceptJobSheet } from "@/lib/quote-to-cash";
import type { NewJobSheetPortion } from "@/lib/quote-to-cash";
import type { JobSheet, JobSheetPortion, JsonValue, QuoteLineItemRecord } from "@/lib/types";
import { query, queryOne, transaction, type Queryable } from "@/server/db/neon.server";
import { buildFilters } from "@/server/db/query-builders";
import {
  normalizePagination,
  parseCount,
  type PaginatedResult,
  type PaginationInput,
} from "@/server/repositories/pagination";

export type JobSheetFilters = {
  status?: string;
  client_id?: string;
  account_id?: string;
};

export type JobSheetPageFilters = JobSheetFilters & PaginationInput;

export type CreateJobSheetFromAcceptedQuoteInput = {
  quote_id: string;
  accepted_quote_version_id: string;
  account_id?: string | null;
  client_id?: string | null;
  contact_id?: string | null;
  sales_owner?: string | null;
  total_amount: number;
  currency: string;
  created_by?: string | null;
};

export type AcceptJobSheetInput = {
  accepted_by: string;
};

export type UpdateJobSheetXeroReferenceInput = {
  portion_id: string;
  xero_invoice_number?: string | null;
  xero_invoice_reference?: string | null;
  xero_invoice_date?: string | null;
  xero_notes?: string | null;
};

export type JobSheetDetail = {
  jobSheet: JobSheet;
  portions: JobSheetPortion[];
};

function getJobSheetOrThrow(row: JobSheet | null): JobSheet {
  if (!row) {
    throw new Error("Job sheet not found");
  }

  return row;
}

function readQuoteVersionLineItems(snapshot: JsonValue): QuoteLineItemRecord[] {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return [];
  }

  const { line_items } = snapshot as { line_items?: JsonValue };
  return Array.isArray(line_items) ? (line_items as unknown as QuoteLineItemRecord[]) : [];
}

function normalizeOptionalText(value?: string | null): string | null {
  if (typeof value !== "string") {
    return value ?? null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function listJobSheetPortions(
  jobSheetId: string,
  db?: Queryable,
): Promise<JobSheetPortion[]> {
  return query<JobSheetPortion>(
    `
      select *
      from job_sheet_portions
      where job_sheet_id = $1
      order by sort_order, created_at
    `,
    [jobSheetId],
    db,
  );
}

async function getJobSheetById(id: string, db?: Queryable): Promise<JobSheet> {
  return getJobSheetByIdWithOptions(id, db);
}

async function getJobSheetByIdWithOptions(
  id: string,
  db?: Queryable,
  options: { forUpdate?: boolean } = {},
): Promise<JobSheet> {
  return getJobSheetOrThrow(
    await queryOne<JobSheet>(
      `select * from job_sheets where id = $1${options.forUpdate ? " for update" : ""}`,
      [id],
      db,
    ),
  );
}

async function createDefaultPortionsFromAcceptedVersion(
  jobSheet: JobSheet,
  acceptedQuoteVersionId: string,
  db: Queryable,
): Promise<void> {
  const quoteVersion = await queryOne<{ id: string; snapshot: JsonValue }>(
    "select id, snapshot from quote_versions where id = $1",
    [acceptedQuoteVersionId],
    db,
  );

  if (!quoteVersion) {
    throw new Error("Quote version not found");
  }

  const defaultPortions = buildDefaultPortionsFromLineItems(
    readQuoteVersionLineItems(quoteVersion.snapshot),
    jobSheet.currency,
  );

  if (defaultPortions.length === 0) {
    return;
  }

  await replaceJobSheetPortions(jobSheet.id, defaultPortions, db);
}

export async function listJobSheets(filters: JobSheetFilters = {}): Promise<JobSheet[]> {
  const where = buildFilters([
    ["status", filters.status],
    ["client_id", filters.client_id],
    ["account_id", filters.account_id],
  ]);

  return query<JobSheet>(
    `
      select *
      from job_sheets
      ${where.sql}
      order by created_at desc
    `,
    where.values,
  );
}

export async function listJobSheetsPage(
  filters: JobSheetPageFilters = {},
): Promise<PaginatedResult<JobSheet>> {
  const where = buildFilters([
    ["status", filters.status],
    ["client_id", filters.client_id],
    ["account_id", filters.account_id],
  ]);
  const { page, limit, offset } = normalizePagination(filters);
  const [items, count] = await Promise.all([
    query<JobSheet>(
      `
        select *
        from job_sheets
        ${where.sql}
        order by created_at desc, id desc
        limit $${where.values.length + 1} offset $${where.values.length + 2}
      `,
      [...where.values, limit, offset],
    ),
    queryOne<{ total: number | string }>(
      `select count(*) as total from job_sheets ${where.sql}`,
      where.values,
    ),
  ]);

  return { items, total: parseCount(count), page, limit };
}

export async function getJobSheet(id: string): Promise<JobSheetDetail> {
  const jobSheet = await getJobSheetById(id);
  const portions = await listJobSheetPortions(id);

  return { jobSheet, portions };
}

export async function createJobSheetFromAcceptedQuote(
  input: CreateJobSheetFromAcceptedQuoteInput,
  db?: Queryable,
): Promise<JobSheet> {
  const work = async (client: Queryable) => {
    const jobSheet = await queryOne<JobSheet>(
      `
        insert into job_sheets
          (
            number,
            quote_id,
            accepted_quote_version_id,
            account_id,
            client_id,
            contact_id,
            sales_owner,
            status,
            total_amount,
            currency,
            created_by
          )
        values
          (
            'JS-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('job_sheet_number_seq')::text, 4, '0'),
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            'accounting_review',
            $7,
            $8,
            $9
          )
        on conflict (quote_id, accepted_quote_version_id)
        do update set updated_at = job_sheets.updated_at
        returning *
      `,
      [
        input.quote_id,
        input.accepted_quote_version_id,
        input.account_id ?? null,
        input.client_id ?? null,
        input.contact_id ?? null,
        input.sales_owner ?? null,
        input.total_amount,
        input.currency,
        input.created_by ?? null,
      ],
      client,
    );

    if (!jobSheet) {
      throw new Error("Failed to create job sheet");
    }

    const lockedJobSheet = await getJobSheetByIdWithOptions(jobSheet.id, client, {
      forUpdate: true,
    });
    const existingPortions = await listJobSheetPortions(lockedJobSheet.id, client);
    if (existingPortions.length === 0) {
      await createDefaultPortionsFromAcceptedVersion(
        lockedJobSheet,
        input.accepted_quote_version_id,
        client,
      );
    }

    return lockedJobSheet;
  };

  if (db) {
    return work(db);
  }

  return transaction(work);
}

export async function replaceJobSheetPortions(
  jobSheetId: string,
  portions: NewJobSheetPortion[],
  db?: Queryable,
): Promise<JobSheetPortion[]> {
  const work = async (client: Queryable) => {
    const jobSheet = await getJobSheetByIdWithOptions(jobSheetId, client, { forUpdate: true });

    if (jobSheet.status === "accepted" || jobSheet.locked_at) {
      throw new Error("Accepted job sheet commercial fields are immutable");
    }

    const existing =
      (await query<JobSheetPortion>(
        `
          /* Stable updates replace the former delete from job_sheet_portions rewrite. */
          select id, job_sheet_id, name, source_quote_line_item_ids, description,
                 amount, currency, target_invoice_date, billing_type, status,
                 xero_invoice_number, xero_invoice_reference, xero_invoice_date,
                 xero_notes, internal_note, sort_order, created_at, updated_at
          from job_sheet_portions
          where job_sheet_id = $1
          order by sort_order, created_at
          for update
        `,
        [jobSheetId],
        client,
      )) ?? [];

    const existingById = new Map(existing.map((portion) => [portion.id, portion]));
    const usedIds = new Set<string>();
    const matched = portions.map((portion) => {
      if (!portion.id) return { portion, current: null };
      const current = existingById.get(portion.id);
      if (!current) {
        throw new Error("Billing portion ID does not belong to this job sheet");
      }
      if (usedIds.has(current.id)) {
        throw new Error("Billing portion ID is duplicated in the update");
      }
      usedIds.add(current.id);
      return { portion, current };
    });
    const removed = existing.filter((portion) => !usedIds.has(portion.id));
    const hasXeroData = (portion: JobSheetPortion) =>
      portion.status === "entered_in_xero" ||
      Boolean(
        portion.xero_invoice_number ||
        portion.xero_invoice_reference ||
        portion.xero_invoice_date ||
        portion.xero_notes,
      );
    if (removed.some(hasXeroData)) {
      throw new Error("Cannot remove or replace a billing portion after Xero details are saved");
    }

    const saved: JobSheetPortion[] = [];
    for (const { portion, current } of matched) {
      if (current) {
        const row = await queryOne<JobSheetPortion>(
          /*
           * Once a portion is entered in Xero its commercial terms are settled outside this
           * system, so they stop being editable here — the same rule the `removed.some(hasXeroData)`
           * guard above applies to deletion, and the same rule `status` already had. Previously
           * only `status` was protected, so an invoice raised in Xero for 40,000 could be quietly
           * re-labelled 4,000 in ClientOps and the two systems would disagree with nothing to
           * show for it. Name, description and sort order stay editable: they are presentation,
           * not money.
           */
          `
            update job_sheet_portions
            set name = $1,
                source_quote_line_item_ids = case
                  when status = 'entered_in_xero' then source_quote_line_item_ids
                  else $2::uuid[]
                end,
                description = $3,
                amount = case when status = 'entered_in_xero' then amount else $4 end,
                currency = case when status = 'entered_in_xero' then currency else $5 end,
                target_invoice_date = case
                  when status = 'entered_in_xero' then target_invoice_date
                  else $6
                end,
                billing_type = case
                  when status = 'entered_in_xero' then billing_type
                  else $7
                end,
                status = case when status = 'entered_in_xero' then status else $8 end,
                sort_order = $9
            where id = $10 and job_sheet_id = $11
            returning *
          `,
          [
            portion.name,
            portion.source_quote_line_item_ids,
            portion.description,
            portion.amount,
            portion.currency,
            portion.target_invoice_date ?? null,
            portion.billing_type,
            portion.status,
            portion.sort_order,
            current.id,
            jobSheetId,
          ],
          client,
        );
        if (!row) throw new Error("Job sheet portion not found during update");
        saved.push(row);
        continue;
      }

      const row = await queryOne<JobSheetPortion>(
        `
          insert into job_sheet_portions
            (job_sheet_id, name, source_quote_line_item_ids, description, amount, currency,
             target_invoice_date, billing_type, status, sort_order)
          values ($1, $2, $3::uuid[], $4, $5, $6, $7, $8, $9, $10)
          returning *
        `,
        [
          jobSheetId,
          portion.name,
          portion.source_quote_line_item_ids,
          portion.description,
          portion.amount,
          portion.currency,
          portion.target_invoice_date ?? null,
          portion.billing_type,
          portion.status,
          portion.sort_order,
        ],
        client,
      );
      if (!row) throw new Error("Failed to insert job sheet portion");
      saved.push(row);
    }

    if (removed.length > 0) {
      await query(
        "delete from job_sheet_portions where job_sheet_id = $1 and id = any($2::uuid[])",
        [jobSheetId, removed.map((portion) => portion.id)],
        client,
      );
    }

    return saved;
  };

  if (db) return work(db);
  return transaction(work);
}
export async function acceptJobSheet(id: string, input: AcceptJobSheetInput): Promise<JobSheet> {
  return transaction(async (client) => {
    const jobSheet = await getJobSheetByIdWithOptions(id, client, { forUpdate: true });

    if (jobSheet.status !== "accounting_review" || jobSheet.locked_at) {
      throw new Error("Job sheet is already accepted or locked");
    }

    const portions = await listJobSheetPortions(id, client);
    const acceptance = canAcceptJobSheet({
      totalAmount: jobSheet.total_amount,
      portions,
      requirePoNumber: false,
      poNumber: jobSheet.po_number,
      clientOrderNumber: jobSheet.client_order_number,
    });

    if (!acceptance.ok) {
      throw new Error(acceptance.reasons.join(" "));
    }

    const acceptedJobSheet = await queryOne<JobSheet>(
      `
        update job_sheets
        set status = 'accepted',
            accepted_by = $1,
            accepted_at = now(),
            locked_at = now()
        where id = $2
          and status = 'accounting_review'
          and locked_at is null
        returning *
      `,
      [input.accepted_by, id],
      client,
    );

    if (!acceptedJobSheet) {
      throw new Error("Job sheet not found or already accepted");
    }

    return acceptedJobSheet;
  });
}

export async function updateJobSheetXeroReference(
  input: UpdateJobSheetXeroReferenceInput,
): Promise<JobSheetPortion> {
  const xeroInvoiceNumber = normalizeOptionalText(input.xero_invoice_number);
  const xeroInvoiceReference = normalizeOptionalText(input.xero_invoice_reference);
  const xeroInvoiceDate = normalizeOptionalText(input.xero_invoice_date);
  const xeroNotes = normalizeOptionalText(input.xero_notes);
  const portion = await queryOne<JobSheetPortion>(
    `
      update job_sheet_portions
      set xero_invoice_number = $1,
          xero_invoice_reference = $2,
          xero_invoice_date = $3,
          xero_notes = $4,
          status = case
            when $1 is not null or $2 is not null or $3 is not null or $4 is not null
              then 'entered_in_xero'
            when status = 'cancelled'
              then status
            else 'planned'
          end
      where id = $5
      returning *
    `,
    [xeroInvoiceNumber, xeroInvoiceReference, xeroInvoiceDate, xeroNotes, input.portion_id],
  );

  if (!portion) {
    throw new Error("Job sheet portion not found");
  }

  return portion;
}

type JobSheetOperationsRow = JobSheet & {
  quote_number: string | null;
  quote_status: string | null;
  client_company_name: string | null;
};

export type JobSheetOperationsRead = JobSheetDetail & {
  quote: { id: string; number: string | null; status: string | null } | null;
  client: { id: string; company_name: string } | null;
};

export async function getJobSheetOperationsRead(id: string): Promise<JobSheetOperationsRead> {
  const row = await queryOne<JobSheetOperationsRow>(
    `
      select js.id, js.number, js.quote_id, js.accepted_quote_version_id,
             js.account_id, js.client_id, js.contact_id, js.sales_owner,
             js.accounting_owner, js.status, js.accepted_scope_summary,
             js.po_number, js.client_order_number, js.xero_customer_reference,
             js.accounting_notes, js.special_billing_instructions,
             js.total_amount, js.currency, js.accepted_at, js.accepted_by,
             js.locked_at, js.created_by, js.created_at, js.updated_at,
             q.number as quote_number, q.status as quote_status,
             c.company_name as client_company_name
      from job_sheets js
      left join quotes q on q.id = js.quote_id
      left join clients c on c.id = js.client_id
      where js.id = $1
    `,
    [id],
  );
  if (!row) throw new Error("Job sheet not found");

  const { quote_number, quote_status, client_company_name, ...jobSheet } = row;
  const portions = await query<JobSheetPortion>(
    `
      select id, job_sheet_id, name, source_quote_line_item_ids, description,
             amount, currency, target_invoice_date, billing_type, status,
             xero_invoice_number, xero_invoice_reference, xero_invoice_date,
             xero_notes, internal_note, sort_order, created_at, updated_at
      from job_sheet_portions
      where job_sheet_id = $1
      order by sort_order asc, created_at asc, id asc
    `,
    [id],
  );

  return {
    jobSheet,
    portions,
    quote: jobSheet.quote_id
      ? { id: jobSheet.quote_id, number: quote_number ?? null, status: quote_status ?? null }
      : null,
    client:
      jobSheet.client_id && client_company_name
        ? { id: jobSheet.client_id, company_name: client_company_name }
        : null,
  };
}
