import type { WfmObject, ListOptions } from "./http.server";
import { WFM_PLAN, type WfmResourceType } from "./plan.server";
import { WfmSourceSnapshot, type WfmSnapshot } from "./reconcile.server";
import { WfmHistoryStore } from "./store.server";

export type WfmSource = {
  sourceNamespace: string;
  list(path: string, options?: ListOptions): AsyncIterable<WfmObject>;
};
export type WfmRowReceipt = {
  resource: WfmResourceType;
  externalKey: string;
  status: "dry_run" | "succeeded" | "failed";
  action?: string;
};

export async function importWfmHistory(options: {
  source: WfmSource;
  store?: WfmHistoryStore;
  updatedSince?: string;
  currency?: string;
  onReceipt?: (receipt: WfmRowReceipt) => void;
}): Promise<WfmSnapshot> {
  const snapshot = new WfmSourceSnapshot(
    options.source.sourceNamespace,
    Boolean(options.updatedSince),
    options.currency,
  );
  let succeeded = false;
  try {
    for (const step of WFM_PLAN) {
      for await (const row of options.source.list(step.path, {
        ...step.options,
        // Refresh settings in full, including during incremental history imports.
        updatedSince: step.type === "setting" ? undefined : options.updatedSince,
      })) {
        try {
          snapshot.add(step.type, row);
          const applied = await options.store?.upsert(step.type, row);
          options.onReceipt?.({
            resource: step.type,
            externalKey: row.uuid,
            status: options.store ? "succeeded" : "dry_run",
            action: applied?.action,
          });
        } catch (error) {
          await options.store?.recordFailure(step.type, row.uuid, error);
          options.onReceipt?.({ resource: step.type, externalKey: row.uuid, status: "failed" });
          // Stop at the failed dependency. A full rerun is idempotent.
          throw new Error(`WFM import failed at ${step.type}; inspect row receipts`);
        }
      }
    }
    succeeded = true;
    return snapshot.finish(true, options.store?.runId);
  } finally {
    await options.store?.close(succeeded);
  }
}
