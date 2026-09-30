import { createHash } from "node:crypto";
import { buildFilters } from "@/server/db/query-builders";
import { AdminError } from "@/lib/admin/errors";
import { evaluateAuthorization } from "@/lib/admin/policy";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import { buildVisibilityScope } from "@/server/auth/visibility-scope.server";
import { query, queryOne, transaction, type Queryable } from "@/server/db/neon.server";
import type { ApprovalStatus, HumanApproval } from "@/lib/types";
import { createNotification, listApproverProfileIds } from "@/server/repositories/notifications";

export async function listApprovals(
  input: { status?: string } = {},
  context: RequestAuthorization,
): Promise<HumanApproval[]> {
  const where = buildFilters([["status", input.status]]);
  const scope = buildVisibilityScope(context, "human_approval", "ha");
  const predicate = scope.sql.replace(
    /\$(\d+)/g,
    (_, index: string) => "$" + (Number(index) + where.values.length),
  );
  const clause = where.sql ? where.sql + " and " + predicate : "where " + predicate;
  return query<HumanApproval>(
    `select ha.id, ha.agent_run_id, ha.approval_type, ha.requested_by,
            ha.assigned_to, ha.status, ha.row_version, ha.superseded_by,
            ha.recovery_outcome_code, ha.recovery_reason,
            jsonb_strip_nulls(jsonb_build_object('quote_id', ha.context_data->>'quote_id')) as context_data,
            left(ha.context_summary, 300) as context_summary,
            ha.reviewer_notes, ha.decided_at, ha.created_at
     from human_approvals ha
     ${clause}
     order by ha.created_at desc, ha.id desc`,
    [...where.values, ...scope.values],
  );
}

export type ApprovalQueuePageInput = {
  group: "pending" | "history";
  type?: string;
  cursor?: string;
  limit?: number;
};
export type ApprovalQueueItem = Omit<HumanApproval, "context_data"> & {
  quote_id: string | null;
};
export type ApprovalQueuePage = {
  items: ApprovalQueueItem[];
  nextCursor: string | null;
  total: number;
  counts: { pending: number; escalated: number; quoteSends: number };
};

function parseApprovalCursor(cursor: string | undefined, signature: string) {
  if (!cursor) return null;
  if (cursor.length > 2048) throw new AdminError("VALIDATION_FAILED", "Invalid approval cursor");
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    if (
      parsed.v !== 1 ||
      parsed.signature !== signature ||
      typeof parsed.createdAt !== "string" ||
      !Number.isFinite(Date.parse(parsed.createdAt)) ||
      typeof parsed.id !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(parsed.id)
    )
      throw new Error("cursor mismatch");
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    throw new AdminError("VALIDATION_FAILED", "Invalid approval cursor");
  }
}

/** Pending and decided lists are scoped, counted, and limited in PostgreSQL. */
export async function listApprovalQueuePage(
  input: ApprovalQueuePageInput,
  context: RequestAuthorization,
): Promise<ApprovalQueuePage> {
  if (!["pending", "history"].includes(input.group)) {
    throw new AdminError("VALIDATION_FAILED", "Invalid approval group");
  }
  const limit = Math.min(100, Math.max(1, Math.trunc(input.limit ?? 50)));
  const type = input.type || null;
  const signature = createHash("sha256")
    .update(
      JSON.stringify({
        actor: context.actor.profileId,
        group: input.group,
        type,
        sort: "created_at_desc_id_desc",
      }),
    )
    .digest("hex");
  const after = parseApprovalCursor(input.cursor, signature);
  const scope = buildVisibilityScope(context, "human_approval", "ha");
  const values: unknown[] = [...scope.values];
  const shifted = (sql: string, offset: number) =>
    sql.replace(/\$(\d+)/g, (_, index: string) => "$" + (Number(index) + offset));
  const clauses = [scope.sql];
  const from = "human_approvals ha";
  let claimable = "";
  if (context.actor.role === "manager" && input.group === "pending") {
    // Compute linked ownership only for the unassigned open subset, once per statement.
    // Materialization prevents repeating ownership in the outer count/page predicates.
    // Terminal history uses ordinary visibility and cannot discover claimable work.
    // Match the linked-subject ownership used by listClaimableApprovals, while applying
    // both view and decide overrides before counting or paging.
    const claimFrom =
      from +
      ` left join agent_runs ar on ar.id=ha.agent_run_id
      cross join lateral (select case
        when ar.status='waiting_approval' and ar.subject_type='lead'
          then (select l.assigned_to from leads l where l.id=ar.subject_id)
        when ar.status='waiting_approval' and ar.subject_type='engagement'
          then (select e.owner from engagements e where e.id=ar.subject_id)
        when ar.status='waiting_approval' and ar.subject_type='account'
          then (select a.account_owner from accounts a where a.id=ar.subject_id)
        when ar.status='waiting_approval' and ar.subject_type='campaign'
          then (select c.owner from campaigns c where c.id=ar.subject_id)
        when ar.status='waiting_approval' and ar.subject_type='client'
          then (select c.account_owner from clients c where c.id=ar.subject_id)
        when ar.status='waiting_approval' and ar.subject_type='task'
          then (select t.assigned_to from tasks t where t.id=ar.subject_id)
        when ar.status='waiting_approval' and ar.subject_type='quote'
          then (select coalesce(q.created_by,a.account_owner) from quotes q
                left join accounts a on a.id=q.account_id where q.id=ar.subject_id)
        when ha.agent_run_id is null and ha.approval_type='quote_send'
          then (select coalesce(q.created_by,a.account_owner) from quotes q
                left join accounts a on a.id=q.account_id
                where q.id::text=ha.context_data->>'quote_id')
      end as claim_owner offset 0) subject`;
    const claimView = buildVisibilityScope(context, "human_approval", "ha", {
      ownerSql: "subject.claim_owner",
    });
    const claimDecide = buildVisibilityScope(context, "human_approval", "ha", {
      ownerSql: "subject.claim_owner",
      capability: "approvals.decide",
    });
    const viewSql = shifted(claimView.sql, values.length);
    values.push(...claimView.values);
    const decideSql = shifted(claimDecide.sql, values.length);
    values.push(...claimDecide.values);
    claimable = `with claimable_approvals as materialized (
      select ha.id from ${claimFrom}
      where ha.assigned_to is null and ha.status in ('pending','escalated')
        and subject.claim_owner is not null and ${viewSql} and ${decideSql}
    )`;
    clauses[0] = `(${scope.sql} or ha.id in (select id from claimable_approvals))`;
  }
  const add = (value: unknown) => {
    values.push(value);
    return "$" + values.length;
  };
  clauses.push(
    input.group === "pending"
      ? "ha.status in ('pending','escalated')"
      : "ha.status not in ('pending','escalated')",
  );
  if (type) clauses.push("ha.approval_type=" + add(type));
  const where = "where " + clauses.join(" and ");
  const counts = await query<{
    total: number | string;
    pending: number | string;
    escalated: number | string;
    quote_sends: number | string;
  }>(
    `${claimable} select count(*)::int as total,
            count(*) filter (where ha.status='pending')::int as pending,
            count(*) filter (where ha.status='escalated')::int as escalated,
            count(*) filter (where ha.status='pending' and
              ha.approval_type='quote_send')::int as quote_sends
       from ${from} ${where}`,
    values,
  );
  const total = Number(counts[0]?.total ?? 0);
  const pageValues = [...values];
  let pageWhere = where;
  if (after) {
    const dateIndex = pageValues.push(after.createdAt);
    const idIndex = pageValues.push(after.id);
    pageWhere +=
      " and (ha.created_at,ha.id) < ($" + dateIndex + "::timestamptz,$" + idIndex + "::uuid)";
  }
  const limitIndex = pageValues.push(limit + 1);
  const rows = await query<ApprovalQueueItem>(
    `${claimable} select ha.id,ha.agent_run_id,ha.approval_type,ha.requested_by,
            ha.assigned_to,ha.status,ha.row_version,ha.superseded_by,
            ha.recovery_outcome_code,ha.recovery_reason,
            ha.context_data->>'quote_id' as quote_id,
            left(ha.context_summary,300) as context_summary,
            ha.reviewer_notes,ha.decided_at,ha.created_at
       from ${from} ${pageWhere}
       order by ha.created_at desc,ha.id desc
       limit $${limitIndex}`,
    pageValues,
  );
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      hasMore && last
        ? Buffer.from(
            JSON.stringify({
              v: 1,
              signature,
              createdAt: new Date(last.created_at).toISOString(),
              id: last.id,
            }),
          ).toString("base64url")
        : null,
    total,
    counts: {
      pending: Number(counts[0]?.pending ?? 0),
      escalated: Number(counts[0]?.escalated ?? 0),
      quoteSends: Number(counts[0]?.quote_sends ?? 0),
    },
  };
}

/** Empty-state timestamp without loading the decided approval history. */
export async function getLatestDecidedApprovalAt(
  context: RequestAuthorization,
): Promise<string | null> {
  const scope = buildVisibilityScope(context, "human_approval", "ha");
  const rows = await query<{ latest: string | Date | null }>(
    `select max(ha.decided_at) as latest from human_approvals ha
      where ${scope.sql} and ha.decided_at is not null`,
    scope.values,
  );
  return rows[0]?.latest ? new Date(rows[0].latest).toISOString() : null;
}

/** Discover unassigned review work only through a linked, manager-owned subject. */
export async function listClaimableApprovals(
  context: RequestAuthorization,
): Promise<HumanApproval[]> {
  if (context.actor.role !== "manager" || context.actor.status !== "active") return [];
  const ownerIds = [context.actor.profileId, ...context.actor.directReportIds];
  const rows = await query<HumanApproval & { claim_owner: string }>(
    `select ha.id,ha.agent_run_id,ha.approval_type,ha.requested_by,ha.assigned_to,
            ha.status,ha.row_version,ha.superseded_by,ha.recovery_outcome_code,
            ha.recovery_reason,
            jsonb_strip_nulls(jsonb_build_object('quote_id',ha.context_data->>'quote_id')) as context_data,
            left(ha.context_summary,300) as context_summary,
            ha.reviewer_notes,ha.decided_at,ha.created_at,
            subject.owner_profile_id as claim_owner
       from human_approvals ha
       left join agent_runs ar on ar.id=ha.agent_run_id
       cross join lateral (
         select case
           when ar.status='waiting_approval' and ar.subject_type='lead'
             then (select l.assigned_to from leads l where l.id=ar.subject_id)
           when ar.status='waiting_approval' and ar.subject_type='engagement'
             then (select e.owner from engagements e where e.id=ar.subject_id)
           when ar.status='waiting_approval' and ar.subject_type='account'
             then (select a.account_owner from accounts a where a.id=ar.subject_id)
           when ar.status='waiting_approval' and ar.subject_type='campaign'
             then (select c.owner from campaigns c where c.id=ar.subject_id)
           when ar.status='waiting_approval' and ar.subject_type='client'
             then (select c.account_owner from clients c where c.id=ar.subject_id)
           when ar.status='waiting_approval' and ar.subject_type='task'
             then (select t.assigned_to from tasks t where t.id=ar.subject_id)
           when ar.status='waiting_approval' and ar.subject_type='quote'
             then (select coalesce(q.created_by,a.account_owner) from quotes q
                   left join accounts a on a.id=q.account_id where q.id=ar.subject_id)
           when ha.agent_run_id is null and ha.approval_type='quote_send'
             then (select coalesce(q.created_by,a.account_owner) from quotes q
                   left join accounts a on a.id=q.account_id
                   where q.id::text=ha.context_data->>'quote_id')
         end as owner_profile_id
       ) subject
      where ha.assigned_to is null and ha.status in ('pending','escalated')
        and subject.owner_profile_id=any($1::text[])
      order by ha.created_at desc,ha.id desc
      limit 200`,
    [ownerIds],
  );
  return rows.flatMap(({ claim_owner, ...approval }) => {
    const target = {
      resourceType: "human_approval",
      resourceId: approval.id,
      ownerProfileId: claim_owner,
    };
    const view = evaluateAuthorization({
      actor: context.actor,
      capability: "approvals.view",
      target,
      overrides: context.overrides,
      now: context.now,
    });
    const decide = evaluateAuthorization({
      actor: context.actor,
      capability: "approvals.decide",
      target,
      overrides: context.overrides,
      now: context.now,
    });
    return view.allowed && decide.allowed ? [approval] : [];
  });
}

export async function listActiveApprovals() {
  return query<HumanApproval>(
    `
      select *
      from human_approvals
      where status in ('pending','escalated')
      order by created_at desc
    `,
  );
}

export async function getApproval(id: string, db?: Queryable) {
  const approval = await queryOne<HumanApproval>(
    "select * from human_approvals where id = $1",
    [id],
    db,
  );
  if (!approval) throw new Error("Approval not found");
  return approval;
}

/**
 * The open approval for a quote, if there is one.
 *
 * `human_approvals` has no `quote_id` column, so the link lives in `context_data`. The
 * `status = 'pending'` filter comes first and keeps this cheap: decided approvals accumulate,
 * open ones do not. If that stops holding, the fix is an expression index —
 * `activity_logs_diff_account_id_idx` (migration 008) is the precedent.
 */
export async function findPendingApprovalForQuote(quoteId: string, db?: Queryable) {
  return queryOne<HumanApproval>(
    `
      select * from human_approvals
       where approval_type = 'quote_send'
         and status in ('pending','escalated')
         and context_data->>'quote_id' = $1
       limit 1
    `,
    [quoteId],
    db,
  );
}

export async function createApproval(
  input: {
    agent_run_id?: string | null;
    approval_type:
      | "quote_send"
      | "message_send"
      | "discount"
      | "qualification_review"
      | "cs_risk_review";
    requested_by?: string | null;
    assigned_to?: string | null;
    context_data: unknown;
    context_summary?: string | null;
    status?: ApprovalStatus;
  },
  db?: Queryable,
) {
  const approval = await queryOne<HumanApproval>(
    `
      insert into human_approvals
        (agent_run_id, approval_type, requested_by, assigned_to, status, context_data, context_summary)
      values
        ($1, $2, $3, $4, coalesce($5, 'pending'), $6::jsonb, $7)
      returning *
    `,
    [
      input.agent_run_id ?? null,
      input.approval_type,
      input.requested_by ?? null,
      input.assigned_to ?? null,
      input.status ?? null,
      JSON.stringify(input.context_data),
      input.context_summary ?? null,
    ],
    db,
  );

  if (!approval) throw new Error("Failed to create approval");

  const approverIds = await listApproverProfileIds();
  for (const userId of approverIds) {
    await createNotification(
      {
        user_id: userId,
        type: "approval_pending",
        title: `New approval: ${input.approval_type.replace(/_/g, " ")}`,
        body: input.context_summary ?? null,
        object_type: "approval",
        object_id: approval.id,
        dedupe_key: `approval_pending:${approval.id}:${userId}`,
      },
      db,
    );
  }

  return approval;
}

export type ApprovalDecisionWrite = {
  id: string;
  decision: "approved" | "rejected" | "escalated";
  notes?: string;
  expectedVersion?: number;
};

/** One locked transition, deliberately without its own begin/commit for command composition. */
export async function decideApprovalInTransaction(
  db: Queryable,
  context: RequestAuthorization,
  input: ApprovalDecisionWrite,
  beforeTransition?: (approval: HumanApproval) => Promise<void>,
): Promise<HumanApproval> {
  const current = (
    await db.query<HumanApproval>("select * from human_approvals where id=$1 for update", [
      input.id,
    ])
  ).rows[0];
  if (!current) throw new AdminError("CONFLICT", "Approval is unavailable");
  if (input.expectedVersion !== undefined && current.row_version !== input.expectedVersion) {
    throw new AdminError("STALE_ADMIN_STATE", "Approval changed since it was opened");
  }
  if (current.status !== "pending" && current.status !== "escalated") {
    throw new AdminError("CONFLICT", "Approval already has a terminal decision");
  }
  const decision = evaluateAuthorization({
    actor: context.actor,
    capability: "approvals.decide",
    target: {
      resourceType: "human_approval",
      resourceId: current.id,
      ...(current.assigned_to ? { ownerProfileId: current.assigned_to } : {}),
    },
    overrides: context.overrides,
    now: new Date(),
  });
  if (!decision.allowed) {
    throw new AdminError(
      decision.reason === "outside_scope" ? "OUTSIDE_SCOPE" : "FORBIDDEN",
      "Approval decision is not authorized",
    );
  }
  await beforeTransition?.(current);

  const updated = (
    await db.query<HumanApproval>(
      `update human_approvals
     set status=$2, reviewer_notes=$3,
         decided_at=case when $2='escalated' then null else now() end
     where id=$1 and row_version=$4 and status in ('pending','escalated')
     returning *`,
      [input.id, input.decision, input.notes ?? null, current.row_version],
    )
  ).rows[0];
  if (!updated) throw new AdminError("STALE_ADMIN_STATE", "Approval changed during decision");

  if (updated.agent_run_id && input.decision !== "escalated") {
    await db.query(
      `update agent_runs
       set status='completed', human_review_required=false
       where id=$1 and status='waiting_approval'`,
      [updated.agent_run_id],
    );
  }
  await db.query(
    `insert into activity_logs (actor_type,actor_id,action,object_type,object_id)
     values ('user',$1,$2,'approval',$3)`,
    [context.actor.profileId, `${input.decision} approval`, input.id],
  );
  return updated;
}

/**
 * Route a pending approval to a reviewer, or clear the assignment.
 *
 * A terminal approval cannot be reassigned. Pending and escalated records remain open and
 * may be routed, but a closed decision retains its historical reviewer.
 *
 * `assignedTo: null` unassigns. That is a real action — an approval routed to the wrong person
 * needs a way back to the unassigned pool — not an error.
 */
export async function assignApproval(
  input: { id: string; assignedTo: string | null; expectedVersion?: number },
  context: RequestAuthorization,
  existingDb?: Queryable,
): Promise<HumanApproval> {
  const run = async (db: Queryable) => {
    const current = (
      await db.query<HumanApproval>("select * from human_approvals where id=$1 for update", [
        input.id,
      ])
    ).rows[0];
    if (!current) throw new AdminError("CONFLICT", "Approval is unavailable");
    if (input.expectedVersion !== undefined && current.row_version !== input.expectedVersion) {
      throw new AdminError("STALE_ADMIN_STATE", "Approval changed since it was opened");
    }
    if (current.status !== "pending" && current.status !== "escalated") {
      throw new AdminError("CONFLICT", "A decided approval cannot be reassigned");
    }
    const permission = evaluateAuthorization({
      actor: context.actor,
      capability: "approvals.decide",
      target: {
        resourceType: "human_approval",
        resourceId: current.id,
        ...(current.assigned_to ? { ownerProfileId: current.assigned_to } : {}),
      },
      overrides: context.overrides,
      now: new Date(),
    });
    if (!permission.allowed)
      throw new AdminError("FORBIDDEN", "Approval routing is not authorized");

    if (input.assignedTo) {
      const profile = (
        await db.query<{ id: string }>("select id from profiles where id=$1 and status='active'", [
          input.assignedTo,
        ])
      ).rows[0];
      if (!profile) throw new AdminError("VALIDATION_FAILED", "Assignee is unavailable");
    }
    const updated = (
      await db.query<HumanApproval>(
        `update human_approvals set assigned_to=$2
       where id=$1 and row_version=$3 and status in ('pending','escalated')
       returning *`,
        [input.id, input.assignedTo, current.row_version],
      )
    ).rows[0];
    if (!updated) throw new AdminError("STALE_ADMIN_STATE", "Approval changed during routing");
    return updated;
  };
  return existingDb ? run(existingDb) : transaction(run);
}
