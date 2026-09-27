import { createHash, randomUUID } from "node:crypto";
import { parseImportCsvDetailed, type ImportRow } from "@/lib/csv-import";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import { query, queryOne, transaction, type Queryable } from "@/server/db/neon.server";

export type ImportKind = "lead" | "client" | "event";
export type ImportRowStatus =
  | "succeeded"
  | "failed"
  | "forbidden"
  | "stale"
  | "invalid"
  | "skipped"
  | "ambiguous";
export type ImportSessionState = "preview" | "paused" | "running" | "completed" | "expired";
export type ImportRowResult = {
  recordIndex: number;
  sourceLine: number;
  action: string;
  status: ImportRowStatus | null;
  errors: string[];
  id: string | null;
  retryable: boolean;
};
export type ImportResult = {
  sessionId: string;
  state: ImportSessionState;
  processed: number;
  total: number;
  rows: ImportRowResult[];
};
export type ImportPreview = ImportResult & {
  previewHash: string;
  previewExpiresAt: string;
};
export class ImportRowError extends Error {
  constructor(
    readonly status: Exclude<ImportRowStatus, "succeeded">,
    readonly code: string,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}
export type PreparedImportRow = {
  status: ImportRowStatus | null;
  action: string;
  errors: string[];
  targetId?: string | null;
  expectedVersion?: number | null;
};
export type ImportHandler = {
  prepareRow(
    context: RequestAuthorization,
    kind: ImportKind,
    values: ImportRow,
    input: { sourceNamespace: string | null; campaignId: string | null; recordIndex: number },
  ): Promise<PreparedImportRow>;
  applyRow(
    context: RequestAuthorization,
    kind: ImportKind,
    values: ImportRow,
    prepared: {
      action: string;
      targetId: string | null;
      expectedVersion: number | null;
      sourceNamespace: string | null;
      campaignId: string | null;
      sessionId: string;
    },
    db: Queryable,
  ): Promise<{ action: string; id: string | null }>;
};
type SessionRow = {
  id: string;
  actor_profile_id: string;
  kind: ImportKind;
  source_namespace: string | null;
  campaign_id: string | null;
  preview_hash: string;
  idempotency_key: string | null;
  state: ImportSessionState;
  total: number;
  preview_expires_at: Date | string;
  retain_until: Date | string;
};
type StoredRow = {
  position: number;
  record_index: number;
  source_line: number;
  values_json: ImportRow;
  action: string;
  target_id: string | null;
  expected_version: number | null;
  status: ImportRowStatus | null;
  errors_json: string[];
  result_id: string | null;
  retryable: boolean;
  lease_owner: string | null;
};
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;
const CHUNK_LIMIT = 20;

function owner(session: SessionRow | null, context: RequestAuthorization): SessionRow {
  if (!session || session.actor_profile_id !== context.actor.profileId)
    throw new Error("Import session owner access denied");
  return session;
}
function asRowResult(row: StoredRow): ImportRowResult {
  return {
    recordIndex: row.record_index,
    sourceLine: row.source_line,
    action: row.action,
    status: row.status,
    errors: row.errors_json,
    id: row.result_id,
    retryable: row.retryable,
  };
}
function safeError(error: unknown): {
  status: ImportRowStatus;
  code: string;
  message: string;
  retryable: boolean;
} {
  if (error instanceof ImportRowError)
    return {
      status: error.status,
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    };
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  const retryable = typeof code === "string" && ["40001", "40P01", "55P03", "57014"].includes(code);
  return {
    status: "failed",
    code: "ROW_FAILED",
    message: "Import row could not be processed",
    retryable,
  };
}
function datePassed(value: Date | string) {
  return new Date(value).getTime() <= Date.now();
}

/** Scrub expired raw rows in bounded batches; receipts and identity mappings remain. */
export async function cleanupExpiredImportSessions(limit = 100): Promise<number> {
  const bounded = Math.min(100, Math.max(1, limit));
  return transaction(async (db) => {
    const sessions = (
      await db.query<{ id: string }>(
        `select id from import_sessions where retain_until<=now() and state<>'expired'
       order by retain_until for update skip locked limit $1`,
        [bounded],
      )
    ).rows;
    if (!sessions.length) return 0;
    const ids = sessions.map((session) => session.id);
    await db.query(
      "update import_session_rows set values_json='{}'::jsonb where session_id=any($1::uuid[])",
      [ids],
    );
    await db.query("update import_sessions set state='expired' where id=any($1::uuid[])", [ids]);
    return ids.length;
  });
}

export function createImportService(options: { handler: ImportHandler }) {
  const { handler } = options;

  async function expireIfNeeded(context: RequestAuthorization, sessionId: string) {
    await transaction(async (db) => {
      const session = owner(
        (
          await db.query<SessionRow>("select * from import_sessions where id=$1 for update", [
            sessionId,
          ])
        ).rows[0] ?? null,
        context,
      );
      if (!datePassed(session.retain_until) || session.state === "expired") return;
      // Receipts and their source line survive. Raw customer fields do not.
      await db.query("update import_session_rows set values_json='{}'::jsonb where session_id=$1", [
        sessionId,
      ]);
      await db.query("update import_sessions set state='expired' where id=$1", [sessionId]);
    });
  }

  async function getImportResult(
    context: RequestAuthorization,
    input: { sessionId: string },
  ): Promise<ImportResult> {
    await expireIfNeeded(context, input.sessionId);
    const session = owner(
      await queryOne<SessionRow>("select * from import_sessions where id=$1", [input.sessionId]),
      context,
    );
    const rows = await query<StoredRow>(
      "select * from import_session_rows where session_id=$1 order by position",
      [session.id],
    );
    return {
      sessionId: session.id,
      state: session.state,
      processed: rows.filter((row) => row.status !== null).length,
      total: session.total,
      rows: rows.map(asRowResult),
    };
  }

  async function previewImport(
    context: RequestAuthorization,
    input: {
      kind: ImportKind;
      csvText: string;
      sourceNamespace?: string | null;
      campaignId?: string | null;
    },
  ): Promise<ImportPreview> {
    if (!["lead", "client", "event"].includes(input.kind))
      throw new Error("Unsupported import kind");
    if (Buffer.byteLength(input.csvText, "utf8") > MAX_BYTES) throw new Error("CSV exceeds 5 MiB");
    if (input.sourceNamespace && !/^[a-zA-Z0-9_.:-]{1,100}$/.test(input.sourceNamespace))
      throw new Error("Invalid source namespace");
    const parsed = parseImportCsvDetailed(input.csvText);
    if (parsed.errors.length) {
      const first = parsed.errors[0];
      throw new Error(`CSV line ${first.startLine}: ${first.reason}`);
    }
    if (parsed.rows.length > MAX_ROWS) throw new Error("CSV exceeds 5,000 rows");
    await cleanupExpiredImportSessions();
    const sessionId = randomUUID();
    const previewExpiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
    const retainUntil = new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString();
    const sourceNamespace = input.sourceNamespace ?? null;
    const campaignId = input.campaignId ?? null;
    const seenExternalIds = new Map<string, string>();
    const rows: Array<{
      position: number;
      record_index: number;
      source_line: number;
      values_json: ImportRow;
      action: string;
      target_id: string | null;
      expected_version: number | null;
      status: ImportRowStatus | null;
      errors_json: string[];
    }> = [];
    for (const parsedRow of parsed.rows) {
      const externalId = parsedRow.values.external_id?.trim();
      const duplicateKey =
        externalId && sourceNamespace
          ? JSON.stringify([input.kind, sourceNamespace, externalId])
          : null;
      const rowHash = createHash("sha256").update(JSON.stringify(parsedRow.values)).digest("hex");
      const previousHash = duplicateKey ? seenExternalIds.get(duplicateKey) : undefined;
      const prepared = previousHash
        ? {
            status: previousHash === rowHash ? ("skipped" as const) : ("ambiguous" as const),
            action: "review",
            errors: [
              previousHash === rowHash
                ? "Duplicate external ID and identical row in this file"
                : "Conflicting rows use the same external ID",
            ],
          }
        : await handler.prepareRow(context, input.kind, parsedRow.values, {
            sourceNamespace,
            campaignId,
            recordIndex: parsedRow.recordIndex,
          });
      if (duplicateKey && !previousHash) seenExternalIds.set(duplicateKey, rowHash);
      rows.push({
        position: rows.length,
        record_index: parsedRow.recordIndex,
        source_line: parsedRow.startLine,
        values_json: parsedRow.values,
        action: prepared.action,
        target_id: prepared.targetId ?? null,
        expected_version: prepared.expectedVersion ?? null,
        status: prepared.status,
        errors_json: prepared.errors,
      });
    }
    const previewHash = createHash("sha256")
      .update(JSON.stringify({ kind: input.kind, sourceNamespace, campaignId, rows }))
      .digest("hex");
    await transaction(async (db) => {
      await db.query(
        "insert into import_sessions(id,actor_profile_id,kind,source_namespace,campaign_id,preview_hash,total,preview_expires_at,retain_until) values($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          sessionId,
          context.actor.profileId,
          input.kind,
          sourceNamespace,
          campaignId,
          previewHash,
          rows.length,
          previewExpiresAt,
          retainUntil,
        ],
      );
      if (rows.length) {
        await db.query(
          `insert into import_session_rows
             (session_id,position,record_index,source_line,values_json,action,target_id,expected_version,status,errors_json,processed_at)
           select $1,x.position,x.record_index,x.source_line,x.values_json,x.action,
             x.target_id,x.expected_version,x.status,x.errors_json,
             case when x.status is null then null else now() end
           from jsonb_to_recordset($2::jsonb) as x(
             position int,record_index int,source_line int,values_json jsonb,action text,
             target_id uuid,expected_version int,status text,errors_json jsonb)`,
          [sessionId, JSON.stringify(rows)],
        );
      }
    });
    const result = await getImportResult(context, { sessionId });
    return { ...result, previewHash, previewExpiresAt };
  }

  async function processRow(
    context: RequestAuthorization,
    session: SessionRow,
    claimed: StoredRow,
    leaseOwner: string,
  ) {
    await transaction(async (db) => {
      const row = (
        await db.query<StoredRow>(
          "select * from import_session_rows where session_id=$1 and position=$2 for update",
          [session.id, claimed.position],
        )
      ).rows[0];
      if (!row || row.lease_owner !== leaseOwner || (row.status !== null && !row.retryable)) return;
      const actor = (
        await db.query<{ role: string; status: string }>(
          "select role,status from profiles where id=$1 for share",
          [context.actor.profileId],
        )
      ).rows[0];
      let outcome: {
        status: ImportRowStatus;
        action: string;
        id: string | null;
        errors: string[];
        retryable: boolean;
      };
      if (!actor || actor.status !== "active" || actor.role !== context.actor.role) {
        outcome = {
          status: "forbidden",
          action: row.action,
          id: null,
          errors: ["Import actor is no longer active or has changed role"],
          retryable: false,
        };
      } else {
        await db.query("savepoint import_row_work");
        try {
          const applied = await handler.applyRow(
            context,
            session.kind,
            row.values_json,
            {
              action: row.action,
              targetId: row.target_id,
              expectedVersion: row.expected_version,
              sourceNamespace: session.source_namespace,
              campaignId: session.campaign_id,
              sessionId: session.id,
            },
            db,
          );
          outcome = {
            status: "succeeded",
            action: applied.action,
            id: applied.id,
            errors: [],
            retryable: false,
          };
          await db.query("release savepoint import_row_work");
        } catch (error) {
          await db.query("rollback to savepoint import_row_work");
          const failure = safeError(error);
          outcome = {
            status: failure.status,
            action: row.action,
            id: null,
            errors: [failure.message],
            retryable: failure.retryable,
          };
        }
      }
      await db.query(
        "update import_session_rows set status=$3,action=$4,result_id=$5,errors_json=$6::jsonb,retryable=$7,lease_owner=null,lease_until=null,processed_at=now() where session_id=$1 and position=$2",
        [
          session.id,
          row.position,
          outcome.status,
          outcome.action,
          outcome.id,
          JSON.stringify(outcome.errors),
          outcome.retryable,
        ],
      );
    });
  }

  async function processChunk(
    context: RequestAuthorization,
    sessionId: string,
    requestedLimit = CHUNK_LIMIT,
  ): Promise<ImportResult> {
    await expireIfNeeded(context, sessionId);
    const limit = Math.min(CHUNK_LIMIT, Math.max(0, requestedLimit));
    const leaseOwner = randomUUID();
    const { session, claimed } = await transaction(async (db) => {
      const session = owner(
        (
          await db.query<SessionRow>("select * from import_sessions where id=$1 for update", [
            sessionId,
          ])
        ).rows[0] ?? null,
        context,
      );
      if (session.state === "preview") throw new Error("Import preview has not been committed");
      if (session.state === "expired" || session.state === "completed")
        return { session, claimed: [] as StoredRow[] };
      await db.query("update import_sessions set state='running' where id=$1", [sessionId]);
      const claimed =
        limit === 0
          ? []
          : (
              await db.query<StoredRow>(
                `update import_session_rows set lease_owner=$2,lease_until=now()+interval '30 seconds',
          attempts=attempts+1 where (session_id,position) in
          (select session_id,position from import_session_rows where session_id=$1
           and (status is null or (status='failed' and retryable))
           and (lease_owner is null or lease_until<now())
           order by position for update skip locked limit $3) returning *`,
                [sessionId, leaseOwner, limit],
              )
            ).rows.sort((a, b) => a.position - b.position);
      return { session, claimed };
    });
    const deadline = Date.now() + 5_000;
    for (let index = 0; index < claimed.length; index += 4) {
      if (index > 0 && Date.now() >= deadline) break;
      const settled = await Promise.allSettled(
        claimed.slice(index, index + 4).map((row) => processRow(context, session, row, leaseOwner)),
      );
      if (settled.some((item) => item.status === "rejected")) break;
    }
    if (claimed.length)
      await query(
        "update import_session_rows set lease_owner=null,lease_until=null where session_id=$1 and lease_owner=$2",
        [sessionId, leaseOwner],
      );
    await transaction(async (db) => {
      const current = owner(
        (
          await db.query<SessionRow>("select * from import_sessions where id=$1 for update", [
            sessionId,
          ])
        ).rows[0] ?? null,
        context,
      );
      if (current.state === "expired") return;
      const counts = (
        await db.query<{ remaining: string; active: string }>(
          `select count(*) filter (where status is null or (status='failed' and retryable))::text as remaining,
          count(*) filter (where lease_owner is not null and lease_until>now())::text as active
         from import_session_rows where session_id=$1`,
          [sessionId],
        )
      ).rows[0];
      const next =
        Number(counts?.remaining ?? 0) === 0
          ? "completed"
          : Number(counts?.active ?? 0) > 0
            ? "running"
            : "paused";
      await db.query(
        "update import_sessions set state=$2,completed_at=case when $2='completed' then now() else null end where id=$1",
        [sessionId, next],
      );
    });
    return getImportResult(context, { sessionId });
  }

  async function commitImport(
    context: RequestAuthorization,
    input: {
      sessionId: string;
      previewHash: string;
      idempotencyKey: string;
      processLimit?: number;
    },
  ) {
    if (!input.idempotencyKey || input.idempotencyKey.length > 200)
      throw new Error("Invalid import idempotency key");
    await transaction(async (db) => {
      const session = owner(
        (
          await db.query<SessionRow>("select * from import_sessions where id=$1 for update", [
            input.sessionId,
          ])
        ).rows[0] ?? null,
        context,
      );
      if (session.preview_hash !== input.previewHash)
        throw new Error("Import preview hash mismatch");
      if (session.state === "expired" || datePassed(session.retain_until))
        throw new Error("Import session expired");
      if (session.idempotency_key && session.idempotency_key !== input.idempotencyKey)
        throw new Error("Import idempotency key mismatch");
      if (!session.idempotency_key) {
        if (datePassed(session.preview_expires_at)) throw new Error("Import preview expired");
        await db.query(
          "update import_sessions set idempotency_key=$2,state='paused',committed_at=now() where id=$1",
          [session.id, input.idempotencyKey],
        );
      }
    });
    return processChunk(context, input.sessionId, input.processLimit);
  }

  async function resumeImport(context: RequestAuthorization, input: { sessionId: string }) {
    return processChunk(context, input.sessionId);
  }
  return { previewImport, commitImport, resumeImport, getImportResult };
}
