import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, Outlet, useNavigate, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Sparkles, Upload } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  EmptyWorkspaceState,
  FilterToolbar,
  FilteredEmptyState,
  MetricStrip,
  ResponsiveRecordList,
  SectionHeader,
  WorkspaceHeader,
  type ColumnDef,
} from "@/components/sales";
import { ListPagination } from "@/components/list-pagination";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toSafeErrorMessage } from "@/lib/errors";
import { formatCount } from "@/lib/format";
import { useIsExactPath } from "@/lib/routing-utils";
import { getStatusLabel } from "@/lib/status-labels";
import type { Lead } from "@/lib/types";
import { crmQueryKeys } from "@/lib/query-keys";
import { normalizeQualificationData } from "@/lib/workflows/qualification";
import { routeQueryOptions } from "@/lib/route-query";
import { getLeadsPage, createLead, updateLead } from "@/server-functions/leads";

const leadListSearchSchema = z.object({
  page: z.coerce.number().int().min(1).default(1).catch(1),
  limit: z.coerce.number().int().min(1).max(100).default(50).catch(50),
  status: z.string().trim().min(1).optional().catch(undefined),
  source: z.string().trim().min(1).optional().catch(undefined),
});

export const Route = createFileRoute("/leads")({
  validateSearch: leadListSearchSchema,
  loaderDeps: ({ search }) => ({ search }),
  head: () => ({
    meta: [
      { title: "Leads — Fimmick ClientOps" },
      {
        name: "description",
        content: "All inbound leads with status, source, and qualification score.",
      },
    ],
  }),
  loader: ({ context, deps: { search } }) =>
    context.queryClient.ensureQueryData(
      routeQueryOptions({
        queryKey: crmQueryKeys.leads.list(search),
        queryFn: () => getLeadsPage({ data: search }),
      }),
    ),
  component: LeadsRoute,
});

const STATUSES = ["new", "qualified", "replied", "quoted", "approved", "won", "lost"];
const SOURCES = ["website", "whatsapp", "email", "linkedin", "csv", "event"];

/** Source is not a lifecycle status, so it does not belong in `status-labels.ts`. */
const sourceLabel = (source: string) => source.charAt(0).toUpperCase() + source.slice(1);

function LeadsRoute() {
  const isIndexRoute = useIsExactPath("/leads");

  if (!isIndexRoute) return <Outlet />;

  return <LeadsPage />;
}

function LeadsPage() {
  const leadPage = Route.useLoaderData();
  const loaderLeads = leadPage.items;
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const router = useRouter();
  const queryClient = useQueryClient();
  const setStatus = (value: string) =>
    navigate({
      search: (current) => ({
        ...current,
        page: 1,
        status: value === "all" ? undefined : value,
      }),
      replace: true,
    });
  const setSource = (value: string) =>
    navigate({
      search: (current) => ({
        ...current,
        page: 1,
        source: value === "all" ? undefined : value,
      }),
      replace: true,
    });
  const [rows, setRows] = useState<Lead[]>(loaderLeads);
  useEffect(() => setRows(loaderLeads), [loaderLeads]);
  const [query, setQuery] = useState("");
  const status = search.status ?? "all";
  const source = search.source ?? "all";
  const [sort, setSort] = useState<"recent" | "score">("recent");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newOpen, setNewOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  /**
   * Runs a write against every selected lead, then refreshes from the server.
   *
   * `Promise.all` used to reject as a whole and return *before* the invalidation, so writes
   * that had already landed stayed invisible and the table went on showing pre-write state
   * next to an error toast. `allSettled` plus an unconditional refresh means the table is
   * always what the database says afterwards; the failed ids stay selected so the batch can
   * be retried against exactly them.
   *
   * Returns whether every write succeeded, so a caller's dialog knows to stay open.
   */
  const applyToSelected = async (
    write: (id: string) => Promise<unknown>,
    describe: (count: number) => string,
  ): Promise<boolean> => {
    const ids = Array.from(selected);
    if (ids.length === 0 || bulkBusy) return false;

    setBulkBusy(true);
    try {
      const results = await Promise.allSettled(ids.map(write));
      const failedIds = ids.filter((_, index) => results[index].status === "rejected");
      const succeeded = ids.length - failedIds.length;

      await queryClient.invalidateQueries({ queryKey: crmQueryKeys.leads.lists() });
      await router.invalidate({ filter: (match) => match.routeId === "/leads" });

      if (failedIds.length === 0) {
        setSelected(new Set());
        toast.success(describe(ids.length));
        return true;
      }

      const firstRejection = results.find(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      setSelected(new Set(failedIds));
      toast.error(
        succeeded === 0
          ? `No leads were updated. ${toSafeErrorMessage(firstRejection?.reason)}`
          : `${describe(succeeded)}. ${formatCount(failedIds.length)} of ${formatCount(
              ids.length,
            )} failed — ${toSafeErrorMessage(firstRejection?.reason)}`,
      );
      return false;
    } finally {
      setBulkBusy(false);
    }
  };

  const handleCreateLead = async (formData: {
    company_name: string;
    enquiry_text?: string;
    source?: Lead["source"];
    contact_name?: string;
    contact_email?: string;
  }) => {
    await createLead({ data: formData });
    await queryClient.invalidateQueries({ queryKey: crmQueryKeys.leads.lists() });
    await router.invalidate({ filter: (match) => match.routeId === "/leads" });
    setNewOpen(false);
    toast.success("Lead created");
  };

  const filtered = useMemo(() => {
    const out = rows.filter((l) => {
      if (status !== "all" && l.status !== status) return false;
      if (source !== "all" && l.source !== source) return false;
      if (
        query &&
        !`${l.company_name} ${l.contact_name} ${l.contact_email}`
          .toLowerCase()
          .includes(query.toLowerCase())
      )
        return false;
      return true;
    });
    return sort === "score"
      ? [...out].sort((a, b) => b.lead_score - a.lead_score)
      : [...out].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [rows, query, status, source, sort]);

  const clearFilters = () => {
    setQuery("");
    setStatus("all");
    setSource("all");
    setSort("recent");
  };
  const hasActiveFilters = query.trim() !== "" || status !== "all" || source !== "all";
  const filterSummary = [
    status !== "all" ? `Status: ${getStatusLabel("leads", status).label}` : null,
    source !== "all" ? `Source: ${sourceLabel(source)}` : null,
    query.trim() !== "" ? `Search: ${query.trim()}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const columns: ColumnDef<Lead>[] = [
    {
      id: "company",
      header: "Company",
      priority: "primary",
      sticky: true,
      width: "16rem",
      cell: (lead) => (
        <div className="min-w-0">
          <span className="font-medium">{lead.company_name}</span>
          <span className="block truncate text-xs text-muted-foreground">{lead.id}</span>
        </div>
      ),
    },
    {
      id: "contact",
      header: "Contact",
      priority: "secondary",
      cell: (lead) => (
        <div className="min-w-0">
          <span className="block truncate">{lead.contact_name ?? "—"}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {lead.contact_email ?? "—"}
          </span>
        </div>
      ),
    },
    {
      id: "source",
      header: "Source",
      priority: "tertiary",
      cell: (lead) => (
        <span className="text-xs text-muted-foreground">
          {lead.source ? sourceLabel(lead.source) : "—"}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      priority: "primary",
      cell: (lead) => <StatusBadge value={lead.status} />,
    },
    {
      id: "score",
      header: "Score",
      priority: "primary",
      numeric: true,
      cell: (lead) => lead.lead_score,
    },
    {
      id: "owner",
      header: "Owner",
      priority: "tertiary",
      cell: (lead) => <span className="text-sm">{lead.assigned_to ?? "Unassigned"}</span>,
    },
    {
      id: "suggestion",
      header: "Agent suggestion",
      priority: "tertiary",
      cell: (lead) =>
        lead.qualification_data ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            {/* Through the same normalizer the detail page uses, so a legacy row cannot
                show one next action here and another there. */}
            {normalizeQualificationData(lead.qualification_data).next_action}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">awaiting qualification</span>
        ),
    },
  ];

  return (
    <>
      <WorkspaceHeader
        context="Acquire"
        title="Lead Inbox"
        description={`${formatCount(leadPage.total)} leads. Status and source filter the whole pipeline; search and sort narrow only the ${formatCount(rows.length)} rows on this page.`}
        primaryAction={
          <NewLeadDialog open={newOpen} onOpenChange={setNewOpen} onCreate={handleCreateLead} />
        }
        secondaryActions={[
          <Button key="import-csv" variant="outline" size="sm" asChild>
            <Link to="/leads/import">
              <Upload className="mr-2 h-4 w-4" aria-hidden="true" /> Import CSV
            </Link>
          </Button>,
        ]}
      />

      <div className="space-y-6 px-4 py-6 md:px-6">
        <MetricStrip
          metrics={[
            {
              label: "Hot leads",
              value: rows.filter((lead) => lead.lead_score >= 75).length,
              hint: "score 75+ on this page",
            },
            {
              label: "Unassigned",
              value: rows.filter((lead) => !lead.assigned_to).length,
              hint: "needs owner, on this page",
            },
            {
              label: "Qualified",
              value: rows.filter((lead) => lead.status === "qualified").length,
              hint: "ready to convert, on this page",
            },
          ]}
          columns={3}
        />

        <section className="space-y-3">
          <SectionHeader
            title="Leads"
            description="Open a lead to see its qualification, activity and quotes."
          />

          <Card className="p-3">
            <FilterToolbar
              search={{
                value: query,
                onChange: setQuery,
                placeholder: "Search this page by company, contact or email",
              }}
              filters={[
                {
                  id: "status",
                  label: "Status",
                  value: status,
                  onChange: setStatus,
                  options: [
                    { value: "all", label: "All statuses" },
                    ...STATUSES.map((value) => ({
                      value,
                      label: getStatusLabel("leads", value).label,
                    })),
                  ],
                },
                {
                  id: "source",
                  label: "Source",
                  value: source,
                  onChange: setSource,
                  options: [
                    { value: "all", label: "All sources" },
                    ...SOURCES.map((value) => ({ value, label: sourceLabel(value) })),
                  ],
                },
              ]}
              sort={{
                value: sort,
                onChange: (value) => setSort(value as "recent" | "score"),
                options: [
                  { value: "recent", label: "Most recent" },
                  { value: "score", label: "Highest score" },
                ],
              }}
              onClear={clearFilters}
              resultCount={filtered.length}
            />
          </Card>

          {selected.size > 0 && (
            <LeadsBulkBar
              count={selected.size}
              busy={bulkBusy}
              onAssign={(uid) =>
                applyToSelected(
                  (id) => updateLead({ data: { id, updates: { assigned_to: uid } } }),
                  (count) => `Reassigned ${formatCount(count)} lead${count > 1 ? "s" : ""}`,
                )
              }
              onMarkStatus={(nextStatus) =>
                applyToSelected(
                  (id) => updateLead({ data: { id, updates: { status: nextStatus } } }),
                  (count) =>
                    `Marked ${formatCount(count)} lead${count > 1 ? "s" : ""} as ${
                      getStatusLabel("leads", nextStatus).label
                    }`,
                )
              }
              onClear={() => setSelected(new Set())}
            />
          )}

          {filtered.length === 0 ? (
            hasActiveFilters ? (
              <FilteredEmptyState onClear={clearFilters} filterSummary={filterSummary} />
            ) : (
              <EmptyWorkspaceState
                title="No leads yet"
                description="Leads arrive from the website, campaigns and inbound email. Add one to keep the sales queue moving."
                action={
                  <Button size="sm" variant="outline" onClick={() => setNewOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> New lead
                  </Button>
                }
              />
            )
          ) : (
            <ResponsiveRecordList
              caption="Leads"
              columns={columns}
              rows={filtered}
              rowKey={(lead) => lead.id}
              rowHref={(lead) => `/leads/${lead.id}`}
              selection={{ selected, onChange: setSelected }}
              renderCard={(lead) => (
                <div className="space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{lead.company_name}</span>
                    <StatusBadge value={lead.status} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {lead.contact_name ?? "No contact"} · {lead.contact_email ?? "no email"}
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    Score {lead.lead_score} ·{" "}
                    {lead.source ? sourceLabel(lead.source) : "Unknown source"}
                  </p>
                </div>
              )}
            />
          )}

          <ListPagination
            page={leadPage.page}
            limit={leadPage.limit}
            total={leadPage.total}
            onPageChange={(page) =>
              navigate({ search: (current) => ({ ...current, page }), replace: true })
            }
          />
        </section>
      </div>
    </>
  );
}

function NewLeadDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (formData: {
    company_name: string;
    enquiry_text?: string;
    source?: Lead["source"];
    contact_name?: string;
    contact_email?: string;
  }) => Promise<void>;
}) {
  const [company, setCompany] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [enquiry, setEnquiry] = useState("");
  const [source, setSource] = useState("website");
  /**
   * `submit` was passed straight to `onClick`, so a rejected `createLead` was an unhandled
   * rejection: no toast, dialog still open, fields still full, and a second click created a
   * second lead. The flag closes both holes.
   */
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) return;
    if (!company.trim() || !contact.trim()) {
      toast.error("Company and contact name are required.");
      return;
    }

    setSubmitting(true);
    try {
      await onCreate({
        company_name: company.trim(),
        contact_name: contact.trim(),
        contact_email: email.trim() || undefined,
        source: source as Lead["source"],
        enquiry_text: enquiry.trim() || undefined,
      });
      setCompany("");
      setContact("");
      setEmail("");
      setEnquiry("");
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submitting) return;
        onOpenChange(next);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> New lead
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New lead</DialogTitle>
          <DialogDescription>
            The Qualification Agent will pick it up automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="new-lead-company" className="text-xs">
              Company
            </Label>
            <Input
              id="new-lead-company"
              name="company"
              autoComplete="organization"
              className="mt-1"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="new-lead-contact" className="text-xs">
              Contact name
            </Label>
            <Input
              id="new-lead-contact"
              name="contact-name"
              autoComplete="name"
              className="mt-1"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="new-lead-email" className="text-xs">
              Contact email
            </Label>
            <Input
              id="new-lead-email"
              name="email"
              type="email"
              autoComplete="email"
              spellCheck={false}
              className="mt-1"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="new-lead-source" className="text-xs">
              Source
            </Label>
            <Select value={source} onValueChange={(value) => setSource(value)}>
              <SelectTrigger id="new-lead-source" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {sourceLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="new-lead-enquiry" className="text-xs">
              Enquiry
            </Label>
            <Textarea
              id="new-lead-enquiry"
              name="enquiry"
              className="mt-1"
              rows={3}
              value={enquiry}
              onChange={(e) => setEnquiry(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={submitting} onClick={() => void submit()}>
            {submitting ? "Creating…" : "Create lead"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LeadsBulkBar({
  count,
  busy,
  onAssign,
  onMarkStatus,
  onClear,
}: {
  count: number;
  busy: boolean;
  onAssign: (uid: string) => Promise<boolean>;
  onMarkStatus: (s: Lead["status"]) => Promise<boolean>;
  onClear: () => void;
}) {
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignee, setAssignee] = useState("");
  /**
   * The pending confirmation holds the *status* to write, not a closure that writes it,
   * and its title is derived rather than stored.
   *
   * It used to hold `action: () => onMarkStatus("qualified")` plus a title built from the
   * count, both captured when the dialog opened. The dialog deliberately stays open after a
   * partial failure so the batch can be retried — but the stored closure had captured the
   * selection as it was *before* the failure, so the retry rewrote the leads that had
   * already succeeded instead of the ones that had not, and the stored title went on asking
   * about a number of leads the button would no longer touch.
   */
  const [confirm, setConfirm] = useState<null | {
    description: string;
    status: Lead["status"];
    label: string;
  }>(null);

  const confirmTitle = confirm
    ? `Mark ${formatCount(count)} lead${count > 1 ? "s" : ""} as ${getStatusLabel(
        "leads",
        confirm.status,
      ).label.toLowerCase()}?`
    : "";

  const runAssign = async () => {
    const owner = assignee.trim();
    // `assigned_to` is `text references profiles(id)`, so an empty string is an FK
    // violation, not a "clear the owner". The write is not attempted without a value.
    if (owner === "") {
      toast.error("Enter the owner's user ID before assigning.");
      return;
    }
    // Awaited before the dialog closes: it used to `void` the promise and close
    // immediately, so the failure toast arrived over a dialog that had already gone.
    const ok = await onAssign(owner);
    if (!ok) return;
    setAssignee("");
    setAssignOpen(false);
  };

  const runConfirm = async () => {
    if (!confirm) return;
    const ok = await onMarkStatus(confirm.status);
    if (!ok) return;
    setConfirm(null);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
      <span className="font-medium">{formatCount(count)} selected</span>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => setAssignOpen(true)}>
        Assign owner
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() =>
          setConfirm({
            description: "This updates the status for every selected lead.",
            label: "Mark qualified",
            status: "qualified",
          })
        }
      >
        Mark qualified
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() =>
          setConfirm({
            description: "Lost leads stay in history but won't appear in active pipelines.",
            label: "Mark lost",
            status: "lost",
          })
        }
      >
        Mark lost
      </Button>
      {busy && <span className="text-xs text-muted-foreground">Updating…</span>}
      <Button size="sm" variant="ghost" className="ml-auto" disabled={busy} onClick={onClear}>
        Clear
      </Button>

      <Dialog
        open={assignOpen}
        onOpenChange={(open) => {
          if (busy) return;
          setAssignOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Assign {formatCount(count)} lead{count > 1 ? "s" : ""}
            </DialogTitle>
            <DialogDescription>
              Owners are identified by their user ID. There is no owner picker yet, so the ID has to
              be pasted; reassignment is logged.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="owner-uuid" className="text-xs">
              Owner user ID
            </Label>
            <Input
              id="owner-uuid"
              name="owner-uuid"
              autoComplete="off"
              spellCheck={false}
              className="mt-1"
              placeholder="Paste the owner's user ID…"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setAssignOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy || assignee.trim() === ""} onClick={() => void runAssign()}>
              {busy ? "Assigning…" : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (busy) return;
          if (!open) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            {/* preventDefault, then close only once the batch settles — otherwise a failed
                batch closes the dialog and the error toast has no context. */}
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void runConfirm();
              }}
            >
              {busy ? "Updating…" : confirm?.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
