import { useMemo, useState } from "react";
import { createFileRoute, Outlet, useNavigate, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";

import {
  EmptyWorkspaceState,
  ErrorState,
  FilterToolbar,
  FilteredEmptyState,
  MetricStrip,
  ResponsiveRecordList,
  SectionHeader,
  StatusBadge,
  WorkspaceHeader,
  type ColumnDef,
} from "@/components/sales";
import { ListPagination } from "@/components/list-pagination";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { ROLE_GRANTS } from "@/lib/admin/policy";
import { CAMPAIGN_STATUS_VALUES, CAMPAIGN_TYPE_VALUES, campaignTypeLabel } from "@/lib/campaigns";
import { toSafeErrorMessage } from "@/lib/errors";
import { formatCount, formatDate } from "@/lib/format";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import { useIsExactPath } from "@/lib/routing-utils";
import { getStatusLabel } from "@/lib/status-labels";
import type { Campaign, CampaignStatus, CampaignType } from "@/lib/types";
import { createCampaign, getCampaignsPage } from "@/server-functions/campaigns";

const campaignListSearchSchema = z.object({
  page: z.coerce.number().int().min(1).default(1).catch(1),
  limit: z.coerce.number().int().min(1).max(100).default(50).catch(50),
  status: z.string().trim().min(1).optional().catch(undefined),
  type: z.string().trim().min(1).optional().catch(undefined),
  owner: z.string().trim().min(1).optional().catch(undefined),
});

export const Route = createFileRoute("/campaigns")({
  validateSearch: campaignListSearchSchema,
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ context, deps: { search } }) =>
    context.queryClient.ensureQueryData(
      routeQueryOptions({
        queryKey: crmQueryKeys.campaigns.list(search),
        queryFn: () => getCampaignsPage({ data: search }),
      }),
    ),
  head: () => ({
    meta: [
      { title: "Campaigns & Events — Fimmick ClientOps" },
      {
        name: "description",
        content: "Event and campaign workspaces with attendee imports and follow-up coverage.",
      },
    ],
  }),
  errorComponent: CampaignsErrorState,
  component: CampaignsRoute,
});

/**
 * `/campaigns` requires `campaigns.view` and the sidebar shows it to everyone (IF-D2-26),
 * so a denial is a normal outcome here, not an exception. Without this the refusal — and
 * any Neon driver text — went to the root boundary, which prints the thrown string into
 * the page body.
 */
function CampaignsErrorState({ error }: { error: unknown }) {
  const router = useRouter();

  return (
    <div className="px-4 py-6 md:px-6">
      <ErrorState
        kind="server"
        error={error}
        title="Campaigns did not load"
        onRetry={() => {
          void router.invalidate({ filter: (match) => match.routeId === "/campaigns" });
        }}
      />
    </div>
  );
}

function CampaignsRoute() {
  const isIndexRoute = useIsExactPath("/campaigns");

  if (!isIndexRoute) return <Outlet />;

  return <CampaignsIndex />;
}

/** Value the owner filter carries when it means "whoever is signed in". */
const OWNER_MINE = "mine";
/** Value it carries when the URL names an owner that is not the signed-in profile. */
const OWNER_OTHER = "other";

function CampaignsIndex() {
  const campaignPage = Route.useLoaderData();
  const campaigns = campaignPage.items;
  const search = Route.useSearch();
  const { profile } = Route.useRouteContext();
  const navigate = useNavigate({ from: Route.fullPath });
  const router = useRouter();
  const queryClient = useQueryClient();
  const [newCampaignOpen, setNewCampaignOpen] = useState(false);
  const [query, setQuery] = useState("");

  /**
   * The capability hint, same shape as `/quotes/$id`: it reads the role table the server
   * consults, and defaults to allowed when the profile is unavailable, because a per-user
   * override can widen access and the server check is the only thing that decides.
   */
  const roleGrants = profile?.role ? ROLE_GRANTS[profile.role] : null;
  const canCreate = roleGrants ? roleGrants.has("campaigns.manage") : true;

  const status = search.status ?? "all";
  const type = search.type ?? "all";
  const ownerFilter =
    search.owner === undefined
      ? "all"
      : profile?.id && search.owner === profile.id
        ? OWNER_MINE
        : OWNER_OTHER;

  const setSearchValue = (patch: Partial<typeof search>) =>
    navigate({ search: (current) => ({ ...current, page: 1, ...patch }), replace: true });

  const setStatus = (value: string) =>
    setSearchValue({ status: value === "all" ? undefined : value });
  const setType = (value: string) => setSearchValue({ type: value === "all" ? undefined : value });
  const setOwner = (value: string) => {
    if (value === OWNER_MINE && profile?.id) {
      setSearchValue({ owner: profile.id });
      return;
    }
    // OWNER_OTHER is only ever the already-active value, so selecting it changes nothing.
    if (value === OWNER_OTHER) return;
    setSearchValue({ owner: undefined });
  };

  const hasServerFilters = status !== "all" || type !== "all" || ownerFilter !== "all";
  const hasActiveFilters = hasServerFilters || query.trim() !== "";

  const clearFilters = () => {
    setQuery("");
    navigate({
      search: (current) => ({
        ...current,
        page: 1,
        status: undefined,
        type: undefined,
        owner: undefined,
      }),
      replace: true,
    });
  };

  /**
   * Name search narrows the loaded page only — `listCampaignsPage` has no text predicate —
   * so the header says which number is which rather than letting one stand for the other.
   */
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return campaigns;
    return campaigns.filter((campaign) =>
      `${campaign.name} ${campaign.objective ?? ""}`.toLowerCase().includes(needle),
    );
  }, [campaigns, query]);

  const filterSummary = [
    status !== "all" ? `Status: ${getStatusLabel("campaigns", status).label}` : null,
    type !== "all" ? `Type: ${campaignTypeLabel(type)}` : null,
    ownerFilter === OWNER_MINE ? "Owner: me" : ownerFilter === OWNER_OTHER ? "Owner: shared" : null,
    query.trim() !== "" ? `Search: ${query.trim()}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const create = async (payload: CreateCampaignPayload) => {
    const campaign = await createCampaign({ data: payload });
    /**
     * IF-D2-15. `createCampaign` invalidated nothing, and the loader is cache-backed
     * through `ensureQueryData` with a 30s stale time, so coming back to `/campaigns`
     * inside that window served the pre-create page and the new campaign was missing from
     * its own index. Both halves are needed: `invalidateQueries` marks the cache entry
     * stale, and the scoped `router.invalidate` makes this route's loader re-run so
     * `Route.useLoaderData()` actually changes.
     */
    await queryClient.invalidateQueries({ queryKey: crmQueryKeys.campaigns.lists() });
    await router.invalidate({ filter: (match) => match.routeId === "/campaigns" });
    setNewCampaignOpen(false);
    toast.success("Campaign created");
    await navigate({ to: "/campaigns/$id", params: { id: campaign.id } });
  };

  const columns: ColumnDef<Campaign>[] = [
    {
      id: "campaign",
      header: "Campaign",
      priority: "primary",
      sticky: true,
      width: "18rem",
      cell: (campaign) => (
        <div className="min-w-0">
          <span className="font-medium">{campaign.name}</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {campaign.objective ?? "No objective recorded"}
          </span>
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      priority: "primary",
      cell: (campaign) => <StatusBadge domain="campaigns" value={campaign.status} />,
    },
    {
      id: "type",
      header: "Type",
      priority: "secondary",
      cell: (campaign) => (
        <span className="text-sm text-muted-foreground">{campaignTypeLabel(campaign.type)}</span>
      ),
    },
    {
      id: "window",
      header: "Runs",
      priority: "secondary",
      cell: (campaign) => (
        <span className="text-xs text-muted-foreground">
          {formatDate(campaign.starts_at ?? null)} → {formatDate(campaign.ends_at ?? null)}
        </span>
      ),
    },
    {
      id: "created",
      header: "Created",
      priority: "tertiary",
      cell: (campaign) => (
        <span className="text-xs text-muted-foreground">{formatDate(campaign.created_at)}</span>
      ),
    },
  ];

  const ownerOptions = [
    { value: "all", label: "All owners" },
    ...(profile?.id ? [{ value: OWNER_MINE, label: "Owned by me" }] : []),
    // Only listed while it is the active value, so the Select never renders blank against
    // a URL someone shared. There is no assignable-owner read yet, so it cannot be chosen.
    ...(ownerFilter === OWNER_OTHER ? [{ value: OWNER_OTHER, label: "Another owner" }] : []),
  ];

  return (
    <>
      <WorkspaceHeader
        context="Acquire"
        title="Campaigns & Events"
        description={`${formatCount(campaignPage.total)} campaigns match the current filters. Status, type and owner filter every campaign; the name search narrows only the ${formatCount(campaigns.length)} on this page.`}
        primaryAction={
          canCreate ? (
            <Button size="sm" onClick={() => setNewCampaignOpen(true)}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> New campaign
            </Button>
          ) : (
            <span className="inline-flex items-center gap-2">
              <Button size="sm" disabled aria-describedby={CREATE_DENIED_ID}>
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> New campaign
              </Button>
              <span id={CREATE_DENIED_ID} className="text-xs text-muted-foreground">
                {CREATE_DENIED_REASON}
              </span>
            </span>
          )
        }
      />

      <div className="space-y-6 px-4 py-6 md:px-6">
        <MetricStrip
          metrics={[
            {
              id: "total",
              label: "Campaigns",
              value: formatCount(campaignPage.total),
              hint: hasServerFilters ? "match these filters" : "in this workspace",
            },
            {
              id: "active",
              label: "Active",
              value: campaigns.filter((campaign) => campaign.status === "active").length,
              // IF-D2-19: these two are counted from the loaded page, so they say so
              // instead of standing in for a workspace total the read never returned.
              hint: "on this page",
              href: "/campaigns?status=active",
            },
            {
              id: "completed",
              label: "Completed",
              value: campaigns.filter((campaign) => campaign.status === "completed").length,
              hint: "on this page",
              href: "/campaigns?status=completed",
            },
          ]}
          columns={3}
        />

        <section className="space-y-3">
          <SectionHeader
            title="Campaigns"
            description="Open a campaign to import attendees, see account matches and queue follow-up."
          />

          <Card className="p-3">
            <FilterToolbar
              search={{
                value: query,
                onChange: setQuery,
                placeholder: "Search this page by name or objective",
              }}
              filters={[
                {
                  id: "status",
                  label: "Status",
                  value: status,
                  onChange: setStatus,
                  options: [
                    { value: "all", label: "All statuses" },
                    ...CAMPAIGN_STATUS_VALUES.map((value) => ({
                      value,
                      label: getStatusLabel("campaigns", value).label,
                    })),
                  ],
                },
                {
                  id: "type",
                  label: "Type",
                  value: type,
                  onChange: setType,
                  options: [
                    { value: "all", label: "All types" },
                    ...CAMPAIGN_TYPE_VALUES.map((value) => ({
                      value,
                      label: campaignTypeLabel(value),
                    })),
                  ],
                },
                {
                  id: "owner",
                  label: "Owner",
                  value: ownerFilter,
                  onChange: setOwner,
                  options: ownerOptions,
                },
              ]}
              onClear={clearFilters}
              resultCount={visible.length}
            />
          </Card>

          {visible.length === 0 ? (
            hasActiveFilters ? (
              <FilteredEmptyState onClear={clearFilters} filterSummary={filterSummary} />
            ) : (
              <EmptyWorkspaceState
                title="No campaigns yet"
                description="A campaign is the workspace an event's attendee list is imported into. Create one before uploading a roster."
                action={
                  canCreate ? (
                    <Button size="sm" variant="outline" onClick={() => setNewCampaignOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> New campaign
                    </Button>
                  ) : undefined
                }
              />
            )
          ) : (
            <ResponsiveRecordList
              caption="Campaigns and events"
              columns={columns}
              rows={visible}
              rowKey={(campaign) => campaign.id}
              rowHref={(campaign) => `/campaigns/${campaign.id}`}
              renderCard={(campaign) => (
                <div className="space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{campaign.name}</span>
                    <StatusBadge domain="campaigns" value={campaign.status} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {campaignTypeLabel(campaign.type)} ·{" "}
                    {campaign.objective ?? "No objective recorded"}
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {formatDate(campaign.starts_at ?? null)} →{" "}
                    {formatDate(campaign.ends_at ?? null)}
                  </p>
                </div>
              )}
            />
          )}

          <ListPagination
            page={campaignPage.page}
            limit={campaignPage.limit}
            total={campaignPage.total}
            onPageChange={(page) =>
              navigate({ search: (current) => ({ ...current, page }), replace: true })
            }
          />
        </section>
      </div>

      <NewCampaignDialog
        open={newCampaignOpen}
        onOpenChange={setNewCampaignOpen}
        onCreate={create}
      />
    </>
  );
}

const CREATE_DENIED_ID = "campaign-create-denied";
const CREATE_DENIED_REASON = "Creating campaigns is not part of your role.";

type CreateCampaignPayload = {
  name: string;
  type?: CampaignType;
  status?: CampaignStatus;
  objective?: string;
  starts_at?: string;
  ends_at?: string;
  notes?: string;
};

function NewCampaignDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onCreate: (campaign: CreateCampaignPayload) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<CampaignType>("client_event");
  const [status, setStatus] = useState<CampaignStatus>("planned");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [objective, setObjective] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Campaign name is required.");
      return;
    }
    if (startsAt && endsAt && endsAt < startsAt) {
      toast.error("The end date cannot be before the start date.");
      return;
    }

    setSaving(true);
    try {
      await onCreate({
        name: trimmedName,
        type,
        status,
        starts_at: startsAt ? `${startsAt}T00:00:00.000Z` : undefined,
        ends_at: endsAt ? `${endsAt}T00:00:00.000Z` : undefined,
        objective: objective.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setName("");
      setObjective("");
      setNotes("");
      setStartsAt("");
      setEndsAt("");
    } catch (error) {
      /**
       * IF-D2-16. `submit` had a `finally` and no `catch`, so a rejected `createCampaign`
       * — a `campaigns.manage` denial is the everyday case — was an unhandled rejection:
       * the button went back to reading "Create campaign" over a still-full form with no
       * reason given. The dialog stays open so the typed values survive the failure.
       */
      toast.error(toSafeErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (saving) return;
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New campaign</DialogTitle>
          <DialogDescription>
            {/*
              The Owner select that stood here was written to `owner` and then discarded:
              `createCampaign` overrides it with `session.profile.id` (IF-D2-17), and its
              five options came from a hardcoded fixture whose ids match no profile row.
              Saying who the campaign will belong to is true; offering a choice was not.
            */}
            You will own this campaign. Ownership decides who can manage it.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="new-campaign-name" className="text-xs">
              Name
            </Label>
            <Input
              id="new-campaign-name"
              name="name"
              autoComplete="off"
              className="mt-1"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="new-campaign-type" className="text-xs">
              Type
            </Label>
            <Select value={type} onValueChange={(value) => setType(value as CampaignType)}>
              <SelectTrigger id="new-campaign-type" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CAMPAIGN_TYPE_VALUES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {campaignTypeLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="new-campaign-status" className="text-xs">
              Status
            </Label>
            <Select value={status} onValueChange={(value) => setStatus(value as CampaignStatus)}>
              <SelectTrigger id="new-campaign-status" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CAMPAIGN_STATUS_VALUES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {getStatusLabel("campaigns", value).label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="new-campaign-start" className="text-xs">
              Start date
            </Label>
            <Input
              id="new-campaign-start"
              name="starts_at"
              type="date"
              className="mt-1"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="new-campaign-end" className="text-xs">
              End date
            </Label>
            <Input
              id="new-campaign-end"
              name="ends_at"
              type="date"
              className="mt-1"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="new-campaign-objective" className="text-xs">
              Objective
            </Label>
            <Textarea
              id="new-campaign-objective"
              name="objective"
              className="mt-1"
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="new-campaign-notes" className="text-xs">
              Notes
            </Label>
            <Textarea
              id="new-campaign-notes"
              name="notes"
              className="mt-1"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? "Creating…" : "Create campaign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
