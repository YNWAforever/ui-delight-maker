import { randomUUID } from "node:crypto";
import type { BulkAction } from "@/lib/operations/bulk-contract";
import { requireCapability, type RequestAuthorization } from "@/server/auth/authorization.server";
import { queryOne, type Queryable } from "@/server/db/neon.server";
import { decideApprovalCommand } from "@/server/commands/approval-decision.server";
import { decideQuoteSendInTransaction } from "@/server/commands/quote-lifecycle.server";
import { assignApproval } from "@/server/repositories/approvals";
import { createAdminTeamsRepository } from "@/server/repositories/admin-teams";
import { updateLead } from "@/server/repositories/leads";
import { updateTask } from "@/server/repositories/tasks";
import { BulkItemError, type BulkActionHandler } from "./bulk.server";
import { agentRecoveryBulkHandler } from "@/server/commands/agent-bulk-recovery.server";

type VersionedRow = {
  id: string;
  row_version: number;
  status: string;
  assigned_to: string | null;
  title?: string;
  company_name?: string;
  approval_type?: string;
  context_summary?: string | null;
  context_data?: Record<string, unknown> | null;
  locked_at?: string | null;
  job_sheet_status?: string;
  job_sheet_id?: string;
};
type PersonRow = { id: string; name: string | null; status: string };

function category(
  action: BulkAction,
): "task" | "lead" | "approval" | "team" | "job_sheet" | "job_sheet_portion" | null {
  if (action.type === "job_sheet.assign") return "job_sheet";
  if (action.type === "job_sheet.invoice_date") return "job_sheet_portion";
  if (action.type.startsWith("task.")) return "task";
  if (action.type.startsWith("lead.")) return "lead";
  if (action.type.startsWith("approval.")) return "approval";
  if (action.type === "team.add_member") return "team";
  return null;
}

async function assertAllowed(
  context: RequestAuthorization,
  action: BulkAction,
  id: string,
): Promise<void> {
  const kind = category(action);
  if (!kind)
    throw new BulkItemError("failed", "ACTION_UNAVAILABLE", "Bulk action is unavailable", false);
  try {
    if (kind === "team" && action.type === "team.add_member") {
      await requireCapability("teams.manage", { teamId: action.teamId, profileId: id }, context);
    } else {
      const resourceType = kind === "approval" ? "human_approval" : kind;
      const capability =
        kind === "task"
          ? "tasks.update"
          : kind === "lead"
            ? "leads.update"
            : kind === "approval"
              ? "approvals.decide"
              : "job_sheets.update_billing";
      await requireCapability(capability, { resourceType, resourceId: id }, context);
    }
  } catch {
    throw new BulkItemError("forbidden", "FORBIDDEN", "Item is outside the permitted scope", false);
  }
}

async function currentRow(
  action: BulkAction,
  id: string,
  db?: Queryable,
  lock = false,
): Promise<VersionedRow | null> {
  const kind = category(action);
  if (!kind || kind === "team") return null;
  if (kind === "job_sheet") {
    return queryOne<VersionedRow>(
      "select id,row_version,status,accounting_owner as assigned_to,number as title,locked_at from job_sheets where id=$1" +
        (lock ? " for update" : ""),
      [id],
      db,
    );
  }
  if (kind === "job_sheet_portion") {
    return queryOne<VersionedRow>(
      `select p.id,p.row_version,p.status,null::text as assigned_to,p.name as title,
              p.job_sheet_id,js.status as job_sheet_status,js.locked_at
         from job_sheet_portions p join job_sheets js on js.id=p.job_sheet_id
        where p.id=$1` + (lock ? " for update of p,js" : ""),
      [id],
      db,
    );
  }
  const table = kind === "task" ? "tasks" : kind === "lead" ? "leads" : "human_approvals";
  const extra =
    kind === "task"
      ? "title"
      : kind === "lead"
        ? "company_name"
        : "approval_type,context_summary,context_data";
  return queryOne<VersionedRow>(
    "select id,row_version,status,assigned_to," +
      extra +
      " from " +
      table +
      " where id=$1" +
      (lock ? " for update" : ""),
    [id],
    db,
  );
}

async function previewTeam(
  context: RequestAuthorization,
  id: string,
  action: Extract<BulkAction, { type: "team.add_member" }>,
) {
  const team = await queryOne<{ id: string; status: string }>(
    "select id,status from teams where id=$1",
    [action.teamId],
  );
  const person = await queryOne<PersonRow>("select id,name,status from profiles where id=$1", [id]);
  if (!team || !person)
    return { eligible: false, summary: null, version: null, status: "not_found" as const };
  try {
    await assertAllowed(context, action, id);
  } catch {
    return { eligible: false, summary: null, version: 0, status: "forbidden" as const };
  }
  if (team.status !== "active" || person.status !== "active") {
    return { eligible: false, summary: null, version: 0, status: "forbidden" as const };
  }
  const duplicate = await queryOne<{ id: string }>(
    "select id from team_memberships where team_id=$1 and profile_id=$2 and ends_at is null",
    [action.teamId, id],
  );
  if (duplicate) return { eligible: false, summary: null, version: 0, status: "stale" as const };
  return { eligible: true, summary: person.name || "Name unavailable", version: 0 };
}

export const productionBulkHandler: BulkActionHandler = {
  async preview(context, id, action) {
    if (action.type === "agent.recover")
      return agentRecoveryBulkHandler.preview(context, id, action);
    if (action.type === "team.add_member") return previewTeam(context, id, action);
    const row = await currentRow(action, id);
    if (!row) return { eligible: false, summary: null, version: null, status: "not_found" };
    try {
      await assertAllowed(context, action, id);
    } catch {
      return { eligible: false, summary: null, version: row.row_version, status: "forbidden" };
    }
    if (category(action) === "approval" && row.status !== "pending" && row.status !== "escalated") {
      return { eligible: false, summary: null, version: row.row_version, status: "stale" };
    }
    if (
      (action.type === "job_sheet.assign" &&
        (row.status !== "accounting_review" || Boolean(row.locked_at))) ||
      (action.type === "job_sheet.invoice_date" &&
        (row.status !== "planned" || row.job_sheet_status === "accepted" || Boolean(row.locked_at)))
    ) {
      return { eligible: false, summary: null, version: row.row_version, status: "stale" };
    }
    return {
      eligible: true,
      summary: (row.title ?? row.company_name ?? row.context_summary ?? "").slice(0, 150),
      version: row.row_version,
      ...(action.type === "approval.decide" && row.approval_type
        ? { groupKey: row.approval_type }
        : {}),
    };
  },
  async apply(context, id, action, expectedVersion, db, operationId) {
    if (action.type === "agent.recover")
      return agentRecoveryBulkHandler.apply(context, id, action, expectedVersion, db, operationId);
    if (action.type === "team.add_member") {
      if (expectedVersion !== 0) {
        throw new BulkItemError("stale", "STALE", "Membership preview changed", false);
      }
      await assertAllowed(context, action, id);
      const team = await queryOne<{ status: string }>(
        "select status from teams where id=$1 for update",
        [action.teamId],
        db,
      );
      const person = await queryOne<PersonRow>(
        "select id,name,status from profiles where id=$1 for update",
        [id],
        db,
      );
      if (!team || !person)
        throw new BulkItemError("not_found", "NOT_FOUND", "Team or person is unavailable", false);
      if (team.status !== "active" || person.status !== "active") {
        throw new BulkItemError("forbidden", "INELIGIBLE", "Team or person is inactive", false);
      }
      const duplicate = await queryOne<{ id: string }>(
        "select id from team_memberships where team_id=$1 and profile_id=$2 and ends_at is null",
        [action.teamId, id],
        db,
      );
      if (duplicate)
        throw new BulkItemError("stale", "DUPLICATE", "Membership already exists", false);
      const repository = createAdminTeamsRepository({
        transaction: async <T>(work: (client: Queryable) => Promise<T>) => work(db),
      });
      await repository.upsertTeamMembership(
        {
          teamId: action.teamId,
          profileId: id,
          membershipRole: "member",
          startsAt: action.startsAt ?? null,
          endsAt: action.endsAt ?? null,
        },
        context.actor.profileId,
      );
      return {};
    }

    const row = await currentRow(action, id, db, true);
    if (!row) throw new BulkItemError("not_found", "NOT_FOUND", "Item is unavailable", false);
    if (expectedVersion === null || row.row_version !== expectedVersion) {
      throw new BulkItemError("stale", "STALE", "Item changed since preview", false);
    }
    await assertAllowed(context, action, id);
    if (action.type === "task.assign" || action.type === "lead.assign") {
      const active = await queryOne<{ id: string }>(
        "select id from profiles where id=$1 and status='active'",
        [action.profileId],
        db,
      );
      if (!active)
        throw new BulkItemError("failed", "INVALID_ASSIGNEE", "Assignee is unavailable", false);
    }

    if (action.type === "job_sheet.assign") {
      if (row.status !== "accounting_review" || row.locked_at)
        throw new BulkItemError("stale", "LOCKED", "Job Sheet handoff is locked", false);
      const owner = await queryOne<{ id: string }>(
        "select id from profiles where id=$1 and status='active' and role in ('accounting','admin','super_admin') for share",
        [action.profileId],
        db,
      );
      if (!owner)
        throw new BulkItemError(
          "failed",
          "INVALID_OWNER",
          "Accounting owner is unavailable",
          false,
        );
      const updated = await queryOne<{ id: string }>(
        "update job_sheets set accounting_owner=$2,updated_at=now() where id=$1 and status='accounting_review' and locked_at is null returning id",
        [id, action.profileId],
        db,
      );
      if (!updated)
        throw new BulkItemError("stale", "LOCKED", "Job Sheet handoff is locked", false);
      await db.query(
        "insert into job_sheet_activity(job_sheet_id,actor_id,action,diff_data) values($1,$2,'bulk_owner_assigned',$3::jsonb)",
        [id, context.actor.profileId, JSON.stringify({ accounting_owner: action.profileId })],
      );
    } else if (action.type === "job_sheet.invoice_date") {
      if (row.status !== "planned" || row.job_sheet_status === "accepted" || row.locked_at)
        throw new BulkItemError("stale", "LOCKED", "Billing portion is locked", false);
      const updated = await queryOne<{ id: string }>(
        "update job_sheet_portions set target_invoice_date=$2,updated_at=now() where id=$1 and status='planned' returning id",
        [id, action.targetInvoiceDate],
        db,
      );
      if (!updated) throw new BulkItemError("stale", "LOCKED", "Billing portion is locked", false);
      await db.query(
        "insert into job_sheet_activity(job_sheet_id,actor_id,action,diff_data) values($1,$2,'bulk_invoice_date_updated',$3::jsonb)",
        [
          row.job_sheet_id,
          context.actor.profileId,
          JSON.stringify({ portion_id: id, target_invoice_date: action.targetInvoiceDate }),
        ],
      );
    } else if (action.type === "task.assign") {
      await updateTask(id, { assigned_to: action.profileId }, db);
    } else if (action.type === "task.due") {
      await updateTask(id, { due_date: action.dueDate }, db);
    } else if (action.type === "task.priority") {
      await updateTask(id, { priority: action.priority }, db);
    } else if (action.type === "task.status") {
      await updateTask(id, { status: action.status }, db);
    } else if (action.type === "lead.assign") {
      await updateLead(id, { assigned_to: action.profileId }, db);
    } else if (action.type === "lead.status") {
      await updateLead(id, { status: action.status }, db);
    } else if (action.type === "approval.assign") {
      await assignApproval(
        { id, assignedTo: action.profileId, expectedVersion: row.row_version },
        context,
        db,
      );
    } else if (action.type === "approval.decide") {
      if (row.approval_type === "quote_send") {
        const quoteId = row.context_data?.quote_id;
        if (typeof quoteId !== "string") {
          throw new BulkItemError("failed", "MISSING_QUOTE", "Quote context is unavailable", false);
        }
        await decideQuoteSendInTransaction(db, context, {
          id: quoteId,
          approvalId: id,
          decision: action.decision,
          notes: action.notes,
          expectedVersion: row.row_version,
        });
      } else {
        await decideApprovalCommand(
          context,
          {
            id,
            decision: action.decision,
            notes: action.notes,
            expectedVersion: row.row_version,
            idempotencyKey: randomUUID(),
          },
          db,
        );
      }
    } else {
      throw new BulkItemError("failed", "ACTION_UNAVAILABLE", "Bulk action is unavailable", false);
    }
    return { resultingVersion: row.row_version + 1 };
  },
};
