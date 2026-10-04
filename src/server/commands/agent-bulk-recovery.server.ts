import { createHash } from "node:crypto";
import { z } from "zod";
import { AdminError } from "@/lib/admin/errors";
import { parseOperationInput } from "@/lib/operations/errors";
import type { BulkAction, BulkResult } from "@/lib/operations/bulk-contract";
import type { AgentRun } from "@/lib/types";
import { AGENT_RUN_STUCK_MINUTES } from "@/lib/agents";
import {
  requireCapability,
  loadRequestAuthorization,
  type RequestAuthorization,
} from "@/server/auth/authorization.server";
import { query, queryOne, transaction, type Queryable } from "@/server/db/neon.server";
import {
  BulkItemError,
  createBulkService,
  type BulkActionHandler,
} from "@/server/operations/bulk.server";
import {
  recoverAgentRunInTransaction,
  subjectOwner,
  requireScopedCapability,
} from "./agent-recovery.server";
export const AgentBulkPreviewSchema = z.object({
  runIds: z
    .array(z.string().uuid())
    .min(1)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length),
  action: z.enum(["cancel", "expire"]),
});
export const AgentBulkExecuteSchema = z.object({
  previewId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  reason: z.string().trim().min(10).max(1000),
});
export const AgentBulkOperationSchema = z.object({ operationId: z.string().uuid() });
type Operation = {
  id: string;
  actor_profile_id: string;
  preview_token: string;
  action: BulkAction;
  commit_key: string | null;
  expires_at: Date | string;
};
const snapshot = (run: AgentRun) => createHash("sha256").update(JSON.stringify(run)).digest("hex");
function block(run: AgentRun, linked: boolean, action: "cancel" | "expire"): string | null {
  if (run.workflow_type === "note_tidy" || run.subject_type === "note")
    return "UNSUPPORTED_OWNERSHIP";
  if (linked) return "LINKED_APPROVAL";
  if (!["running", "waiting_approval"].includes(run.status)) return "TERMINAL";
  // Legacy/missing metadata is unknown, never evidence that no provider effect occurred.
  const source = run.execution_metadata?.source;
  if (
    run.outcome_code === "dispatch_ambiguous" ||
    !source ||
    source === "unknown" ||
    (source === "provider" &&
      (run.status === "running" || !run.execution_metadata?.providerRequestId))
  )
    return "PROVIDER_OUTCOME_UNKNOWN";
  if (
    action === "expire" &&
    Date.now() - new Date(run.created_at).getTime() < AGENT_RUN_STUCK_MINUTES * 60000
  )
    return "TOO_YOUNG";
  return null;
}
function reject(code: string): never {
  throw new BulkItemError(
    "not_found",
    code,
    "Item requires individual review or no longer qualifies",
    false,
  );
}
async function authorize(db: Queryable, context: RequestAuthorization, run: AgentRun) {
  try {
    const owner = await subjectOwner(db, run.subject_type, run.subject_id);
    requireScopedCapability(context, "agents.run", run.subject_type, run.subject_id, owner);
  } catch {
    throw new BulkItemError(
      "forbidden",
      "FORBIDDEN",
      "Item is outside permitted recovery scope",
      false,
    );
  }
}
async function freshContext(db: Queryable, context: RequestAuthorization) {
  const actor = (
    await db.query<{
      role: RequestAuthorization["actor"]["role"];
      status: RequestAuthorization["actor"]["status"];
    }>("select role,status from profiles where id=$1 for share", [context.actor.profileId])
  ).rows[0];
  if (!actor)
    throw new BulkItemError("forbidden", "FORBIDDEN", "Actor no longer has access", false);
  return loadRequestAuthorization({
    ...context.session,
    profile: { ...context.session.profile, ...actor },
  });
}
export const agentRecoveryBulkHandler: BulkActionHandler = {
  async preview(context, id, action) {
    if (action.type !== "agent.recover")
      throw new BulkItemError("failed", "ACTION_UNAVAILABLE", "Unsupported action", false);
    const run = await queryOne<AgentRun>("select * from agent_runs where id=$1", [id]);
    if (!run)
      return {
        eligible: false,
        summary: null,
        version: null,
        status: "not_found",
        code: "NOT_FOUND",
      };
    if (run.workflow_type === "note_tidy" || run.subject_type === "note")
      return {
        eligible: false,
        summary: null,
        version: null,
        status: "not_found",
        code: "UNSUPPORTED_OWNERSHIP",
      };
    const db: Queryable = {
      query: async <T>(sql: string, v: readonly unknown[] = []) => ({
        rows: await query<T>(sql, v),
      }),
    };
    await authorize(db, context, run);
    const linked = Boolean(
      await queryOne("select id from human_approvals where agent_run_id=$1 limit 1", [id]),
    );
    const code = block(run, linked, action.action);
    return {
      eligible: !code,
      summary: code ? null : snapshot(run),
      version: null,
      ...(code ? { status: "not_found" as const, code } : {}),
    };
  },
  async apply(context, id, action, _version, db, operationId) {
    if (action.type !== "agent.recover" || !operationId || !action.reason)
      throw new BulkItemError(
        "failed",
        "ACTION_UNAVAILABLE",
        "Reviewed recovery intent required",
        false,
      );
    const current = await freshContext(db, context);
    const expected = (
      await db.query<{ summary: string }>(
        "select summary from bulk_operation_items where operation_id=$1 and resource_id=$2",
        [operationId, id],
      )
    ).rows[0]?.summary;
    try {
      await recoverAgentRunInTransaction(
        db,
        current,
        {
          runId: id,
          action: action.action,
          reason: action.reason,
          idempotencyKey: operationId + ":" + id,
        },
        {
          verify: async (run, reader) => {
            await authorize(reader, current, run);
            // FOR UPDATE on the run blocks FK insertion until this transaction finishes. Recheck
            // every linked approval after the lock so a post-preview link is never terminalized.
            const linked =
              (
                await reader.query("select id from human_approvals where agent_run_id=$1 limit 1", [
                  id,
                ])
              ).rows.length > 0;
            const code = block(run, linked, action.action);
            if (code) reject(code);
            if (snapshot(run) !== expected)
              throw new BulkItemError(
                "stale",
                "STALE_SNAPSHOT",
                "Run changed since preview; review it individually",
                false,
              );
          },
        },
      );
    } catch (error) {
      if (error instanceof BulkItemError) throw error;
      if (error instanceof AdminError) {
        if (["FORBIDDEN", "OUTSIDE_SCOPE"].includes(error.code))
          throw new BulkItemError(
            "forbidden",
            "FORBIDDEN",
            "Item is outside permitted recovery scope",
            false,
          );
        if (error.code === "CONFLICT") reject("STATE_CHANGED");
      }
      throw error;
    }
    return {};
  },
};
const service = createBulkService({ handler: agentRecoveryBulkHandler });
async function owned(
  context: RequestAuthorization,
  id: string,
  db?: Queryable,
): Promise<Operation> {
  const operation = await queryOne<Operation>(
    "select * from bulk_operations where id=$1" + (db ? " for update" : ""),
    [id],
    db,
  );
  if (!operation || operation.actor_profile_id !== context.actor.profileId)
    throw new AdminError("FORBIDDEN", "Recovery operation access denied");
  if (operation.action.type !== "agent.recover")
    throw new AdminError("CONFLICT", "Not an agent recovery operation");
  return operation;
}
export async function previewAgentRecovery(context: RequestAuthorization, raw: unknown) {
  const input = parseOperationInput(AgentBulkPreviewSchema, raw);
  await requireCapability("agents.run", {}, context);
  const result = await service.previewBulk(context, {
    ids: input.runIds,
    action: { type: "agent.recover", action: input.action },
  });
  const stored = await query<{ resource_id: string; code: string | null }>(
    "select resource_id,code from bulk_operation_items where operation_id=$1 order by position",
    [result.operationId],
  );
  return {
    previewId: result.operationId,
    expiresAt: result.expiresAt,
    eligibleCount: result.eligibleCount,
    blockedCount: result.rows.length - result.eligibleCount,
    items: result.rows.map((r, i) => ({
      runId: r.id,
      eligible: r.eligible,
      reasonCode: stored[i]?.code ?? "ELIGIBLE",
    })),
  };
}
export type AgentRecoveryReceipt = {
  operationId: string;
  status: BulkResult["state"];
  completedCount: number;
  totalCount: number;
  items: {
    runId: string;
    status: "pending" | "succeeded" | "forbidden" | "stale" | "skipped" | "failed";
    reasonCode: string;
    commandReceiptId: string | null;
    retryable: boolean;
  }[];
};
export async function getAgentRecoveryOperation(
  context: RequestAuthorization,
  raw: unknown,
): Promise<AgentRecoveryReceipt> {
  const input = parseOperationInput(AgentBulkOperationSchema, raw);
  await requireCapability("agents.view", {}, context);
  await owned(context, input.operationId);
  const result = await service.getBulkResult(context, input);
  const items = await query<{
    resource_id: string;
    status: string | null;
    code: string | null;
    retryable: boolean;
    command_receipt_id: string | null;
  }>(
    "select i.resource_id,i.status,i.code,i.retryable,c.id as command_receipt_id from bulk_operation_items i left join command_receipts c on c.scope='agent.recovery' and c.actor_id=$2 and c.idempotency_key=$1::text||':'||i.resource_id where i.operation_id=$1::uuid order by i.position",
    [input.operationId, context.actor.profileId],
  );
  return {
    operationId: result.operationId,
    status: result.state,
    completedCount: result.processed,
    totalCount: result.total,
    items: items.map((i) => ({
      runId: i.resource_id,
      status: (i.status === "not_found"
        ? "skipped"
        : (i.status ?? "pending")) as AgentRecoveryReceipt["items"][number]["status"],
      reasonCode: i.code ?? (i.status === "succeeded" ? "SUCCEEDED" : "PENDING"),
      commandReceiptId: i.command_receipt_id,
      retryable: i.retryable,
    })),
  };
}
export async function executeAgentRecovery(
  context: RequestAuthorization,
  raw: unknown,
  options: { processLimit?: number } = {},
): Promise<AgentRecoveryReceipt> {
  const input = parseOperationInput(AgentBulkExecuteSchema, raw);
  await requireCapability("agents.run", {}, context);
  let token: string;
  try {
    token = await transaction(async (db) => {
      const operation = await owned(context, input.previewId, db);
      if (operation.action.type !== "agent.recover")
        throw new AdminError("CONFLICT", "Wrong operation type");
      if (
        operation.commit_key &&
        (operation.commit_key !== input.idempotencyKey || operation.action.reason !== input.reason)
      )
        throw new AdminError("CONFLICT", "Recovery intent or idempotency key changed");
      if (!operation.commit_key) {
        if (new Date(operation.expires_at).getTime() <= Date.now())
          throw new AdminError("CONFLICT", "Recovery preview expired");
        await db.query(
          "update bulk_operations set action=$2::jsonb,commit_key=$3,state='paused' where id=$1",
          [
            operation.id,
            JSON.stringify({ ...operation.action, reason: input.reason }),
            input.idempotencyKey,
          ],
        );
      }
      return operation.preview_token;
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505")
      throw new AdminError("CONFLICT", "Idempotency key already binds another operation");
    throw error;
  }
  await service.commitBulk(context, {
    previewToken: token,
    idempotencyKey: input.idempotencyKey,
    processLimit: options.processLimit,
  });
  return getAgentRecoveryOperation(context, { operationId: input.previewId });
}
export async function resumeAgentRecovery(
  context: RequestAuthorization,
  raw: unknown,
  options: { processLimit?: number } = {},
): Promise<AgentRecoveryReceipt> {
  const input = parseOperationInput(AgentBulkOperationSchema, raw);
  await requireCapability("agents.view", {}, context);
  await owned(context, input.operationId);
  await service.resumeBulk(context, { ...input, processLimit: options.processLimit });
  return getAgentRecoveryOperation(context, input);
}
