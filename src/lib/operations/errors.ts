import { z } from "zod";

export type OperationErrorCode =
  | "INVALID_INPUT"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_STATE";

export class OperationError extends Error {
  readonly code: OperationErrorCode;
  readonly fieldErrors: Record<string, string[]>;

  constructor(
    code: OperationErrorCode,
    message: string,
    fieldErrors: Record<string, string[]> = {},
  ) {
    super(message);
    this.name = "OperationError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

// Only labels owned by the application cross the default Error transport. Zod paths,
// custom issue messages and submitted values can contain user text or secrets.
const INPUT_FIELD_LABELS: Readonly<Record<string, string>> = {
  name: "Name",
  source_quote_line_item_ids: "Quote line items",
  title: "Title",
  description: "Description",
  priority: "Priority",
  status: "Status",
  due_date: "Due date",
  valid_until: "Valid until",
  target_invoice_date: "Invoice date",
  invoiceDate: "Invoice date",
  currency: "Currency",
  total_value: "Total value",
  amount: "Amount",
  qty: "Quantity",
  unit_price: "Unit price",
  service: "Service",
  decision: "Decision",
  notes: "Notes",
  note: "Note",
  reason: "Reason",
  reference: "Reference",
  assigned_to: "Owner",
  assignedTo: "Reviewer",
  owner_profile_id: "Owner",
  id: "Record",
  runId: "Run",
  lead_id: "Lead",
  client_id: "Client",
  contact_id: "Contact",
  account_id: "Account",
  deal_id: "Deal",
  project_id: "Project",
  campaignId: "Campaign",
  quoteId: "Quote",
  approvalId: "Approval",
  issuedVersionId: "Issued version",
  baseVersionId: "Base version",
  portionId: "Portion",
  pdfTemplateId: "PDF template",
  idempotencyKey: "Request",
  expectedVersion: "Version",
  action: "Action",
  rows: "Import rows",
  ids: "Selected items",
  line_items: "Line items",
  portions: "Portions",
  billing_type: "Billing type",
  sort_order: "Order",
  quote_line_item_ids: "Quote line items",
  invoiceNumber: "Invoice number",
  number: "Number",
  parent_quote_id: "Parent quote",
  quote_template_id: "Quote template",
  document_sections: "Document sections",
  cover_text: "Cover text",
  assumptions: "Assumptions",
  payment_terms: "Payment terms",
  change_order_reason: "Change order reason",
  company_name: "Company",
  contact_name: "Contact",
  email: "Email",
  phone: "Phone",
  attendee_status: "Attendee status",
  interests: "Interests",
};
const INPUT_COLLECTION_LABELS: Readonly<Record<string, string>> = {
  rows: "Import row",
  line_items: "Line item",
  portions: "Portion",
};

function validationMessage(issues: readonly { path: readonly PropertyKey[] }[]): string {
  const labels = new Set<string>();
  for (const { path } of issues) {
    const field = [...path]
      .reverse()
      .find(
        (part): part is string =>
          typeof part === "string" && Object.hasOwn(INPUT_FIELD_LABELS, part),
      );
    if (!field) continue;
    let label = INPUT_FIELD_LABELS[field];
    for (let index = 0; index < path.length - 1; index++) {
      const collection = path[index];
      const row = path[index + 1];
      if (
        typeof collection === "string" &&
        Object.hasOwn(INPUT_COLLECTION_LABELS, collection) &&
        typeof row === "number" &&
        Number.isSafeInteger(row) &&
        row >= 0 &&
        row < 5000
      ) {
        label = INPUT_COLLECTION_LABELS[collection] + " " + (row + 1) + ": " + label;
        break;
      }
    }
    labels.add(label);
    if (labels.size === 3) break;
  }
  return labels.size
    ? "Invalid input. Check " + [...labels].join(", ") + "."
    : "Invalid input. Check the entered values.";
}

export function parseOperationInput<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const fieldErrors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.length ? issue.path.join(".") : "_";
    (fieldErrors[path] ??= []).push(issue.message);
  }
  throw new OperationError("INVALID_INPUT", validationMessage(result.error.issues), fieldErrors);
}
