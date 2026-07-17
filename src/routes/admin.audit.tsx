import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AdminAuditTable } from "@/components/admin/admin-audit-table";
import { AdminError } from "@/lib/admin/errors";
import { adminAuditSearchSchema, type AdminAuditSearch } from "@/lib/admin/schemas";
import { exportAdminAuditLogsFn, getAdminAuditLogsFn } from "@/server-functions/admin-access";

export const Route = createFileRoute("/admin/audit")({
  validateSearch: adminAuditSearchSchema,
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ deps: { search } }) => {
    try {
      const data = await getAdminAuditLogsFn({
        data: {
          actorProfileId: search.actor,
          targetType: search.targetType,
          targetId: search.target,
          action: search.action,
          severity: search.severity,
          from: search.from,
          to: search.to,
          page: search.page,
          limit: 50,
        },
      });
      return { data, forbidden: false };
    } catch (error) {
      if (error instanceof AdminError && ["FORBIDDEN", "OUTSIDE_SCOPE"].includes(error.code)) {
        return {
          data: { items: [], total: 0, page: 1, limit: 50 },
          forbidden: true,
        };
      }
      throw error;
    }
  },
  head: () => ({ meta: [{ title: "Admin audit • Fimmick ClientOps" }] }),
  component: AdminAuditRoute,
});

function filterData(search: AdminAuditSearch) {
  return {
    actorProfileId: search.actor,
    targetType: search.targetType,
    targetId: search.target,
    action: search.action,
    severity: search.severity,
    from: search.from,
    to: search.to,
    page: search.page,
    limit: 50,
  };
}

function AdminAuditRoute() {
  const search = Route.useSearch();
  const { data, forbidden } = Route.useLoaderData();
  const navigate = useNavigate({ from: Route.fullPath });
  const [actor, setActor] = useState(search.actor ?? "");
  const [targetType, setTargetType] = useState(search.targetType ?? "");
  const [target, setTarget] = useState(search.target ?? "");
  const [action, setAction] = useState(search.action ?? "");
  const [severity, setSeverity] = useState(search.severity ?? "");
  const [from, setFrom] = useState(search.from ? search.from.slice(0, 16) : "");
  const [to, setTo] = useState(search.to ? search.to.slice(0, 16) : "");

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: AdminAuditSearch = {
      ...search,
      actor: actor.trim() || undefined,
      targetType: targetType.trim() || undefined,
      target: target.trim() || undefined,
      action: action.trim() || undefined,
      severity: severity ? (severity as "info" | "warning" | "critical") : undefined,
      page: 1,
    };
    navigate({ search: () => next });
  }

  async function exportAudit() {
    try {
      const result = await exportAdminAuditLogsFn({ data: filterData(search) });
      const blob = new Blob([JSON.stringify(result.items, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "fimmick-admin-audit.json";
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Audit export prepared");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not export audit history");
    }
  }

  if (forbidden) {
    return (
      <div
        role="alert"
        className="m-6 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-5 text-sm text-destructive"
      >
        Audit review is outside your access scope.
      </div>
    );
  }

  return (
    <>
      <div className="border-b border-border px-4 py-5">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Admin workspace
        </p>
        <h1 className="mt-1 text-xl font-semibold text-foreground">Audit review</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Search immutable administrative history with redacted snapshots.
        </p>
      </div>
      <form
        className="grid gap-3 border-b border-border px-4 py-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7"
        onSubmit={submitFilters}
      >
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Actor</span>
          <input
            aria-label="Audit actor"
            value={actor}
            onChange={(event) => setActor(event.target.value)}
            className="mt-1 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Target type</span>
          <input
            aria-label="Audit target type"
            value={targetType}
            onChange={(event) => setTargetType(event.target.value)}
            className="mt-1 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Target</span>
          <input
            aria-label="Audit target"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            className="mt-1 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Action</span>
          <input
            aria-label="Audit action"
            value={action}
            onChange={(event) => setAction(event.target.value)}
            className="mt-1 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Severity</span>
          <select
            aria-label="Audit severity"
            value={severity}
            onChange={(event) => setSeverity(event.target.value)}
            className="mt-1 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All severities</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
        </label>
        <button
          type="submit"
          className="min-h-9 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground sm:w-fit"
        >
          Apply filters
        </button>
      </form>
      <AdminAuditTable
        data={data}
        onPageChange={(page) => navigate({ search: (current) => ({ ...current, page }) })}
        onExport={() => void exportAudit()}
      />
    </>
  );
}
