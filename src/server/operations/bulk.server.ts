import { createHash, randomUUID } from "node:crypto";
import {
  BulkPreviewRequestSchema,
  type BulkAction,
  type BulkItemResult,
  type BulkItemStatus,
  type BulkPreview,
  type BulkPreviewRequest,
  type BulkResult,
} from "@/lib/operations/bulk-contract";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import { query, queryOne, transaction, type Queryable } from "@/server/db/neon.server";

export class BulkItemError extends Error {
  constructor(
    readonly status: Exclude<BulkItemStatus, "succeeded">,
    readonly code: string,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export type BulkActionHandler = {
  preview(
    context: RequestAuthorization,
    id: string,
    action: BulkAction,
  ): Promise<{
    eligible: boolean;
    summary: string | null;
    version: number | null;
    status?: "forbidden" | "not_found" | "stale";
    groupKey?: string;
    code?: string;
  }>;
  apply(
    context: RequestAuthorization,
    id: string,
    action: BulkAction,
    expectedVersion: number | null,
    db: Queryable,
    operationId?: string,
  ): Promise<{ resultingVersion?: number }>;
};

type OperationRow = {
  id: string;
  actor_profile_id: string;
  preview_token: string;
  action: BulkAction;
  commit_key: string | null;
  state: "preview" | "paused" | "running" | "completed";
  expires_at: Date | string;
};
type ItemRow = {
  position: number;
  resource_id: string;
  expected_version: number | null;
  summary: string | null;
  status: BulkItemStatus | null;
  code: string | null;
  message: string | null;
  retryable: boolean;
  resulting_version: number | null;
  lease_owner: string | null;
};
const CHUNK_LIMIT = 20;
const WORKER_CONCURRENCY = 4;

function ensureOwner(operation: OperationRow | null, context: RequestAuthorization): OperationRow {
  if (!operation || operation.actor_profile_id !== context.actor.profileId) {
    throw new Error("Bulk operation owner access denied");
  }
  return operation;
}

function toItemResult(item: ItemRow): BulkItemResult | null {
  if (!item.status) return null;
  return {
    id: item.resource_id,
    status: item.status,
    ...(item.code ? { code: item.code } : {}),
    ...(item.message ? { message: item.message } : {}),
    retryable: item.retryable,
    ...(item.resulting_version === null ? {} : { resultingVersion: item.resulting_version }),
  };
}

export function createBulkService(options: { handler: BulkActionHandler }) {
  const { handler } = options;

  async function getBulkResult(
    context: RequestAuthorization,
    input: { operationId: string },
  ): Promise<BulkResult> {
    const operation = ensureOwner(
      await queryOne<OperationRow>("select * from bulk_operations where id=$1", [
        input.operationId,
      ]),
      context,
    );
    const items = await query<ItemRow>(
      "select * from bulk_operation_items where operation_id=$1 order by position",
      [operation.id],
    );
    const results = items.flatMap((item) => {
      const result = toItemResult(item);
      return result ? [result] : [];
    });
    return {
      operationId: operation.id,
      state: operation.state === "preview" ? "paused" : operation.state,
      processed: results.length,
      total: items.length,
      remainingIds: items
        .filter((item) => item.status !== "succeeded")
        .map((item) => item.resource_id),
      results,
    };
  }

  async function previewBulk(
    context: RequestAuthorization,
    rawRequest: BulkPreviewRequest,
  ): Promise<BulkPreview> {
    const request = BulkPreviewRequestSchema.parse(rawRequest);
    const rows: BulkPreview["rows"] = [];
    const initialStatus: Array<BulkItemStatus | null> = [];
    const initialCode: Array<string | null> = [];
    let groupKey: string | null = null;

    for (let offset = 0; offset < request.ids.length; offset += WORKER_CONCURRENCY) {
      const ids = request.ids.slice(offset, offset + WORKER_CONCURRENCY);
      // Preview only reads. Bound concurrency and assemble results in the requested order.
      const checks = await Promise.allSettled(
        ids.map((id) => handler.preview(context, id, request.action)),
      );
      for (const [index, result] of checks.entries()) {
        const id = ids[index];
        try {
          if (result.status === "rejected") throw result.reason;
          const check = result.value;
          if (check.eligible && check.groupKey) {
            if (groupKey && groupKey !== check.groupKey) {
              throw new Error("Bulk approval types must match");
            }
            groupKey = check.groupKey;
          }
          rows.push({
            id,
            eligible: check.eligible,
            summary: check.eligible ? check.summary : null,
            expectedVersion: check.version,
          });
          initialStatus.push(check.eligible ? null : (check.status ?? "not_found"));
          initialCode.push(check.eligible ? null : (check.code ?? "PREVIEW_INELIGIBLE"));
        } catch (error) {
          if (error instanceof Error && error.message === "Bulk approval types must match")
            throw error;
          const status = error instanceof BulkItemError ? error.status : "failed";
          rows.push({ id, eligible: false, summary: null, expectedVersion: null });
          initialStatus.push(status);
          initialCode.push(error instanceof BulkItemError ? error.code : "PREVIEW_INELIGIBLE");
        }
      }
    }
    const payloadHash = createHash("sha256")
      .update(JSON.stringify({ action: request.action, rows }))
      .digest("hex");
    const operationId = randomUUID();
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    await transaction(async (db) => {
      await db.query(
        "insert into bulk_operations(id,preview_token,actor_profile_id,action,payload_hash,expires_at) values($1,$2,$3,$4::jsonb,$5,$6)",
        [
          operationId,
          token,
          context.actor.profileId,
          JSON.stringify(request.action),
          payloadHash,
          expiresAt,
        ],
      );
      await db.query(
        `insert into bulk_operation_items
           (operation_id,position,resource_id,expected_version,summary,status,code,processed_at)
         select $1::uuid,item.position,item.resource_id,item.expected_version,item.summary,
                item.status,item.code,case when item.status is null then null else now() end
           from jsonb_to_recordset($2::jsonb) as item
             (position integer,resource_id text,expected_version integer,summary text,status text,code text)
          order by item.position`,
        [
          operationId,
          JSON.stringify(
            rows.map((row, position) => ({
              position,
              resource_id: row.id,
              expected_version: row.expectedVersion,
              summary: row.summary,
              status: initialStatus[position],
              code: initialCode[position],
            })),
          ),
        ],
      );
    });
    return {
      operationId,
      token,
      expiresAt,
      rows,
      eligibleCount: rows.filter((row) => row.eligible).length,
    };
  }

  async function processItem(
    context: RequestAuthorization,
    operation: OperationRow,
    claimed: ItemRow,
    leaseOwner: string,
  ): Promise<void> {
    await transaction(async (db) => {
      await db.query("set local statement_timeout = '4000ms'");
      const item = (
        await db.query<ItemRow>(
          "select * from bulk_operation_items where operation_id=$1 and position=$2 for update",
          [operation.id, claimed.position],
        )
      ).rows[0];
      if (!item || item.lease_owner !== leaseOwner || (item.status && !item.retryable)) return;
      await db.query("savepoint bulk_item_work");
      let result: BulkItemResult;
      try {
        const applied = await handler.apply(
          context,
          item.resource_id,
          operation.action,
          item.expected_version,
          db,
          ...(operation.action.type === "agent.recover" ? [operation.id] : []),
        );
        result = {
          id: item.resource_id,
          status: "succeeded",
          retryable: false,
          ...(applied.resultingVersion === undefined
            ? {}
            : { resultingVersion: applied.resultingVersion }),
        };
        await db.query("release savepoint bulk_item_work");
      } catch (error) {
        // The business write and its receipt share this transaction. A failed handler
        // loses all its writes before the failure receipt is saved.
        await db.query("rollback to savepoint bulk_item_work");
        const known = error instanceof BulkItemError ? error : null;
        const databaseCode =
          error && typeof error === "object" && "code" in error ? error.code : null;
        const retryableDatabaseFailure =
          typeof databaseCode === "string" &&
          ["40001", "40P01", "55P03", "57014"].includes(databaseCode);
        result = {
          id: item.resource_id,
          status: known?.status ?? "failed",
          code: known?.code ?? "ITEM_FAILED",
          message: known?.message ?? "The item could not be processed",
          retryable: known?.retryable ?? retryableDatabaseFailure,
        };
      }
      await db.query(
        "update bulk_operation_items set status=$3,code=$4,message=$5,retryable=$6,resulting_version=$7,lease_owner=null,lease_until=null,processed_at=now() where operation_id=$1 and position=$2",
        [
          operation.id,
          item.position,
          result.status,
          result.code ?? null,
          result.message ?? null,
          result.retryable,
          result.resultingVersion ?? null,
        ],
      );
    });
  }

  async function processChunk(
    context: RequestAuthorization,
    operationId: string,
    requestedLimit = CHUNK_LIMIT,
  ): Promise<BulkResult> {
    const limit = Math.min(CHUNK_LIMIT, Math.max(0, requestedLimit));
    const leaseOwner = randomUUID();
    const { operation, claimed } = await transaction(async (db) => {
      const operation = ensureOwner(
        (
          await db.query<OperationRow>("select * from bulk_operations where id=$1 for update", [
            operationId,
          ])
        ).rows[0] ?? null,
        context,
      );
      if (operation.state === "preview") throw new Error("Bulk preview has not been committed");
      if (operation.state === "completed") return { operation, claimed: [] as ItemRow[] };
      await db.query(
        "update bulk_operations set state='running' where id=$1 and state<>'completed'",
        [operationId],
      );
      const claimed =
        limit === 0
          ? []
          : (
              await db.query<ItemRow>(
                "update bulk_operation_items set lease_owner=$2,lease_until=now()+interval '30 seconds',attempt_count=attempt_count+1 " +
                  "where (operation_id,position) in (" +
                  "select operation_id,position from bulk_operation_items where operation_id=$1 and " +
                  "(status is null or (status='failed' and retryable)) and " +
                  "(lease_owner is null or lease_until<now()) order by position for update skip locked limit $3" +
                  ") returning *",
                [operationId, leaseOwner, limit],
              )
            ).rows;
      return { operation, claimed: claimed.sort((left, right) => left.position - right.position) };
    });

    // Owner/key checks have already run. A terminal replay is a receipt read,
    // including its original timestamp, leases and attempt counters.
    if (operation.state === "completed") return getBulkResult(context, { operationId });

    const deadline = Date.now() + 5_000;
    for (let index = 0; index < claimed.length; index += WORKER_CONCURRENCY) {
      if (index > 0 && Date.now() >= deadline) break;
      const batch = claimed.slice(index, index + WORKER_CONCURRENCY);
      const settled = await Promise.allSettled(
        batch.map((item) => processItem(context, operation, item, leaseOwner)),
      );
      if (settled.some((item) => item.status === "rejected")) break;
    }
    if (claimed.length > 0) {
      // Release only this request's uncompleted claims. A crashed request still has the
      // database lease expiry as a second recovery path.
      await query(
        "update bulk_operation_items set lease_owner=null,lease_until=null where operation_id=$1 and lease_owner=$2",
        [operationId, leaseOwner],
      );
    }
    await transaction(async (db) => {
      const remaining = (
        await db.query<{ count: string }>(
          "select count(*)::text as count from bulk_operation_items where operation_id=$1 and (status is null or (status='failed' and retryable))",
          [operationId],
        )
      ).rows[0];
      const active = (
        await db.query<{ count: string }>(
          "select count(*)::text as count from bulk_operation_items where operation_id=$1 and lease_owner is not null and lease_until>now()",
          [operationId],
        )
      ).rows[0];
      const state =
        Number(remaining?.count ?? 0) === 0
          ? "completed"
          : Number(active?.count ?? 0) > 0
            ? "running"
            : "paused";
      await db.query(
        "update bulk_operations set state=$2,completed_at=case when $2='completed' then now() else null end where id=$1 and state<>'completed'",
        [operationId, state],
      );
    });
    return getBulkResult(context, { operationId });
  }

  async function commitBulk(
    context: RequestAuthorization,
    input: { previewToken: string; idempotencyKey: string; processLimit?: number },
  ): Promise<BulkResult> {
    const operationId = await transaction(async (db) => {
      const operation = ensureOwner(
        (
          await db.query<OperationRow>(
            "select * from bulk_operations where preview_token=$1 for update",
            [input.previewToken],
          )
        ).rows[0] ?? null,
        context,
      );
      if (operation.commit_key && operation.commit_key !== input.idempotencyKey) {
        throw new Error("Bulk idempotency key does not match this operation");
      }
      if (!operation.commit_key && new Date(operation.expires_at).getTime() <= Date.now()) {
        throw new Error("Bulk preview expired");
      }
      if (!operation.commit_key) {
        await db.query("update bulk_operations set commit_key=$2,state='paused' where id=$1", [
          operation.id,
          input.idempotencyKey,
        ]);
      }
      return operation.id;
    });
    return processChunk(context, operationId, input.processLimit);
  }

  async function resumeBulk(
    context: RequestAuthorization,
    input: { operationId: string; processLimit?: number },
  ): Promise<BulkResult> {
    ensureOwner(
      await queryOne<OperationRow>("select * from bulk_operations where id=$1", [
        input.operationId,
      ]),
      context,
    );
    return processChunk(context, input.operationId, input.processLimit);
  }

  return { previewBulk, commitBulk, resumeBulk, getBulkResult };
}
