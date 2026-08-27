import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, notFound, useNavigate, useRouter } from "@tanstack/react-router";
import { AlertTriangle, Copy, FileUp, Pencil, Users } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import {
  ActivityTimeline,
  AttentionQueue,
  EmptyWorkspaceState,
  ErrorState,
  MetricStrip,
  ResponsiveRecordList,
  SectionHeader,
  StaleDataIndicator,
  StatusBadge,
  WorkspaceHeader,
  type ActivityEvent,
  type AttentionItem,
  type ColumnDef,
} from "@/components/sales";
import { ListPagination } from "@/components/list-pagination";
import { SummaryRow } from "@/components/summary-row";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useClientNow } from "@/hooks/use-client-now";
import { ROLE_GRANTS } from "@/lib/admin/policy";
import { CAMPAIGN_STATUS_VALUES, CAMPAIGN_TYPE_VALUES, campaignTypeLabel } from "@/lib/campaigns";
import { toSafeErrorMessage } from "@/lib/errors";
import { formatCount, formatDate, formatDateTime, relativeTime } from "@/lib/format";
import { crmQueryKeys } from "@/lib/query-keys";
import {
  classifyAttendeeAttention,
  describeAttendeeQuality,
  rankAttendeeAttention,
  type AttendeeAttentionKind,
} from "@/lib/relationship/campaign-attendees";
import {
  parseEventAttendeeCsv,
  type EventImportError,
  type EventImportRow,
} from "@/lib/relationship/event-import";
import { routeQueryOptions } from "@/lib/route-query";
import { getStatusLabel } from "@/lib/status-labels";
import type { CampaignStatus, CampaignType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { createCampaignFollowUpTasksFn, updateCampaign } from "@/server-functions/campaigns";
import { commitEventImportFn, validateEventImportRowsFn } from "@/server-functions/event-import";
import {
  getCampaignWorkspaceRead,
  getCampaignWorkspaceSection,
} from "@/server-functions/relationship-workspaces";

type CommitEventImportResponse = Awaited<ReturnType<typeof commitEventImportFn>>;
type CampaignWorkspaceRead = Awaited<ReturnType<typeof getCampaignWorkspaceRead>>;
type AttendeeSection = Awaited<ReturnType<typeof getCampaignWorkspaceSection>>;
type Attendee = AttendeeSection["members"][number];

const ATTENDEE_PAGE_SIZE = 50;

/** One severity per attention kind, so two callers cannot disagree about which chip shows. */
const ATTENTION_SEVERITY: Record<AttendeeAttentionKind, AttentionItem["severity"]> = {
  unmatched: "failure",
  duplicate: "risk",
  follow_up: "stuck",
};

const ATTENTION_REASON: Record<AttendeeAttentionKind, (member: Attendee) => string> = {
  unmatched: (member) =>
    `No account matched "${member.raw_company_name?.trim() || "the company on this row"}", so follow-up cannot be attributed to an account.`,
  duplicate: () =>
    "Another attendee in this campaign shares this email or name. Decide which record is the real one before working it.",
  follow_up: () => "No follow-up task has been created for this attendee yet.",
};
/** The queue is a shortlist, not a second copy of the table below it. */
const ATTENTION_LIMIT = 8;

function isCommitValidationFailure(
  result: CommitEventImportResponse,
): result is Extract<CommitEventImportResponse, { ok: false }> {
  return "ok" in result && result.ok === false;
}

/**
 * IF-D2-23. The attendee pager used `useState`, so a refresh, a shared link or the browser
 * Back button silently returned the reader to page 1 of a roster that can run to hundreds
 * of rows — and the row someone was asked to look at was not where the link said it was.
 */
const campaignDetailSearchSchema = z.object({
  attendeePage: z.coerce.number().int().min(1).default(1).catch(1),
});

export const Route = createFileRoute("/campaigns/$id")({
  validateSearch: campaignDetailSearchSchema,
  /**
   * IF-D2-20(a). The loader called the server function directly, so it re-hit Postgres on
   * every entry and its result was a snapshot the page then used as `initialData` while a
   * `useQuery` on the same key owned what was rendered. Going through `ensureQueryData`
   * with that same key makes the two one entry: an invalidation now refreshes both.
   */
  loader: async ({ context, params }) => {
    try {
      return await context.queryClient.ensureQueryData(
        routeQueryOptions({
          queryKey: crmQueryKeys.campaigns.detail(params.id),
          queryFn: () => getCampaignWorkspaceRead({ data: { id: params.id } }),
        }),
      );
    } catch (error) {
      // The repository throws this exact sentence for a well-formed id with no row. A
      // malformed id fails earlier, inside Postgres, and belongs on the error boundary.
      if (error instanceof Error && error.message === "Campaign not found") throw notFound();
      throw error;
    }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.campaign.name ?? "Campaign"} — Fimmick ClientOps` }],
  }),
  errorComponent: CampaignDetailErrorState,
  notFoundComponent: CampaignNotFound,
  component: CampaignDetailRoute,
});

/**
 * IF-D2-24. `campaigns.id` is a uuid column, so `/campaigns/not-a-uuid` reaches Postgres
 * and raises `22P02 invalid input syntax for type uuid: "not-a-uuid"` — which the root
 * boundary printed into the page body verbatim, quoting the value back at the user.
 */
function CampaignDetailErrorState({ error }: { error: unknown }) {
  const router = useRouter();

  return (
    <div className="space-y-4 px-4 py-6 md:px-6">
      <ErrorState
        kind="server"
        error={error}
        title="This campaign did not load"
        onRetry={() => {
          void router.invalidate({ filter: (match) => match.routeId === "/campaigns/$id" });
        }}
      />
      <div className="flex justify-center">
        <Button variant="outline" size="sm" asChild>
          <Link to="/campaigns">Back to all campaigns</Link>
        </Button>
      </div>
    </div>
  );
}

function CampaignNotFound() {
  return (
    <div className="px-4 py-6 md:px-6">
      <EmptyWorkspaceState
        title="Campaign not found"
        description="It may have been removed, or the link may point at a campaign in another workspace."
        action={
          <Button variant="outline" size="sm" asChild>
            <Link to="/campaigns">Back to all campaigns</Link>
          </Button>
        }
      />
    </div>
  );
}

/**
 * Every query key a campaign write has to refresh.
 *
 * IF-D2-20(b): neither entry listed `campaigns.lists()`, so importing three hundred
 * attendees or generating follow-up tasks left `/campaigns` serving its cached index.
 * Combined with IF-D2-15 — a create that invalidated nothing — the campaigns index was
 * refreshed by nothing in the product at all.
 */
const campaignMutationQueryKeys = {
  attendee_import: (campaignId: string) => [
    crmQueryKeys.campaigns.detail(campaignId),
    crmQueryKeys.campaigns.section(campaignId, "attendees"),
    crmQueryKeys.campaigns.lists(),
    crmQueryKeys.accounts.lists(),
    crmQueryKeys.contacts.lists(),
  ],
  follow_up_tasks: (campaignId: string) => [
    crmQueryKeys.campaigns.detail(campaignId),
    crmQueryKeys.campaigns.section(campaignId, "attendees"),
    crmQueryKeys.campaigns.lists(),
    crmQueryKeys.tasks.lists(),
  ],
  campaign_details: (campaignId: string) => [
    crmQueryKeys.campaigns.detail(campaignId),
    crmQueryKeys.campaigns.lists(),
  ],
} as const;

async function invalidateCampaignMutation(
  queryClient: ReturnType<typeof useQueryClient>,
  router: ReturnType<typeof useRouter>,
  campaignId: string,
  mutation: keyof typeof campaignMutationQueryKeys,
) {
  await Promise.all(
    campaignMutationQueryKeys[mutation](campaignId).map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  );
  /**
   * `/campaigns` is this route's parent, so it is mounted and its loader data is already
   * in hand while the reader is here. Marking the cache entry stale cannot push new rows
   * into a loader that has already resolved — this makes the parent loader re-run, so
   * going back shows the campaign as it now is. Scoped by routeId, never a bare
   * `router.invalidate()`, which would refetch every mounted loader in the app.
   */
  await router.invalidate({ filter: (match) => match.routeId === "/campaigns" });
}

function CampaignDetailRoute() {
  const initialRead = Route.useLoaderData() as CampaignWorkspaceRead;
  const campaignId = initialRead.campaign.id;
  const { profile } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const router = useRouter();
  const clientNow = useClientNow();

  const workspaceQuery = useQuery({
    ...routeQueryOptions({
      queryKey: crmQueryKeys.campaigns.detail(campaignId),
      queryFn: () => getCampaignWorkspaceRead({ data: { id: campaignId } }),
    }),
    initialData: initialRead,
  });
  const { campaign, attendeeSummary } = workspaceQuery.data;

  const attendeeFilters = { page: search.attendeePage, limit: ATTENDEE_PAGE_SIZE };
  const attendeeQuery = useQuery({
    ...routeQueryOptions({
      queryKey: crmQueryKeys.campaigns.section(campaign.id, "attendees", attendeeFilters),
      queryFn: () =>
        getCampaignWorkspaceSection({ data: { campaignId: campaign.id, ...attendeeFilters } }),
    }),
    placeholderData: (previousData) => previousData,
  });
  const members = useMemo(() => attendeeQuery.data?.members ?? [], [attendeeQuery.data]);
  const importHistory = attendeeQuery.data?.importHistory ?? [];

  const setAttendeePage = (page: number) =>
    navigate({ search: (current) => ({ ...current, attendeePage: page }), replace: true });

  const roleGrants = profile?.role ? ROLE_GRANTS[profile.role] : null;
  // Honesty hint only: `requireCapability` on the server is what decides, and a per-user
  // override can widen access, so an unknown profile keeps the control enabled.
  const canManage = roleGrants ? roleGrants.has("campaigns.manage") : true;

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [rows, setRows] = useState<EventImportRow[]>([]);
  const [errors, setErrors] = useState<EventImportError[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isCreatingTasks, setIsCreatingTasks] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const visibleErrors = errors.slice(0, 6);

  const resetInput = () => {
    if (inputRef.current) inputRef.current.value = "";
  };

  const onFile = async (file: File) => {
    setIsValidating(true);
    setRows([]);
    setErrors([]);

    try {
      const parsedRows = parseEventAttendeeCsv(await file.text());
      if (parsedRows.length === 0) {
        toast.error("No attendee rows found in the CSV.");
        resetInput();
        return;
      }

      const result = await validateEventImportRowsFn({ data: { rows: parsedRows } });
      setRows(parsedRows);
      setErrors(result.errors);

      if (result.errors.length > 0) {
        toast.error(
          `${formatCount(result.errors.length)} attendee row${result.errors.length === 1 ? "" : "s"} need review before import.`,
        );
        resetInput();
        return;
      }

      toast.success(
        `${formatCount(result.valid.length)} attendee row${result.valid.length === 1 ? "" : "s"} ready to import.`,
      );
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
      resetInput();
    } finally {
      setIsValidating(false);
    }
  };

  const importRows = async () => {
    if (rows.length === 0 || errors.length > 0 || isImporting) return;

    setIsImporting(true);
    try {
      const result = await commitEventImportFn({ data: { campaignId: campaign.id, rows } });

      if (isCommitValidationFailure(result)) {
        setErrors(result.errors);
        toast.error(
          `${formatCount(result.errors.length)} attendee row${result.errors.length === 1 ? "" : "s"} failed validation on import.`,
        );
        resetInput();
        return;
      }

      setAttendeePage(1);
      await invalidateCampaignMutation(queryClient, router, campaign.id, "attendee_import");
      setRows([]);
      setErrors([]);
      resetInput();
      toast.success(
        `Imported ${formatCount(result.createdMembers)} attendee${result.createdMembers === 1 ? "" : "s"}, matching ${formatCount(result.createdAccounts)} new account${result.createdAccounts === 1 ? "" : "s"} and ${formatCount(result.createdContacts)} new contact${result.createdContacts === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
      resetInput();
    } finally {
      setIsImporting(false);
    }
  };

  const createFollowUpTasks = async () => {
    if (isCreatingTasks) return;

    setIsCreatingTasks(true);
    try {
      const result = await createCampaignFollowUpTasksFn({ data: { campaignId: campaign.id } });
      await invalidateCampaignMutation(queryClient, router, campaign.id, "follow_up_tasks");
      /**
       * `createCampaignFollowUpTasks` only touches members still at `not_started`, so a
       * second click is a legitimate no-op rather than a duplicate — but "Created 0
       * follow-up tasks" reads as a failure. Say which of the two happened.
       */
      if (result.createdTasks === 0) {
        toast.success("Every attendee already has a follow-up task.");
      } else {
        toast.success(
          `Created ${formatCount(result.createdTasks)} follow-up task${result.createdTasks === 1 ? "" : "s"}.`,
        );
      }
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
    } finally {
      setIsCreatingTasks(false);
    }
  };

  const saveCampaign = async (updates: CampaignEditPayload) => {
    await updateCampaign({ data: { id: campaign.id, updates } });
    await invalidateCampaignMutation(queryClient, router, campaign.id, "campaign_details");
    setEditOpen(false);
    toast.success("Campaign updated");
  };

  /**
   * The follow-up queue: attendees nobody has picked up, and the rows that cannot be.
   *
   * `task_created`, `completed` and `dismissed` are deliberately absent — a task exists or
   * a decision was made, so the row is moving and listing it again is the queue crying
   * wolf. Ordering is unmatched first: an attendee with no account cannot be followed up
   * through the account at all, so it outranks one that is merely waiting.
   *
   * Scoped to the loaded attendee page, and the section header says so out loud. The
   * campaign-wide numbers sit in the metric strip above, so the scoping hides nothing.
   */
  const attentionItems: AttentionItem[] = useMemo(() => {
    const classified = members
      .map((member) => ({ member, kind: classifyAttendeeAttention(member) }))
      .filter(
        (entry): entry is { member: Attendee; kind: NonNullable<typeof entry.kind> } =>
          entry.kind !== null,
      );

    classified.sort(
      (left, right) => rankAttendeeAttention(left.kind) - rankAttendeeAttention(right.kind),
    );

    return classified.slice(0, ATTENTION_LIMIT).map(({ member, kind }) => ({
      id: member.id,
      // "Failed" is literal for an unmatched row: the import's account-matching step ran
      // and did not resolve one. The other two have not failed, they have not moved.
      severity: ATTENTION_SEVERITY[kind],
      title: attendeeName(member),
      reason: ATTENTION_REASON[kind](member),
      owner: member.raw_company_name?.trim() || undefined,
      age:
        clientNow === null
          ? `Imported ${formatDate(member.created_at)}`
          : `Imported ${relativeTime(member.created_at, clientNow)}`,
      // An unmatched attendee is fixed in Accounts — found or created there — while a
      // matched one is worked from the account it already belongs to.
      href: member.account_id ? `/accounts/${member.account_id}` : "/accounts",
    }));
  }, [members, clientNow]);

  const attendeeColumns: ColumnDef<Attendee>[] = [
    {
      id: "attendee",
      header: "Attendee",
      priority: "primary",
      sticky: true,
      width: "16rem",
      cell: (member) => (
        <div className="min-w-0">
          <span className="font-medium">{attendeeName(member)}</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {member.raw_email?.trim() || member.raw_phone?.trim() || "No contact details"}
          </span>
        </div>
      ),
    },
    {
      id: "match",
      header: "Account match",
      priority: "primary",
      cell: (member) => <AttendeeMatchCell member={member} />,
    },
    {
      id: "attendee-status",
      header: "Attendance",
      priority: "secondary",
      cell: (member) => <StatusBadge domain="campaigns" value={member.attendee_status} />,
    },
    {
      id: "follow-up",
      header: "Follow-up",
      priority: "primary",
      cell: (member) => <StatusBadge domain="campaigns" value={member.follow_up_status} />,
    },
    {
      id: "conversion",
      header: "Outcome",
      priority: "secondary",
      cell: (member) => (
        <StatusBadge domain="campaigns" value={member.conversion_outcome ?? "none"} />
      ),
    },
    {
      id: "interests",
      header: "Interests",
      priority: "tertiary",
      cell: (member) => (
        <span className="text-xs text-muted-foreground">
          {member.interests && member.interests.length > 0
            ? member.interests.join(", ")
            : "None captured"}
        </span>
      ),
    },
  ];

  const importEvents: ActivityEvent[] = importHistory.map((entry) => ({
    id: entry.importedAt,
    // The real latest insert of that day, not the day bucket the rows are grouped by — a
    // midnight timestamp on every entry would be a precision the data does not have.
    at: entry.lastImportedAt ?? entry.importedAt,
    kind: "attendee_import",
    title: `${formatCount(entry.attendeeCount)} attendee${entry.attendeeCount === 1 ? "" : "s"} imported`,
    description: "Total added on this date, across every upload.",
  }));

  const dataQualityIssues = attendeeSummary.unmatchedAccounts + attendeeSummary.possibleDuplicates;

  return (
    <>
      <WorkspaceHeader
        context="Acquire"
        title={campaign.name}
        backHref={{ to: "/campaigns", label: "Campaigns" }}
        description={`${campaignTypeLabel(campaign.type)} · ${formatDate(campaign.starts_at ?? null)} → ${formatDate(campaign.ends_at ?? null)}`}
        status={
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge domain="campaigns" value={campaign.status} />
            <StaleDataIndicator
              updatedAt={new Date(workspaceQuery.dataUpdatedAt).toISOString()}
              isRefetching={workspaceQuery.isFetching}
            />
          </div>
        }
        primaryAction={
          canManage ? (
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" aria-hidden="true" /> Edit campaign
            </Button>
          ) : (
            <span className="inline-flex items-center gap-2">
              <Button size="sm" variant="outline" disabled aria-describedby={EDIT_DENIED_ID}>
                <Pencil className="mr-2 h-4 w-4" aria-hidden="true" /> Edit campaign
              </Button>
              <span id={EDIT_DENIED_ID} className="text-xs text-muted-foreground">
                {EDIT_DENIED_REASON}
              </span>
            </span>
          )
        }
      />

      <div className="space-y-6 px-4 py-6 md:px-6">
        {/*
          IF-D2-22. `initialData` means `workspaceQuery.data` is always defined, so a failed
          refetch of the name, status and attendee counts was completely silent — including
          straight after an import, which is the one moment those counts are being read.
        */}
        {workspaceQuery.isError && (
          <ErrorState
            kind="stale"
            error={workspaceQuery.error}
            title="These campaign totals could not be refreshed"
            description="The numbers below are the last ones that loaded successfully."
            retryLabel="Refresh totals"
            onRetry={() => void workspaceQuery.refetch()}
          />
        )}

        <MetricStrip
          metrics={[
            {
              id: "attendees",
              label: "Attendees",
              value: formatCount(attendeeSummary.total),
              hint: "imported to this campaign",
            },
            {
              id: "unmatched",
              label: "Unmatched accounts",
              value: formatCount(attendeeSummary.unmatchedAccounts),
              hint: "no account to follow up through",
              tone: attendeeSummary.unmatchedAccounts > 0 ? "warning" : "neutral",
            },
            {
              id: "open-follow-up",
              label: "Open follow-up",
              value: formatCount(attendeeSummary.openFollowUp),
              hint: "not started, queued or in progress",
              tone: attendeeSummary.openFollowUp > 0 ? "warning" : "neutral",
            },
            {
              id: "converted",
              label: "Converted",
              value: formatCount(attendeeSummary.converted),
              hint: "a lead, quote or engagement exists",
              tone: attendeeSummary.converted > 0 ? "success" : "neutral",
            },
          ]}
          columns={4}
        />

        {dataQualityIssues > 0 && (
          <div
            role="status"
            className="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/10 p-4 text-sm sm:flex-row sm:items-start sm:gap-3"
          >
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground"
              aria-hidden="true"
            />
            <div className="min-w-0 space-y-1">
              <p className="font-medium text-warning-foreground">This roster has data to fix</p>
              <p className="text-muted-foreground">
                {formatCount(attendeeSummary.unmatchedAccounts)} attendee
                {attendeeSummary.unmatchedAccounts === 1 ? "" : "s"} matched no account, and{" "}
                {formatCount(attendeeSummary.possibleDuplicates)} share a name or email with another
                attendee in this campaign. Both are counted across the whole campaign, not just this
                page, and both are marked on the rows below.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(340px,1fr)]">
          <div className="space-y-6">
            <section className="space-y-3">
              <SectionHeader
                title="Follow-up queue"
                description={`Attendees on this page that nobody has picked up, unmatched first. ${formatCount(attendeeSummary.openFollowUp)} across the whole campaign still have follow-up open.`}
                action={
                  <Button
                    size="sm"
                    onClick={() => void createFollowUpTasks()}
                    disabled={isCreatingTasks || attendeeSummary.total === 0}
                  >
                    {isCreatingTasks ? "Creating tasks…" : "Create follow-up tasks"}
                  </Button>
                }
              />
              {attendeeQuery.isPending ? (
                <p role="status" className="text-sm text-muted-foreground">
                  Loading attendees…
                </p>
              ) : attendeeQuery.isError ? (
                /*
                  An empty AttentionQueue says "nothing waiting", which is the opposite of
                  what a failed read means. The error goes here rather than the queue's own
                  empty state so the good news is never printed over a failure.
                */
                <ErrorState
                  kind="server"
                  error={attendeeQuery.error}
                  title="The follow-up queue did not load"
                  onRetry={() => void attendeeQuery.refetch()}
                />
              ) : (
                <AttentionQueue
                  items={attentionItems}
                  emptyTitle="Nothing waiting on this page"
                  emptyDescription="Every attendee here is matched to an account and has a follow-up task."
                />
              )}
            </section>

            <section className="space-y-3">
              <SectionHeader
                title="Attendees"
                description="Every imported row, with the account it resolved to and the state of its follow-up."
              />

              {attendeeQuery.isPending ? (
                <p role="status" className="text-sm text-muted-foreground">
                  Loading attendees…
                </p>
              ) : attendeeQuery.isError ? (
                <ErrorState
                  kind="server"
                  error={attendeeQuery.error}
                  title="Attendees did not load"
                  onRetry={() => void attendeeQuery.refetch()}
                />
              ) : members.length === 0 ? (
                <EmptyWorkspaceState
                  icon={Users}
                  title="No attendees yet"
                  description="Import an attendee list to match accounts, capture interests and queue follow-up work."
                />
              ) : (
                <>
                  <ResponsiveRecordList
                    caption="Campaign attendees"
                    columns={attendeeColumns}
                    rows={members}
                    rowKey={(member) => member.id}
                    breakpoint="lg"
                    renderCard={(member) => (
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <span className="font-medium">{attendeeName(member)}</span>
                          <StatusBadge domain="campaigns" value={member.follow_up_status} />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {member.raw_email?.trim() || "No email captured"}
                        </p>
                        <AttendeeMatchCell member={member} />
                      </div>
                    )}
                  />
                  <ListPagination
                    page={attendeeQuery.data.page}
                    limit={attendeeQuery.data.limit}
                    total={attendeeQuery.data.total}
                    onPageChange={setAttendeePage}
                  />
                </>
              )}
            </section>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Import attendee CSV</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-md border border-dashed border-border p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-md bg-accent p-2 text-accent-foreground">
                      <FileUp className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-3">
                      <div>
                        <p className="text-sm font-medium">Upload attendee list</p>
                        <p className="text-sm text-muted-foreground">
                          Use CSV columns for company, contact, email, phone, attendee status,
                          interests and notes.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={isValidating || isImporting}
                          onClick={() => inputRef.current?.click()}
                        >
                          {isValidating ? "Validating…" : "Choose CSV"}
                        </Button>
                        <input
                          ref={inputRef}
                          type="file"
                          accept=".csv,text/csv"
                          className="sr-only"
                          aria-label="Attendee CSV file"
                          disabled={isValidating || isImporting}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void onFile(file);
                          }}
                        />
                        <span className="text-xs text-muted-foreground">
                          {rows.length === 0
                            ? "No file loaded"
                            : `${formatCount(rows.length)} row${rows.length === 1 ? "" : "s"} loaded`}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-md border border-border/70 p-3">
                    <p className="text-xs uppercase text-muted-foreground">Ready</p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums">
                      {formatCount(rows.length > 0 ? rows.length - errors.length : 0)}
                    </p>
                  </div>
                  <div className="rounded-md border border-border/70 p-3">
                    <p className="text-xs uppercase text-muted-foreground">Needs review</p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums">
                      {formatCount(errors.length)}
                    </p>
                  </div>
                </div>

                {errors.length > 0 && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                    <p className="text-sm font-medium text-destructive">Validation issues</p>
                    <ul className="mt-2 space-y-1 text-sm text-destructive">
                      {visibleErrors.map((error) => (
                        <li key={`${error.index}-${error.reason}`}>
                          Row {error.index + 1}: {error.reason}
                        </li>
                      ))}
                    </ul>
                    {errors.length > 6 && (
                      <p className="mt-2 text-xs text-destructive">{`+${formatCount(errors.length - 6)} more`}</p>
                    )}
                  </div>
                )}

                {/*
                  IF-D2-21, stated rather than papered over. `commitEventImport` calls
                  `createCampaignMember` for every row with no existing-member lookup and no
                  unique constraint, and `validateEventImportRowsFn` is never given the
                  campaign id, so it can only detect repeats *within* one file. Preventing
                  this needs a dedupe key on `campaign_members`, which is a migration. Until
                  then the honest thing is to warn before the click and mark the rows after.
                */}
                <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                  Importing the same file twice adds every attendee again — nothing is matched
                  against attendees already in this campaign. Repeats are marked{" "}
                  <span className="font-medium text-foreground">Possible duplicate</span> in the
                  list once imported.
                </p>

                <Button
                  className="w-full"
                  onClick={() => void importRows()}
                  disabled={rows.length === 0 || errors.length > 0 || isImporting || isValidating}
                >
                  {isImporting
                    ? "Importing attendees…"
                    : `Import ${formatCount(rows.length)} attendee row${rows.length === 1 ? "" : "s"}`}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Campaign scope</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <SummaryRow label="Type" value={campaignTypeLabel(campaign.type)} />
                <SummaryRow
                  label="Status"
                  value={<StatusBadge domain="campaigns" value={campaign.status} />}
                />
                <SummaryRow label="Starts" value={formatDate(campaign.starts_at ?? null)} />
                <SummaryRow label="Ends" value={formatDate(campaign.ends_at ?? null)} />
                <SummaryRow
                  label="Objective"
                  value={campaign.objective ?? "No objective recorded"}
                />
                <SummaryRow
                  label="Last import"
                  value={formatDateTime(attendeeSummary.latestImportAt)}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Import history</CardTitle>
              </CardHeader>
              <CardContent>
                <ActivityTimeline
                  events={importEvents}
                  emptyMessage="No attendees have been imported into this campaign yet."
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <EditCampaignDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        campaign={campaign}
        onSave={saveCampaign}
      />
    </>
  );
}

const EDIT_DENIED_ID = "campaign-edit-denied";
const EDIT_DENIED_REASON = "Editing campaigns is not part of your role.";

function attendeeName(member: Attendee) {
  return (
    member.raw_contact_name?.trim() ||
    member.raw_email?.trim() ||
    (member.contact_id ? "Matched contact" : "Unnamed attendee")
  );
}

/**
 * §9.11's explicit match states.
 *
 * The old cell printed the raw CSV company name in medium weight with "Awaiting account
 * match" underneath in muted 12px, which made a broken row look like a finished one. Both
 * bad states are now named in full-weight words next to an icon, so neither depends on a
 * colour or on the reader noticing a subtitle.
 */
function AttendeeMatchCell({ member }: { member: Attendee }) {
  const quality = describeAttendeeQuality(member);

  return (
    <div className="min-w-0 space-y-1">
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium",
          quality.match === "unmatched"
            ? "bg-warning text-warning-foreground"
            : "bg-muted text-muted-foreground",
        )}
      >
        {quality.match === "unmatched" && <AlertTriangle className="h-3 w-3" aria-hidden="true" />}
        {quality.matchLabel}
      </span>
      {quality.possibleDuplicate && (
        <span className="ml-1 inline-flex items-center gap-1 rounded-md bg-destructive px-1.5 py-0.5 text-xs font-medium text-destructive-foreground">
          <Copy className="h-3 w-3" aria-hidden="true" />
          Possible duplicate
        </span>
      )}
      <span className="block truncate text-xs text-muted-foreground">
        {member.raw_company_name?.trim() || "No company on the imported row"}
      </span>
    </div>
  );
}

type CampaignEditPayload = {
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  objective: string | null;
  starts_at: string | null;
  ends_at: string | null;
  notes: string | null;
};

const toDateInput = (value: string | null | undefined) => (value ? value.slice(0, 10) : "");

/**
 * FW-5: `updateCampaign` is exported and capability-checked at
 * `requireCapability("campaigns.manage", { resourceType: "campaign", … })`, and until now
 * had no caller anywhere in the product. A campaign's status, dates and objective were
 * therefore write-once at creation — a campaign could never be marked completed, which is
 * the state the whole follow-up flow is supposed to end in.
 *
 * `owner` is assignable through the same server function and is deliberately not offered.
 * There is no read of assignable profiles yet (`getAdminUsersFn` needs `users.view`, which
 * a salesperson does not have), and the only list to hand is the five-entry fixture in
 * `src/lib/users.ts` whose ids match no `profiles` row — so an owner control here would
 * write an id that breaks the ownership check the capability system runs against it.
 */
function EditCampaignDialog({
  open,
  onOpenChange,
  campaign,
  onSave,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  campaign: CampaignWorkspaceRead["campaign"];
  onSave: (updates: CampaignEditPayload) => Promise<void>;
}) {
  const [name, setName] = useState(campaign.name);
  const [type, setType] = useState<CampaignType>(campaign.type);
  const [status, setStatus] = useState<CampaignStatus>(campaign.status);
  const [objective, setObjective] = useState(campaign.objective ?? "");
  const [notes, setNotes] = useState(campaign.notes ?? "");
  const [startsAt, setStartsAt] = useState(toDateInput(campaign.starts_at));
  const [endsAt, setEndsAt] = useState(toDateInput(campaign.ends_at));
  const [saving, setSaving] = useState(false);

  /**
   * Re-seed from the server whenever the dialog is opened, so a refetch that landed while
   * it was closed is not silently overwritten by a form still holding the old values.
   */
  const openDialog = (next: boolean) => {
    if (saving) return;
    if (next) {
      setName(campaign.name);
      setType(campaign.type);
      setStatus(campaign.status);
      setObjective(campaign.objective ?? "");
      setNotes(campaign.notes ?? "");
      setStartsAt(toDateInput(campaign.starts_at));
      setEndsAt(toDateInput(campaign.ends_at));
    }
    onOpenChange(next);
  };

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
      await onSave({
        name: trimmedName,
        type,
        status,
        objective: objective.trim() || null,
        notes: notes.trim() || null,
        starts_at: startsAt ? `${startsAt}T00:00:00.000Z` : null,
        ends_at: endsAt ? `${endsAt}T00:00:00.000Z` : null,
      });
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={openDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit campaign</DialogTitle>
          <DialogDescription>
            Changing the status here is what moves a campaign out of the active list.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="edit-campaign-name" className="text-xs">
              Name
            </Label>
            <Input
              id="edit-campaign-name"
              name="name"
              autoComplete="off"
              className="mt-1"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="edit-campaign-type" className="text-xs">
              Type
            </Label>
            <Select value={type} onValueChange={(value) => setType(value as CampaignType)}>
              <SelectTrigger id="edit-campaign-type" className="mt-1">
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
            <Label htmlFor="edit-campaign-status" className="text-xs">
              Status
            </Label>
            <Select value={status} onValueChange={(value) => setStatus(value as CampaignStatus)}>
              <SelectTrigger id="edit-campaign-status" className="mt-1">
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
            <Label htmlFor="edit-campaign-start" className="text-xs">
              Start date
            </Label>
            <Input
              id="edit-campaign-start"
              name="starts_at"
              type="date"
              className="mt-1"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="edit-campaign-end" className="text-xs">
              End date
            </Label>
            <Input
              id="edit-campaign-end"
              name="ends_at"
              type="date"
              className="mt-1"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="edit-campaign-objective" className="text-xs">
              Objective
            </Label>
            <Textarea
              id="edit-campaign-objective"
              name="objective"
              className="mt-1"
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="edit-campaign-notes" className="text-xs">
              Notes
            </Label>
            <Textarea
              id="edit-campaign-notes"
              name="notes"
              className="mt-1"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => openDialog(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? "Saving…" : "Save campaign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
