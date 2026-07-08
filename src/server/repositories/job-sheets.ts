import { buildDefaultPortionsFromLineItems, canAcceptJobSheet } from "@/lib/quote-to-cash";
import type { NewJobSheetPortion } from "@/lib/quote-to-cash";
import type { JobSheet, JobSheetPortion, JsonValue, QuoteLineItemRecord } from "@/lib/types";
import { query, queryOne, transaction, type Queryable } from "@/server/db/neon.server";
import { buildFilters } from "@/server/db/query-builders";

export type JobSheetFilters = {
  status?: string;
  client_id?: string;
  account_id?: string;
};

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

    const lockedJobSheet = await getJobSheetByIdWithOptions(jobSheet.id, client, { forUpdate: true });
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
    // Keep the parent row lock, immutability check, delete, and reinsert in one transaction.
    const jobSheet = await getJobSheetByIdWithOptions(jobSheetId, client, { forUpdate: true });

    if (jobSheet.status === "accepted" || jobSheet.locked_at) {
      throw new Error("Accepted job sheet commercial fields are immutable");
    }

    await query("delete from job_sheet_portions where job_sheet_id = $1", [jobSheetId], client);

    const inserted: JobSheetPortion[] = [];
    for (const portion of portions) {
      const row = await queryOne<JobSheetPortion>(
        `
          insert into job_sheet_portions
            (
              job_sheet_id,
              name,
              source_quote_line_item_ids,
              description,
              amount,
              currency,
              target_invoice_date,
              billing_type,
              status,
              sort_order
            )
          values
            ($1, $2, $3::uuid[], $4, $5, $6, $7, $8, $9, $10)
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

      if (!row) {
        throw new Error("Failed to insert job sheet portion");
      }

      inserted.push(row);
    }

    return inserted;
  };

  if (db) {
    return work(db);
  }

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
  const portion = await queryOne<JobSheetPortion>(
    `
      update job_sheet_portions
      set xero_invoice_number = $1,
          xero_invoice_reference = $2,
          xero_invoice_date = $3,
          xero_notes = $4,
          status = 'entered_in_xero'
      where id = $5
      returning *
    `,
    [
      input.xero_invoice_number ?? null,
      input.xero_invoice_reference ?? null,
      input.xero_invoice_date ?? null,
      input.xero_notes ?? null,
      input.portion_id,
    ],
  );

  if (!portion) {
    throw new Error("Job sheet portion not found");
  }

  return portion;
}
