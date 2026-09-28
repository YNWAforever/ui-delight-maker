import { createHash } from "node:crypto";
import { AdminError } from "@/lib/admin/errors";
import type { Queryable } from "@/server/db/neon.server";

type ReceiptInput = {
  scope: string;
  actorId: string;
  idempotencyKey: string;
  payload: unknown;
};
type Claim<T> = { kind: "new"; id: string } | { kind: "replay"; result: T };

export async function claimCommandReceipt<T>(
  db: Queryable,
  input: ReceiptInput,
): Promise<Claim<T>> {
  if (input.idempotencyKey.length < 8 || input.idempotencyKey.length > 255) {
    throw new AdminError("VALIDATION_FAILED", "Invalid idempotency key");
  }
  const hash = createHash("sha256").update(JSON.stringify(input.payload)).digest("hex");
  const inserted = await db.query<{ id: string }>(
    `insert into command_receipts (scope,actor_id,idempotency_key,request_hash)
     values ($1,$2,$3,$4)
     on conflict (scope,actor_id,idempotency_key) do nothing
     returning id`,
    [input.scope, input.actorId, input.idempotencyKey, hash],
  );
  if (inserted.rows[0]) return { kind: "new", id: inserted.rows[0].id };
  const existing = await db.query<{ request_hash: string; result: T | null }>(
    `select request_hash,result from command_receipts
     where scope=$1 and actor_id=$2 and idempotency_key=$3 for update`,
    [input.scope, input.actorId, input.idempotencyKey],
  );
  const receipt = existing.rows[0];
  if (!receipt || receipt.request_hash !== hash || receipt.result === null) {
    throw new AdminError("CONFLICT", "Idempotency key conflicts with another command");
  }
  return { kind: "replay", result: receipt.result };
}

export async function completeCommandReceipt(
  db: Queryable,
  id: string,
  result: unknown,
): Promise<void> {
  await db.query("update command_receipts set result=$2::jsonb where id=$1 and result is null", [
    id,
    JSON.stringify(result),
  ]);
}
