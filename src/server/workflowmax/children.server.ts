import type { WfmObject } from "./http.server";
import type { WfmStoredType } from "./plan.server";
import { object } from "./values.server";

export const WFM_CHILD_TYPES = ["account_contact", "job_cost", "invoice_line_item"] as const;
export type WfmChild = { type: (typeof WFM_CHILD_TYPES)[number]; row: WfmObject };

/** Only documented included collections. Missing child UUIDs stay in parent raw. */
export function includedWfmObjects(type: WfmStoredType, row: WfmObject): WfmChild[] {
  const children: WfmChild[] = [];
  const add = (type: WfmChild["type"], values: unknown, parent: Record<string, string>) => {
    for (const entry of Array.isArray(values) ? values : []) {
      const value = object(entry);
      children.push({
        type,
        row: { ...value, ...parent, uuid: typeof value.uuid === "string" ? value.uuid : "" },
      });
    }
  };
  if (type === "client") add("account_contact", row.contacts, { clientUUID: row.uuid });
  if (type === "project") add("job_cost", row.costs, { jobUUID: row.uuid });
  if (type === "invoice")
    for (const entry of Array.isArray(row.jobs) ? row.jobs : []) {
      const job = object(entry);
      add("invoice_line_item", job.tasks, { invoiceUUID: row.uuid });
      add("invoice_line_item", job.costs, { invoiceUUID: row.uuid });
    }
  return children;
}
