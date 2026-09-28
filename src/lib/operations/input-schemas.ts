import { z } from "zod";

export const UuidSchema = z.uuid();

export const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, "Invalid calendar date");

const optionalId = UuidSchema.nullable().optional();
const optionalText = z.string().max(10_000).nullable().optional();

export const TaskCreateSchema = z.strictObject({
  title: z.string().trim().min(1).max(255),
  description: optionalText,
  assigned_to: optionalId,
  lead_id: optionalId,
  client_id: optionalId,
  contact_id: optionalId,
  account_id: optionalId,
  deal_id: optionalId,
  project_id: optionalId,
  due_date: DateOnlySchema.nullable().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
});

export const TaskMutationSchema = z.strictObject({
  id: UuidSchema,
  updates: TaskCreateSchema.partial()
    .extend({ status: z.enum(["open", "in_progress", "done"]).optional() })
    .refine((updates) => Object.keys(updates).length > 0, "At least one update is required"),
});

export type TaskCreateInput = z.infer<typeof TaskCreateSchema>;
export type TaskMutationInput = z.infer<typeof TaskMutationSchema>;

// NUMERIC(12,2) is the widest ClientOps money column. Keep JavaScript numbers at the
// boundary for current callers; later read models can return decimal strings for aggregates.
export const MoneySchema = z
  .number()
  .finite()
  .min(0)
  .max(9_999_999_999.99)
  .refine(
    (value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001,
    "Use at most two decimal places",
  );

export const CurrencySchema = z.string().regex(/^[A-Z]{3}$/, "Expected a three-letter currency");
export const NotesSchema = z.string().max(10_000);
export const SearchSchema = z.string().trim().max(200);

export const CommandMetaSchema = z.strictObject({
  idempotencyKey: UuidSchema,
  expectedVersion: z.number().int().min(0),
});

export const BulkIdsSchema = z
  .array(UuidSchema)
  .min(1)
  .max(100)
  .refine((ids) => new Set(ids).size === ids.length, "Duplicate IDs are not allowed");

const quoteCommercialFields = {
  quote_template_id: UuidSchema.nullable(),
  document_sections: z.json(),
  cover_text: optionalText,
  assumptions: optionalText,
  payment_terms: optionalText,
  parent_quote_id: UuidSchema.nullable(),
  change_order_reason: optionalText,
  total_value: MoneySchema.nullable(),
  valid_until: DateOnlySchema.nullable(),
  line_items: z
    .array(
      z.strictObject({
        // The editor uses a stable client key (li-...) until line items are persisted.
        id: z.string().trim().min(1).max(255),
        service: z.string().trim().min(1).max(255),
        description: z.string().max(10_000),
        qty: MoneySchema.refine((value) => value > 0, "Quantity must be positive"),
        unit_price: MoneySchema,
      }),
    )
    .max(500),
  contact_id: UuidSchema.nullable(),
  account_id: UuidSchema.nullable(),
  deal_id: UuidSchema.nullable(),
};
export const QuoteCreateSchema = z.strictObject({
  lead_id: UuidSchema.nullable(),
  currency: CurrencySchema,
  client_id: optionalId,
  contact_id: optionalId,
  account_id: optionalId,
  deal_id: optionalId,
  quote_template_id: optionalId,
  number: z.string().trim().min(1).max(100).nullable().optional(),
  line_items: quoteCommercialFields.line_items.optional(),
  total_value: MoneySchema.nullable().optional(),
  valid_until: DateOnlySchema.nullable().optional(),
  document_sections: z.json().optional(),
  cover_text: optionalText,
  assumptions: optionalText,
  payment_terms: optionalText,
});

export const QuoteCommercialPatchSchema = z
  .strictObject(quoteCommercialFields)
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, "At least one update is required");

export const QuoteMutationSchema = z.strictObject({
  id: UuidSchema,
  updates: QuoteCommercialPatchSchema,
});

export const QuoteRevisionSchema = z.strictObject({
  id: UuidSchema,
  baseVersionId: UuidSchema,
  reason: z.enum(["revised", "change_order"]),
  notes: z.string().trim().max(500).optional(),
  patch: z
    .strictObject({
      currency: CurrencySchema.optional(),
      line_items: quoteCommercialFields.line_items.optional(),
      total_value: MoneySchema.nullable().optional(),
      valid_until: DateOnlySchema.nullable().optional(),
      document_sections: z.json().optional(),
      cover_text: optionalText,
      assumptions: optionalText,
      payment_terms: optionalText,
    })
    .optional(),
  idempotencyKey: UuidSchema,
});
export type QuoteRevisionInput = z.infer<typeof QuoteRevisionSchema>;

export const ApprovalDecisionSchema = z.strictObject({
  id: UuidSchema,
  decision: z.enum(["approved", "rejected", "escalated"]),
  notes: NotesSchema.optional(),
  expectedVersion: z.number().int().nonnegative().optional(),
  idempotencyKey: UuidSchema.optional(),
});

export const ApprovalAssignmentSchema = z.strictObject({
  id: UuidSchema,
  assignedTo: UuidSchema.nullable(),
  expectedVersion: z.number().int().nonnegative().optional(),
});

const JobSheetPortionSchema = z.strictObject({
  id: UuidSchema.optional(),
  name: z.string().trim().min(1).max(255),
  source_quote_line_item_ids: z.array(UuidSchema).max(500),
  description: z.string().max(10_000),
  amount: MoneySchema,
  currency: CurrencySchema,
  target_invoice_date: DateOnlySchema.nullable().optional(),
  billing_type: z.enum(["deposit", "progress", "milestone", "monthly", "final", "other"]),
  status: z.enum(["planned", "entered_in_xero", "cancelled"]),
  sort_order: z.number().int().min(0),
});

export const JobSheetMutationSchema = z.strictObject({
  id: UuidSchema,
  portions: z.array(JobSheetPortionSchema).max(500),
});

export const XeroReferenceSchema = z.strictObject({
  portion_id: UuidSchema,
  xero_invoice_number: z.string().trim().max(255).nullable().optional(),
  xero_invoice_reference: z.string().trim().max(255).nullable().optional(),
  xero_invoice_date: DateOnlySchema.nullable().optional(),
  xero_notes: NotesSchema.nullable().optional(),
});

export type QuoteCommercialPatchInput = z.infer<typeof QuoteCommercialPatchSchema>;
export type ApprovalDecisionInput = z.infer<typeof ApprovalDecisionSchema>;
export type JobSheetMutationInput = z.infer<typeof JobSheetMutationSchema>;

const CsvImportRowSchema = z.record(z.string().max(255), z.string().max(10_000));
export const ImportRowsSchema = z.strictObject({
  rows: z.array(CsvImportRowSchema).max(5_000),
});

const EventImportRowSchema = z.strictObject({
  company_name: z.string().max(10_000),
  contact_name: z.string().max(10_000),
  email: z.string().max(10_000),
  phone: z.string().max(10_000),
  attendee_status: z.string().max(10_000),
  interests: z.array(z.string().max(10_000)).max(100),
  notes: NotesSchema,
});
export const EventImportRowsSchema = z.strictObject({
  rows: z.array(EventImportRowSchema).max(5_000),
});
export const EventImportCommitSchema = EventImportRowsSchema.extend({
  campaignId: UuidSchema,
});
export const IdSchema = z.strictObject({ id: UuidSchema });
export const QuoteVersionListSchema = z.strictObject({ quoteId: UuidSchema });
export const LeadIdSchema = z.strictObject({ leadId: UuidSchema });
export const RequestQuoteApprovalSchema = IdSchema.extend({ assignedTo: optionalId });
export const RejectQuoteSchema = IdSchema.extend({
  approvalId: UuidSchema.optional(),
  notes: NotesSchema.optional(),
});
export const IssueQuoteVersionSchema = IdSchema.extend({ pdfTemplateId: optionalId });
export const ApproveAndIssueQuoteSchema = IssueQuoteVersionSchema.extend({
  approvalId: UuidSchema,
  notes: NotesSchema.optional(),
});
