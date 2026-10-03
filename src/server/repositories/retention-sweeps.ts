import { randomUUID } from "node:crypto";
import { AdminError } from "@/lib/admin/errors";
import { query, queryOne, transaction, type Queryable } from "@/server/db/neon.server";
export type SweepRow = {
  id: string;
  today: string;
  cursor: string | null;
  upper_id: string | null;
  complete: boolean;
  lease_owner: string | null;
  lease_until: string | null;
};
export type SweepCandidate = {
  id: string;
  client_id: string;
  owner: string | null;
  renewal_date: string | null;
  last_touch_at: string | null;
  start_date: string;
  client_company_name: string;
};
export type SweepItem = {
  state: "intent" | "acknowledged" | "failed" | "ambiguous" | "skipped";
  run_id: string | null;
  renewal_notified: number;
  stale_notified: number;
};
export async function readRetentionSweep(id: string) {
  return queryOne<SweepRow>("select *,today::text as today from retention_sweeps where id=$1", [
    id,
  ]);
}
export async function claimRetentionSweep(input: {
  sweepId: string;
  today: string;
  cursor?: string | null;
}) {
  const leaseId = randomUUID();
  return transaction(async (db) => {
    await db.query(
      "insert into retention_sweeps(id,today,upper_id) values($1,$2,(select id from engagements where status='active' order by id desc limit 1)) on conflict(id) do nothing",
      [input.sweepId, input.today],
    );
    const sweep = (
      await db.query<SweepRow>(
        "select *,today::text as today from retention_sweeps where id=$1 for update",
        [input.sweepId],
      )
    ).rows[0];
    if (
      sweep.today !== input.today ||
      (input.cursor !== undefined && input.cursor !== sweep.cursor)
    )
      throw new AdminError("CONFLICT", "Sweep day or cursor differs from the durable checkpoint");
    if (sweep.complete) return { sweep, leaseId: null, busy: false };
    if (
      sweep.lease_owner &&
      sweep.lease_until &&
      new Date(sweep.lease_until).getTime() > Date.now()
    )
      return { sweep, leaseId: null, busy: true };
    // Lease expiry never authorizes resending a dispatch whose outcome is unknown.
    await db.query(
      "update retention_sweep_items set state='ambiguous',reason_code='LEASE_EXPIRED_AFTER_INTENT',updated_at=clock_timestamp() where sweep_id=$1 and action='dispatch' and state='intent'",
      [input.sweepId],
    );
    await db.query(
      "update retention_sweep_items e set state='ambiguous',reason_code='DISPATCH_UNCONFIRMED',updated_at=clock_timestamp() where e.sweep_id=$1 and e.action='engagement' and e.state='intent' and exists(select 1 from retention_sweep_items d where d.sweep_id=e.sweep_id and d.engagement_id=e.engagement_id and d.action='dispatch' and d.state='ambiguous')",
      [input.sweepId],
    );
    await db.query(
      "update retention_sweeps set lease_owner=$2,lease_until=clock_timestamp()+interval '90 seconds',updated_at=clock_timestamp() where id=$1",
      [input.sweepId, leaseId],
    );
    return { sweep, leaseId, busy: false };
  });
}
export async function requireSweepLease(db: Queryable, sweepId: string, leaseId: string) {
  const row = (
    await db.query(
      "select id from retention_sweeps where id=$1 and lease_owner=$2 and lease_until>clock_timestamp() and not complete for share",
      [sweepId, leaseId],
    )
  ).rows[0];
  if (!row) throw new AdminError("CONFLICT", "Sweep lease no longer belongs to this worker");
}
export async function listRetentionCandidates(sweep: SweepRow, limit: number) {
  return query<SweepCandidate>(
    "select e.id,e.client_id,e.owner,e.renewal_date::text as renewal_date,e.last_touch_at::text as last_touch_at,e.start_date::text as start_date,c.company_name as client_company_name from engagements e join clients c on c.id=e.client_id where e.status='active' and ($2::uuid is null or e.id>$2) and e.id<=$3::uuid and e.created_at<=(select created_at from retention_sweeps where id=$1) order by e.id limit $4",
    [sweep.id, sweep.cursor, sweep.upper_id, limit],
  );
}
export async function checkpointRetentionSweep(
  sweepId: string,
  leaseId: string,
  cursor: string | null,
  complete: boolean,
) {
  return transaction(async (db) => {
    await requireSweepLease(db, sweepId, leaseId);
    await db.query(
      "update retention_sweeps set cursor=$3,complete=$4,lease_owner=null,lease_until=null,updated_at=clock_timestamp() where id=$1 and lease_owner=$2",
      [sweepId, leaseId, cursor, complete],
    );
  });
}
export async function retentionSweepTotals(sweepId: string) {
  const row = await queryOne<{
    scanned: string;
    renewal_notified: string;
    stale_notified: string;
    failed: string;
    ambiguous: string;
    dispatched: string;
  }>(
    "select count(*) filter(where action='engagement' and state<>'intent')::text as scanned,coalesce(sum(renewal_notified) filter(where action='engagement'),0)::text as renewal_notified,coalesce(sum(stale_notified) filter(where action='engagement'),0)::text as stale_notified,count(*) filter(where action='engagement' and state='failed')::text as failed,count(*) filter(where action='engagement' and state='ambiguous')::text as ambiguous,count(*) filter(where action='dispatch' and state='acknowledged')::text as dispatched from retention_sweep_items where sweep_id=$1",
    [sweepId],
  );
  return {
    scanned: Number(row?.scanned ?? 0),
    notified: Number(row?.renewal_notified ?? 0) + Number(row?.stale_notified ?? 0),
    renewalNotified: Number(row?.renewal_notified ?? 0),
    staleNotified: Number(row?.stale_notified ?? 0),
    dispatched: Number(row?.dispatched ?? 0),
    failed: Number(row?.failed ?? 0),
    ambiguous: Number(row?.ambiguous ?? 0),
  };
}
