import type { ListOptions } from "./http.server";

export const WFM_PLAN = [
  { type: "setting", stage: "settings", path: "v2/taxes", options: { pageSizeParam: "pagesize" } },
  {
    type: "staff_map",
    stage: "staff",
    path: "v2/staff",
    options: {
      query: { status: "active,deleted", includes: "contact-details,historic-rates" },
    },
  },
  {
    type: "client",
    stage: "clients/contacts",
    path: "v2/clients",
    options: {
      query: {
        status: "active,archived",
        includes:
          "contacts,contact-details,addresses,billing-details,notes,documents,custom-fields",
      },
    },
  },
  {
    type: "lead",
    stage: "leads",
    path: "v2/leads/",
    options: {
      query: { includes: "notes,documents,activities,quotes,custom-fields" },
    },
  },
  {
    type: "quote",
    stage: "quotes",
    path: "v2/quotes",
    options: {
      query: {
        status: "draft,issued,accepted,declined,revised",
        includes: "line-items,phases,notes,documents,custom-fields",
      },
    },
  },
  {
    type: "project",
    stage: "jobs/tasks/costs/notes",
    path: "v2/jobs",
    options: {
      query: {
        status: "standard,on-hold,completed,cancelled,deleted",
        includes:
          "tasks,costs,notes,documents,staff,phases,milestones,quotes,purchase-orders,custom-fields",
      },
    },
  },
  { type: "task", stage: "jobs/tasks/costs/notes", path: "v2/jobs/tasks", options: {} },
  // Job costs are retained in each job's included costs; the global costs path
  // in current docs conflicts with its heading. Separate endpoint awaits UAT.
  { type: "job_note", stage: "jobs/tasks/costs/notes", path: "v2/jobs/notes", options: {} },
  {
    type: "purchase_order",
    stage: "jobs/tasks/costs/notes",
    path: "v2/purchase-orders",
    options: {
      query: { status: "draft,issued,cancelled", includes: "stock-receipts,bills" },
    },
  },
  { type: "timesheet", stage: "timesheets", path: "v2/timesheets", options: {} },
  {
    type: "invoice",
    stage: "invoices/payments",
    path: "v2/invoices",
    options: {
      pageSizeParam: "pagesize",
      query: { status: "draft,approved,cancelled", includes: "jobs,details,notes,payments" },
    },
  },
  // Use the standalone payments endpoint: embedded payments omit payment UUIDs.
  {
    type: "invoice_payment",
    stage: "invoices/payments",
    path: "v2/payments",
    options: {
      pageSizeParam: "pagesize",
      updatedSinceParam: "updatedsince",
    },
  },
] as const satisfies readonly { type: string; stage: string; path: string; options: ListOptions }[];

export type WfmResourceType = (typeof WFM_PLAN)[number]["type"];
export type WfmStoredType =
  | WfmResourceType
  | "account"
  | "account_contact"
  | "job_cost"
  | "invoice_line_item"
  | "timesheet_line";
