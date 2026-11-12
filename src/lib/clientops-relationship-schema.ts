type Env = Record<string, string | undefined>;

type Queryable = {
  query<T = unknown>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
};

export const CLIENTOPS_MIGRATION_PATHS = [
  "neon/migrations/001_clientops_runtime.sql",
  "neon/migrations/002_retention_client_360.sql",
  "neon/migrations/003_client_relationship_360.sql",
  "neon/migrations/004_clientops_schema_hardening.sql",
  "neon/migrations/005_quote_to_cash_accounting_handoff.sql",
  "neon/migrations/006_unified_crm_workspace_foundation.sql",
  "neon/migrations/007_admin_team_user_management.sql",
  "neon/migrations/008_read_path_indexes.sql",
  "neon/migrations/009_agent_policy_versions.sql",
  "neon/migrations/010_command_versions_and_receipts.sql",
  "neon/migrations/011_quote_version_integrity.sql",
  "neon/migrations/012_quote_open_approval_constraint.sql",
  "neon/migrations/013_xero_entry_transitions.sql",
  "neon/migrations/014_locked_job_sheet_portions.sql",
  "neon/migrations/015_agent_recovery_metadata.sql",
  "neon/migrations/016_work_queue_pagination_indexes.sql",
  "neon/migrations/017_bulk_operations.sql",
  "neon/migrations/018_bulk_row_versions.sql",
  "neon/migrations/019_import_sessions_and_identity_keys.sql",
  "neon/migrations/020_job_sheet_handoff_fields.sql",
  "neon/migrations/021_ai_invocation_telemetry.sql",
  "neon/migrations/022_neon_domain_storage.sql",
  "neon/migrations/023_ai_execution_provenance.sql",
  "neon/migrations/024_ai_invalid_output.sql",
  "neon/migrations/025_retention_sweep_checkpoints.sql",
  "neon/migrations/026_ai_unknown_model.sql",
  "neon/migrations/027_wfm_history_scaffold.sql",
  "neon/migrations/028_wfm_shared_contact_links.sql",
  "neon/migrations/029_mcp_access_tokens.sql",
  "neon/migrations/030_governed_agent_actions.sql",
  "neon/migrations/031_agent_tool_call_trace.sql",
  "neon/migrations/032_approval_sla_escalation.sql",
] as const;

export const CLIENTOPS_REQUIRED_TABLES = [
  "deals",
  "projects",
  "engagement_events",
  "channel_identities",
  "automation_playbooks",
  "automation_runs",
  "customer_success_profiles",
  "success_touchpoints",
  "profiles",
  "leads",
  "clients",
  "quotes",
  "quote_templates",
  "pdf_templates",
  "quote_line_items",
  "quote_versions",
  "job_sheets",
  "job_sheet_portions",
  "job_sheet_activity",
  "tasks",
  "pricing_templates",
  "agent_runs",
  "agent_tool_calls",
  "human_approvals",
  "activity_logs",
  "products",
  "client_contacts",
  "engagements",
  "touchpoints",
  "notifications",
  "accounts",
  "account_contacts",
  "account_contact_links",
  "campaigns",
  "campaign_members",
  "relationship_signals",
  "workspace_views",
  "workspace_favorites",
  "departments",
  "teams",
  "team_memberships",
  "user_invitations",
  "permission_overrides",
  "access_requests",
  "work_delegations",
  "admin_audit_logs",
  "command_receipts",
  "approval_message_handoffs",
  "bulk_operations",
  "bulk_operation_items",
  "retention_sweeps",
  "retention_sweep_items",
  "import_sessions",
  "import_session_rows",
  "import_identity_keys",
  "wfm_import_runs",
  "wfm_raw_objects",
  "wfm_staff_map",
  "wfm_invoices",
  "wfm_invoice_line_items",
  "wfm_invoice_payments",
  "wfm_timesheets",
  "wfm_timesheet_lines",
  "wfm_import_receipts",
  "mcp_access_tokens",
  "mcp_tool_calls",
] as const;

export const CLIENTOPS_REQUIRED_COLUMNS = [
  "deals.owner",
  "projects.deal_id",
  "engagement_events.campaign_member_id",
  "channel_identities.external_id",
  "automation_playbooks.steps",
  "automation_runs.context_data",
  "customer_success_profiles.cs_owner",
  "success_touchpoints.account_id",
  "campaign_members.last_event_at",
  "profiles.status",
  "profiles.primary_department_id",
  "profiles.manager_profile_id",
  "profiles.session_invalid_before",
  "leads.contact_id",
  "leads.row_version",
  "clients.row_version",
  "accounts.row_version",
  "tasks.row_version",
  "leads.account_id",
  "leads.source_campaign_id",
  "leads.campaign_member_id",
  "clients.account_id",
  "clients.primary_contact_id",
  "quotes.contact_id",
  "quotes.account_id",
  "quotes.deal_id",
  "quotes.quote_template_id",
  "quotes.accepted_version_id",
  "quotes.issued_version_id",
  "quotes.document_sections",
  "quotes.cover_text",
  "quotes.assumptions",
  "quotes.payment_terms",
  "quotes.accepted_at",
  "quotes.accepted_by",
  "quotes.parent_quote_id",
  "quotes.change_order_reason",
  "quote_line_items.quote_id",
  "quote_versions.quote_id",
  "job_sheets.quote_id",
  "job_sheets.accepted_quote_version_id",
  "job_sheets.no_po_reason",
  "job_sheets.row_version",
  "job_sheet_portions.job_sheet_id",
  "job_sheet_portions.row_version",
  "job_sheet_portions.xero_confirmed_at",
  "job_sheet_portions.xero_confirmed_by",
  "job_sheet_portions.xero_corrected_at",
  "job_sheet_portions.xero_corrected_by",
  "job_sheet_portions.xero_correction_reason",
  "job_sheet_activity.job_sheet_id",
  "tasks.contact_id",
  "tasks.account_id",
  "tasks.deal_id",
  "tasks.project_id",
  "engagements.lead_id",
  "engagements.quote_id",
  "touchpoints.contact_id",
  "human_approvals.row_version",
  "human_approvals.superseded_by",
  "human_approvals.recovery_outcome_code",
  "agent_runs.outcome_code",
  "agent_runs.attempt_id",
  "agent_runs.retry_of",
  "agent_runs.idempotency_key",
  "agent_runs.policy_version_id",
  "agent_runs.usage_data",
  "agent_runs.execution_metadata",
  "approval_message_handoffs.handoff_status",
  "mcp_access_tokens.profile_id",
  "mcp_access_tokens.token_hash",
  "mcp_access_tokens.expires_at",
  "mcp_access_tokens.revoked_at",
  "mcp_tool_calls.token_id",
  "mcp_tool_calls.profile_id",
  "human_approvals.requested_by_profile_id",
  "human_approvals.sla_escalated_at",
  "agent_tool_calls.mcp_tool_call_id",
  "agent_tool_calls.duration_ms",
  "agent_tool_calls.status",
  "agent_tool_calls.error_code",
  "agent_tool_calls.args_digest",
  "agent_tool_calls.args_keys",
  "agent_tool_calls.target_ids",
  "agent_tool_calls.source",
] as const;

export type RelationshipSchemaMigrationDecision =
  | {
      shouldApply: false;
      reason: string;
    }
  | {
      shouldApply: true;
      databaseUrl: string;
      migrationPaths: readonly string[];
    };

/** Loopback literals accepted by Node/PostgreSQL drivers, including bracketed IPv6. */
const LOOPBACK_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function databaseTargetHost(databaseUrl: string): string | null {
  try {
    return new URL(databaseUrl).hostname || null;
  } catch {
    return null;
  }
}

/**
 * Whether a build/script invocation may run schema DDL, and against which host.
 *
 * The previous version applied migrations whenever `DATABASE_URL` was non-empty, so a build
 * environment that inherited a remote URL (a copied Vercel variable, a shell still exporting
 * UAT credentials) mutated that database without asking. The seed path already refuses
 * production and requires explicit opt-ins; migration needs the same shape because it is
 * destructive DDL. A loopback target is self-evidently disposable and stays frictionless —
 * that is the database-contract CI rehearsal, which also sets `CLIENTOPS_SCRIPT_LOCAL_PG=1`
 * and still selects the `pg` driver through `selectClientOpsScriptDriver`. Any other host
 * needs `CLIENTOPS_ALLOW_SCHEMA_MIGRATION=1` from a human. Production deployment markers are
 * never overridable: Vercel sets them, so copying env vars between environments cannot
 * downgrade the guard.
 */
export function getClientOpsSchemaMigrationDecision(env: Env): RelationshipSchemaMigrationDecision {
  if (!env.DATABASE_URL) {
    return {
      shouldApply: false,
      reason: "DATABASE_URL is not set",
    };
  }

  const targetHost = databaseTargetHost(env.DATABASE_URL);
  if (!targetHost) {
    return {
      shouldApply: false,
      reason: "DATABASE_URL is not a valid absolute URL; refusing to apply ClientOps migrations",
    };
  }

  const productionMarkers = [
    env.VERCEL_ENV === "production" ? "VERCEL_ENV=production" : null,
    env.NODE_ENV === "production" ? "NODE_ENV=production" : null,
  ].filter((marker): marker is string => marker !== null);
  if (productionMarkers.length > 0) {
    return {
      shouldApply: false,
      reason: `refusing to apply ClientOps migrations on a production deployment (${productionMarkers.join(", ")}; target host ${targetHost})`,
    };
  }

  const loopback = LOOPBACK_DATABASE_HOSTS.has(targetHost);
  if (!loopback && env.CLIENTOPS_ALLOW_SCHEMA_MIGRATION !== "1") {
    return {
      shouldApply: false,
      reason: `refusing to apply ClientOps migrations to non-loopback target host ${targetHost}; set CLIENTOPS_ALLOW_SCHEMA_MIGRATION=1 to opt in`,
    };
  }

  return {
    shouldApply: true,
    databaseUrl: env.DATABASE_URL,
    migrationPaths: CLIENTOPS_MIGRATION_PATHS,
  };
}

export async function applyClientOpsSchemaMigrations(input: {
  db: Queryable;
  migrationSqls: string[];
}) {
  if (input.migrationSqls.length !== CLIENTOPS_MIGRATION_PATHS.length) {
    throw new Error(
      `ClientOps schema migration expected ${CLIENTOPS_MIGRATION_PATHS.length} SQL files, received ${input.migrationSqls.length}`,
    );
  }

  for (const migrationSql of input.migrationSqls) {
    if (migrationSql.trim()) {
      await input.db.query(migrationSql);
    }
  }

  const tableResult = await input.db.query<{ table_name: string }>(
    `
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name = any($1::text[])
    `,
    [CLIENTOPS_REQUIRED_TABLES],
  );
  const existingTables = new Set(tableResult.rows.map((row) => row.table_name));
  const missingTables = CLIENTOPS_REQUIRED_TABLES.filter((table) => !existingTables.has(table));

  if (missingTables.length > 0) {
    throw new Error(
      `ClientOps schema migration missing required tables: ${missingTables.join(", ")}`,
    );
  }

  const columnResult = await input.db.query<{ table_name: string; column_name: string }>(
    `
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
        and (table_name || '.' || column_name) = any($1::text[])
    `,
    [CLIENTOPS_REQUIRED_COLUMNS],
  );
  const existingColumns = new Set(
    columnResult.rows.map((row) => `${row.table_name}.${row.column_name}`),
  );
  const missingColumns = CLIENTOPS_REQUIRED_COLUMNS.filter(
    (column) => !existingColumns.has(column),
  );

  if (missingColumns.length > 0) {
    throw new Error(
      `ClientOps schema migration missing required columns: ${missingColumns.join(", ")}`,
    );
  }
}

export const getRelationshipSchemaMigrationDecision = getClientOpsSchemaMigrationDecision;
export const applyRelationshipSchemaMigration = applyClientOpsSchemaMigrations;

export {
  CLIENTOPS_SCHEMA_CONTRACT,
  verifyClientOpsDatabase,
  type DatabaseContractMismatch,
  type DatabaseReadinessResult,
} from "@/server/db/clientops-schema-contract";
