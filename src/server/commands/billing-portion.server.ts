import { evaluateAuthorization } from "@/lib/admin/policy";
import type { PermissionOverride, UserRole } from "@/lib/admin/types";
import { OperationError } from "@/lib/operations/errors";
import type { JobSheetPortion } from "@/lib/types";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import { transaction, type Queryable } from "@/server/db/neon.server";
import { claimCommandReceipt, completeCommandReceipt } from "@/server/commands/receipts.server";

type LockedPortion = JobSheetPortion & {
  row_version: number;
  owner_profile_id: string | null;
  job_sheet_status: string;
};

type OverrideRow = {
  profile_id: string;
  capability: "job_sheets.update_billing";
  effect: "allow" | "deny";
  department_id: string | null;
  team_id: string | null;
  resource_type: string | null;
  resource_id: string | null;
  expires_at: string | null;
  revoked_at: string | null;
};

async function lockPortionAndAuthorize(
  db: Queryable,
  context: RequestAuthorization,
  portionId: string,
): Promise<LockedPortion> {
  const portion = (
    await db.query<LockedPortion>(
      `select p.*, coalesce(s.sales_owner,s.accounting_owner) as owner_profile_id,
              s.status as job_sheet_status
       from job_sheet_portions p
       join job_sheets s on s.id=p.job_sheet_id
       where p.id=$1 for update of p,s`,
      [portionId],
    )
  ).rows[0];
  if (!portion) throw new OperationError("NOT_FOUND", "Billing portion is unavailable");
  const profile = (
    await db.query<{ role: UserRole; status: string }>(
      "select role,status from profiles where id=$1 for share",
      [context.actor.profileId],
    )
  ).rows[0];
  if (!profile || profile.status !== "active") {
    throw new OperationError("FORBIDDEN", "Billing change is not authorized");
  }
  const rows = (
    await db.query<OverrideRow>(
      `select profile_id,capability,effect,department_id,team_id,resource_type,
              resource_id,expires_at,revoked_at
       from permission_overrides where profile_id=$1 and revoked_at is null
         and (expires_at is null or expires_at>now())`,
      [context.actor.profileId],
    )
  ).rows;
  const overrides: PermissionOverride[] = rows.map((row) => ({
    profileId: row.profile_id,
    capability: row.capability,
    effect: row.effect,
    departmentId: row.department_id,
    teamId: row.team_id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  }));
  const decision = evaluateAuthorization({
    actor: { ...context.actor, role: profile.role, status: "active" },
    capability: "job_sheets.update_billing",
    target: {
      resourceType: "job_sheet_portion",
      resourceId: portion.id,
      ...(portion.owner_profile_id ? { ownerProfileId: portion.owner_profile_id } : {}),
    },
    overrides,
    now: new Date(),
  });
  if (!decision.allowed) throw new OperationError("FORBIDDEN", "Billing change is not authorized");
  return portion;
}

type PortionReceipt = { portionId: string; rowVersion: number };

async function claimXeroReceipt(
  db: Queryable,
  context: RequestAuthorization,
  portion: LockedPortion,
  scope: string,
  idempotencyKey: string,
  payload: unknown,
): Promise<{ kind: "new"; id: string } | { kind: "replay"; portion: JobSheetPortion }> {
  const claim = await claimCommandReceipt<PortionReceipt>(db, {
    scope,
    actorId: context.actor.profileId,
    idempotencyKey,
    payload,
  });
  if (claim.kind === "new") return claim;
  if (claim.result.portionId !== portion.id || claim.result.rowVersion !== portion.row_version) {
    throw new OperationError("CONFLICT", "Billing portion changed after the original command");
  }
  const current = (
    await db.query<JobSheetPortion>("select * from job_sheet_portions where id=$1", [portion.id])
  ).rows[0];
  if (!current) throw new OperationError("NOT_FOUND", "Billing portion is unavailable");
  return { kind: "replay", portion: current };
}

async function completeXeroReceipt(
  db: Queryable,
  claimId: string,
  portion: JobSheetPortion,
): Promise<void> {
  await completeCommandReceipt(db, claimId, {
    portionId: portion.id,
    rowVersion: portion.row_version,
  } satisfies PortionReceipt);
}

export type ConfirmXeroEntryInput = {
  portionId: string;
  invoiceNumber?: string | null;
  reference?: string | null;
  invoiceDate: string;
  expectedVersion: number;
  idempotencyKey: string;
};

/** A human records external invoice evidence; this does not call Xero. */
export async function confirmXeroEntryCommand(
  context: RequestAuthorization,
  input: ConfirmXeroEntryInput,
): Promise<JobSheetPortion> {
  return transaction(async (db) => {
    const portion = await lockPortionAndAuthorize(db, context, input.portionId);
    const claim = await claimXeroReceipt(
      db,
      context,
      portion,
      "xero.confirm",
      input.idempotencyKey,
      input,
    );
    if (claim.kind === "replay") return claim.portion;
    if (portion.row_version !== input.expectedVersion) {
      throw new OperationError("CONFLICT", "Billing portion changed since it was opened");
    }
    if (portion.status !== "planned" || portion.job_sheet_status === "cancelled") {
      throw new OperationError("INVALID_STATE", "Only a planned active portion can be confirmed");
    }
    const invoiceNumber = input.invoiceNumber?.trim() || null;
    const reference = input.reference?.trim() || null;
    if (!invoiceNumber && !reference) {
      throw new OperationError("INVALID_INPUT", "Invoice number or reference is required");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.invoiceDate)) {
      throw new OperationError("INVALID_INPUT", "Invoice date is required");
    }
    const updated = (
      await db.query<JobSheetPortion>(
        `update job_sheet_portions
         set xero_invoice_number=$2, xero_invoice_reference=$3,
             xero_invoice_date=$4::date, status='entered_in_xero',
             xero_confirmed_at=now(), xero_confirmed_by=$5
         where id=$1 and row_version=$6 and status='planned'
         returning *`,
        [
          portion.id,
          invoiceNumber,
          reference,
          input.invoiceDate,
          context.actor.profileId,
          input.expectedVersion,
        ],
      )
    ).rows[0];
    if (!updated) throw new OperationError("CONFLICT", "Billing portion changed");
    await completeXeroReceipt(db, claim.id, updated);
    return updated;
  });
}

export type UpdateXeroNotesInput = {
  portionId: string;
  notes: string | null;
  expectedVersion: number;
  idempotencyKey: string;
};

export async function updateXeroNotesCommand(
  context: RequestAuthorization,
  input: UpdateXeroNotesInput,
): Promise<JobSheetPortion> {
  return transaction(async (db) => {
    const portion = await lockPortionAndAuthorize(db, context, input.portionId);
    const claim = await claimXeroReceipt(
      db,
      context,
      portion,
      "xero.notes",
      input.idempotencyKey,
      input,
    );
    if (claim.kind === "replay") return claim.portion;
    if (portion.row_version !== input.expectedVersion) {
      throw new OperationError("CONFLICT", "Billing portion changed since it was opened");
    }
    const notes = input.notes?.trim() || null;
    const updated = (
      await db.query<JobSheetPortion>(
        `update job_sheet_portions set xero_notes=$2
         where id=$1 and row_version=$3 returning *`,
        [portion.id, notes, input.expectedVersion],
      )
    ).rows[0];
    if (!updated) throw new OperationError("CONFLICT", "Billing portion changed");
    await completeXeroReceipt(db, claim.id, updated);
    return updated;
  });
}

export type CorrectXeroEntryInput = {
  portionId: string;
  expectedVersion: number;
  idempotencyKey: string;
  reason: string;
  patch: {
    status: "planned" | "entered_in_xero";
    invoiceNumber?: string | null;
    reference?: string | null;
    invoiceDate?: string | null;
  };
};

export async function correctXeroEntryCommand(
  context: RequestAuthorization,
  input: CorrectXeroEntryInput,
): Promise<JobSheetPortion> {
  return transaction(async (db) => {
    const portion = await lockPortionAndAuthorize(db, context, input.portionId);
    const claim = await claimXeroReceipt(
      db,
      context,
      portion,
      "xero.correct",
      input.idempotencyKey,
      input,
    );
    if (claim.kind === "replay") return claim.portion;
    if (portion.row_version !== input.expectedVersion) {
      throw new OperationError("CONFLICT", "Billing portion changed since it was opened");
    }
    if (portion.status !== "entered_in_xero") {
      throw new OperationError("INVALID_STATE", "Only recorded Xero entries can be corrected");
    }
    const reason = input.reason.trim();
    if (!reason) throw new OperationError("INVALID_INPUT", "Correction reason is required");
    const returningToPlan = input.patch.status === "planned";
    const invoiceNumber = returningToPlan
      ? null
      : input.patch.invoiceNumber === undefined
        ? portion.xero_invoice_number
        : input.patch.invoiceNumber?.trim() || null;
    const reference = returningToPlan
      ? null
      : input.patch.reference === undefined
        ? portion.xero_invoice_reference
        : input.patch.reference?.trim() || null;
    const invoiceDate = returningToPlan
      ? null
      : input.patch.invoiceDate === undefined
        ? portion.xero_invoice_date
        : input.patch.invoiceDate;
    if (!returningToPlan && ((!invoiceNumber && !reference) || !invoiceDate)) {
      throw new OperationError("INVALID_INPUT", "Corrected entry needs invoice identity and date");
    }
    const updated = (
      await db.query<JobSheetPortion>(
        `update job_sheet_portions
         set status=$2, xero_invoice_number=$3, xero_invoice_reference=$4,
             xero_invoice_date=$5::date, xero_corrected_at=now(),
             xero_corrected_by=$6, xero_correction_reason=$7
         where id=$1 and row_version=$8 and status='entered_in_xero'
         returning *`,
        [
          portion.id,
          input.patch.status,
          invoiceNumber,
          reference,
          invoiceDate,
          context.actor.profileId,
          reason,
          input.expectedVersion,
        ],
      )
    ).rows[0];
    if (!updated) throw new OperationError("CONFLICT", "Billing portion changed");
    await completeXeroReceipt(db, claim.id, updated);
    return updated;
  });
}
