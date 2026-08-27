import { useRef, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { AdminAuditTable } from "@/components/admin/admin-audit-table";
import {
  ErrorState,
  PermissionDeniedState,
  StaleDataIndicator,
  WorkspaceHeader,
} from "@/components/sales";
import { Button } from "@/components/ui/button";
import { adminControlAccess } from "@/lib/admin-capabilities";
import { AdminError } from "@/lib/admin/errors";
import { adminAuditSearchSchema, type AdminAuditSearch } from "@/lib/admin/schemas";
import { csvFileName, toCsv, type CsvColumn } from "@/lib/csv";
import { toSafeErrorMessage } from "@/lib/errors";
import { formatCount } from "@/lib/format";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import type { AdminAuditLog } from "@/server/repositories/admin-access";
import { exportAdminAuditLogsFn, getAdminAuditLogsFn } from "@/server-functions/admin-access";

/** The page size `auditFilters` pins, and therefore the size of one export. */
const AUDIT_PAGE_SIZE = 50;

function auditFilters(search: AdminAuditSearch) {
  return {
    actorProfileId: search.actor,
    targetType: search.targetType,
    targetId: search.target,
    action: search.action,
    severity: search.severity,
    from: search.from,
    to: search.to,
    page: search.page,
    limit: AUDIT_PAGE_SIZE,
  };
}

const auditQueryKey = (search: AdminAuditSearch) =>
  crmQueryKeys.admin.list({ scope: "audit", ...auditFilters(search) });

const auditQueryOptions = (search: AdminAuditSearch) =>
  routeQueryOptions({
    queryKey: auditQueryKey(search),
    queryFn: async () => {
      try {
        return {
          data: await getAdminAuditLogsFn({ data: auditFilters(search) }),
          forbidden: false,
        };
      } catch (error) {
        if (error instanceof AdminError && ["FORBIDDEN", "OUTSIDE_SCOPE"].includes(error.code)) {
          return {
            data: { items: [], total: 0, page: 1, limit: AUDIT_PAGE_SIZE },
            forbidden: true,
          };
        }
        throw error;
      }
    },
  });

/**
 * The exported columns.
 *
 * Machine-readable values, not display strings: `created_at` stays an ISO timestamp because
 * an audit export is opened in a spreadsheet and sorted, and the snapshots stay JSON because
 * they are already the redacted structures the server stored. Formatting belongs on screen.
 */
const AUDIT_CSV_COLUMNS: CsvColumn<AdminAuditLog>[] = [
  { header: "Timestamp (UTC)", value: (entry) => entry.created_at },
  { header: "Actor profile id", value: (entry) => entry.actor_profile_id ?? "" },
  { header: "Target type", value: (entry) => entry.target_type },
  { header: "Target id", value: (entry) => entry.target_id ?? "" },
  { header: "Action", value: (entry) => entry.action },
  { header: "Severity", value: (entry) => entry.severity },
  { header: "Reason", value: (entry) => entry.reason ?? "" },
  { header: "Before", value: (entry) => JSON.stringify(entry.before_snapshot ?? null) },
  { header: "After", value: (entry) => JSON.stringify(entry.after_snapshot ?? null) },
];

export const Route = createFileRoute("/admin/audit")({
  validateSearch: adminAuditSearchSchema,
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ context, deps: { search } }) =>
    context.queryClient.ensureQueryData(auditQueryOptions(search)),
  head: () => ({ meta: [{ title: "Admin audit · Fimmick ClientOps" }] }),
  errorComponent: AdminAuditErrorState,
  component: AdminAuditRoute,
});

function AdminAuditErrorState({ error }: { error: unknown }) {
  const router = useRouter();

  return (
    <div className="px-4 py-6 md:px-6">
      <ErrorState
        kind="server"
        error={error}
        title="The audit log did not load"
        onRetry={() => {
          void router.invalidate({ filter: (match) => match.routeId === "/admin/audit" });
        }}
      />
    </div>
  );
}

/** `datetime-local` wants `YYYY-MM-DDTHH:mm`; the schema stores a full ISO datetime. */
function toLocalInput(value: string | undefined) {
  return value ? value.slice(0, 16) : "";
}

function toIsoDatetime(value: string): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function AdminAuditRoute() {
  const search = Route.useSearch();
  const loaded = Route.useLoaderData();
  const auditQuery = useQuery({ ...auditQueryOptions(search), initialData: loaded });
  const { data, forbidden } = auditQuery.data;
  const { profile } = Route.useRouteContext();
  const navigate = useNavigate({ from: Route.fullPath });
  const exportLock = useRef(false);
  const [exporting, setExporting] = useState(false);

  const [actor, setActor] = useState(search.actor ?? "");
  const [targetType, setTargetType] = useState(search.targetType ?? "");
  const [target, setTarget] = useState(search.target ?? "");
  const [action, setAction] = useState(search.action ?? "");
  const [severity, setSeverity] = useState(search.severity ?? "");
  // `from` and `to` were held in state, seeded from the URL, forwarded to the read — and
  // never rendered. Both setters were dead code, so date-range filtering, the single most
  // obvious thing to want from an audit log, was unreachable.
  const [from, setFrom] = useState(toLocalInput(search.from));
  const [to, setTo] = useState(toLocalInput(search.to));

  const access = adminControlAccess(profile?.role);

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({
      search: () => ({
        ...search,
        actor: actor.trim() || undefined,
        targetType: targetType.trim() || undefined,
        target: target.trim() || undefined,
        action: action.trim() || undefined,
        severity: severity ? (severity as "info" | "warning" | "critical") : undefined,
        from: toIsoDatetime(from),
        to: toIsoDatetime(to),
        page: 1,
      }),
    });
  }

  function clearFilters() {
    setActor("");
    setTargetType("");
    setTarget("");
    setAction("");
    setSeverity("");
    setFrom("");
    setTo("");
    navigate({ search: () => ({ page: 1 }) });
  }

  /**
   * What this control actually produces.
   *
   * `exportAdminAuditLogsFn` re-runs `listAdminAuditLogs` with the same `page` and `limit`
   * the screen is using, so the file is the rows currently listed — not the audit history.
   * It used to emit `JSON.stringify(items)` under the file name `fimmick-admin-audit.json`,
   * which named a history it was not, from a control labelled only "Export audit". Making
   * the export whole-history is a server change (`limit` is applied inside the read), so
   * what is fixed here is the labelling and the format: the file is now CSV through
   * `src/lib/csv.ts`, and both the button and the line under it say it is this page.
   */
  async function exportAudit() {
    if (exportLock.current) return;
    exportLock.current = true;
    setExporting(true);
    try {
      const result = await exportAdminAuditLogsFn({ data: auditFilters(search) });
      if (result.items.length === 0) {
        toast.error("There is nothing on this page to export.");
        return;
      }

      const blob = new Blob([toCsv(result.items, AUDIT_CSV_COLUMNS)], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = csvFileName("fimmick-admin-audit", "page", result.page);
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success(
        `Downloaded ${formatCount(result.items.length)} audit ${result.items.length === 1 ? "entry" : "entries"} from this page.`,
      );
    } catch (error) {
      // `requireCapability("audit.export")` runs four raw SQL queries; a driver failure used
      // to have its verbatim message toasted.
      toast.error(toSafeErrorMessage(error));
    } finally {
      exportLock.current = false;
      setExporting(false);
    }
  }

  if (forbidden) {
    return (
      <>
        <WorkspaceHeader context="Administration" title="Audit review" />
        <div className="px-4 py-6 md:px-6">
          <PermissionDeniedState what="the audit log" />
        </div>
      </>
    );
  }

  const fieldClass =
    "mt-1 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const labelClass = "text-xs font-medium text-muted-foreground";
  const hasFilters = Boolean(
    search.actor ||
    search.targetType ||
    search.target ||
    search.action ||
    search.severity ||
    search.from ||
    search.to,
  );

  return (
    <>
      <WorkspaceHeader
        context="Administration"
        title="Audit review"
        description={`${formatCount(data.total)} recorded administrative ${data.total === 1 ? "change" : "changes"} match these filters. Entries are immutable and their snapshots are redacted.`}
        status={
          <StaleDataIndicator
            updatedAt={new Date(auditQuery.dataUpdatedAt).toISOString()}
            isRefetching={auditQuery.isFetching}
          />
        }
      />

      <form
        className="grid gap-3 border-b border-border px-4 py-4 sm:grid-cols-2 lg:grid-cols-4 md:px-6"
        onSubmit={submitFilters}
      >
        <label className="block">
          <span className={labelClass}>Actor profile id</span>
          <input
            aria-label="Audit actor"
            value={actor}
            onChange={(event) => setActor(event.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Target type</span>
          <input
            aria-label="Audit target type"
            value={targetType}
            onChange={(event) => setTargetType(event.target.value)}
            placeholder="profile, team, permission_override"
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Target id</span>
          <input
            aria-label="Audit target"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Action</span>
          <input
            aria-label="Audit action"
            value={action}
            onChange={(event) => setAction(event.target.value)}
            placeholder="profile.role_changed"
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Severity</span>
          <select
            aria-label="Audit severity"
            value={severity}
            onChange={(event) => setSeverity(event.target.value)}
            className={fieldClass}
          >
            <option value="">All severities</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
        </label>
        <label className="block">
          <span className={labelClass}>From</span>
          <input
            type="datetime-local"
            aria-label="Audit from"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>To</span>
          <input
            type="datetime-local"
            aria-label="Audit to"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className={fieldClass}
          />
        </label>
        <div className="flex items-end gap-2">
          <Button type="submit" size="sm">
            Apply filters
          </Button>
          {hasFilters && (
            <Button type="button" size="sm" variant="ghost" onClick={clearFilters}>
              Clear
            </Button>
          )}
        </div>
      </form>

      <AdminAuditTable
        data={data}
        onPageChange={(page) => navigate({ search: (current) => ({ ...current, page }) })}
        exporting={exporting}
        exportLabel="Export this page (CSV)"
        exportHint={`Downloads the ${formatCount(data.items.length)} ${data.items.length === 1 ? "entry" : "entries"} listed below, with these filters applied. The full history is not exported.`}
        /*
          `audit.export` is granted to Super Admin and Admin only. The button used to render
          for anyone who could open the page — including an actor holding an `audit.view`
          override — so it was a live control that always failed.
        */
        onExport={access.exportAudit ? () => void exportAudit() : undefined}
      />
    </>
  );
}
