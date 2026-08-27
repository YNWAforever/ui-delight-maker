import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";

import {
  AttentionQueue,
  EmptyWorkspaceState,
  ErrorState,
  FilterToolbar,
  FilteredEmptyState,
  MetricStrip,
  SectionHeader,
  StaleDataIndicator,
  WorkspaceHeader,
  type AttentionItem,
  type AttentionSeverity,
} from "@/components/sales";
import { ListPagination } from "@/components/list-pagination";
import { Button } from "@/components/ui/button";
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
import { useClientNow } from "@/hooks/use-client-now";
import { toSafeErrorMessage } from "@/lib/errors";
import { formatCount, formatDate, relativeTime } from "@/lib/format";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import type { RelationshipSignal } from "@/lib/types";
import { dismissRelationshipSignalFn } from "@/server-functions/relationship-signals";
import { getRelationshipIndexRead } from "@/server-functions/relationship-workspaces";

const RELATIONSHIP_PAGE_SIZE = 50;

/**
 * The ten signal types `buildRelationshipSignals` can emit, grouped the way a person works
 * through them rather than the way the generator happens to order them.
 *
 * Grouping is by *what you would do next*, which is why "no decision maker" and "no owner"
 * sit together: both are answered by naming a person. A type that is not listed here is
 * still rendered — see `OTHER_SECTION` — because a new signal type shipping invisibly is
 * worse than one landing in a slightly wrong group.
 */
const SIGNAL_TYPES = [
  "missing_decision_maker",
  "missing_champion",
  "unowned_account",
  "coverage_gap",
  "stale_touchpoint",
  "post_event_follow_up_due",
  "stale_quote",
  "high_risk_engagement",
  "negative_sentiment",
  "cross_sell_opportunity",
] as const;

type SignalType = (typeof SIGNAL_TYPES)[number];

const SIGNAL_TYPE_LABELS: Record<SignalType, string> = {
  missing_decision_maker: "Decision maker missing",
  missing_champion: "Champion missing",
  unowned_account: "Account has no owner",
  coverage_gap: "Coverage gap",
  stale_touchpoint: "Stale touchpoint",
  post_event_follow_up_due: "Post-event follow-up due",
  stale_quote: "Stale quote",
  high_risk_engagement: "High-risk engagement",
  negative_sentiment: "Negative sentiment",
  cross_sell_opportunity: "Cross-sell opportunity",
};

function signalTypeLabel(type: string): string {
  const labels: Record<string, string | undefined> = SIGNAL_TYPE_LABELS;
  return labels[type] ?? type.replace(/_/g, " ");
}

/**
 * Severity here is the queue's *chip*, not the signal's stored `severity` column.
 *
 * `AttentionQueue` renders one of seven fixed words, each with an icon, so the mapping has
 * to answer "what kind of exception is this" rather than "how bad is it". A stale
 * relationship reads as Stuck; a gap or a risk reads as At risk; a cross-sell reads as
 * High value, because that is the only one of the seven that describes an opportunity
 * rather than a problem.
 */
const SIGNAL_SEVERITY: Record<SignalType, AttentionSeverity> = {
  missing_decision_maker: "risk",
  missing_champion: "risk",
  unowned_account: "risk",
  coverage_gap: "risk",
  stale_touchpoint: "stuck",
  post_event_follow_up_due: "stuck",
  stale_quote: "stuck",
  high_risk_engagement: "risk",
  negative_sentiment: "risk",
  cross_sell_opportunity: "value",
};

function attentionSeverity(type: string): AttentionSeverity {
  const map: Record<string, AttentionSeverity | undefined> = SIGNAL_SEVERITY;
  return map[type] ?? "risk";
}

type SignalSection = {
  id: string;
  title: string;
  description: string;
  types: readonly SignalType[];
  emptyTitle: string;
  emptyDescription: string;
};

const SECTIONS: SignalSection[] = [
  {
    id: "stakeholders",
    title: "Stakeholder gaps",
    description: "Accounts with nobody mapped to the role the next commercial step needs.",
    types: ["missing_decision_maker", "missing_champion", "unowned_account", "coverage_gap"],
    emptyTitle: "Every account has its people mapped",
    emptyDescription: "Decision makers, champions and owners are all recorded.",
  },
  {
    id: "stale",
    title: "Stale relationships",
    description: "Nobody has been in touch inside the cadence this account is held to.",
    types: ["stale_touchpoint", "post_event_follow_up_due", "stale_quote"],
    emptyTitle: "No relationship has gone quiet",
    emptyDescription: "Every account has a touchpoint inside its cadence.",
  },
  {
    id: "risk",
    title: "High-risk engagements",
    description: "Active work carrying high renewal risk or a negative senior stakeholder.",
    types: ["high_risk_engagement", "negative_sentiment"],
    emptyTitle: "No engagement is flagged high risk",
    emptyDescription: "Active engagements are scoring medium or low renewal risk.",
  },
  {
    id: "growth",
    title: "Cross-sell opportunities",
    description: "Active clients not yet using a product they are a fit for.",
    types: ["cross_sell_opportunity"],
    emptyTitle: "No cross-sell openings right now",
    emptyDescription: "Active clients are already using the products they fit.",
  },
];

/**
 * The catch-all. Its `types` list is empty because membership is decided by exclusion:
 * anything the four sections above did not claim lands here rather than disappearing.
 */
const OTHER_SECTION: SignalSection = {
  id: "other",
  title: "Other signals",
  description: "Signal types this workspace does not group yet.",
  types: [],
  emptyTitle: "Nothing ungrouped",
  emptyDescription: "Every open signal fits one of the sections above.",
};

const SEVERITY_VALUES = ["all", "high", "medium", "low"] as const;
const SIGNAL_TYPE_VALUES = ["all", ...SIGNAL_TYPES] as const;

/**
 * Page, severity and signal type all live in the URL.
 *
 * Page used to be `useState`, so a refresh, a shared link or the Back button silently
 * returned the reader to page 1 while the loader only ever fetched page 1 anyway. Severity
 * and signal type were already honoured by `listRelationshipIndexPage` and had no control
 * at all. `limit` is deliberately **not** a search param: nothing on the page can set it,
 * and a URL contract advertising a knob that does nothing is the defect on `/renewals`.
 */
const relationshipSearchSchema = z.object({
  page: z.coerce.number().int().min(1).default(1).catch(1),
  severity: z.enum(SEVERITY_VALUES).default("all").catch("all"),
  signalType: z.enum(SIGNAL_TYPE_VALUES).default("all").catch("all"),
});

type RelationshipSearch = z.infer<typeof relationshipSearchSchema>;

/** The one place search params become server filters, so the loader and the component agree. */
const toRelationshipFilters = (search: RelationshipSearch) => ({
  page: search.page,
  limit: RELATIONSHIP_PAGE_SIZE,
  severity: search.severity === "all" ? undefined : search.severity,
  signalType: search.signalType === "all" ? undefined : search.signalType,
});

export const Route = createFileRoute("/relationships")({
  validateSearch: relationshipSearchSchema,
  loaderDeps: ({ search }) => toRelationshipFilters(search),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(
      routeQueryOptions({
        queryKey: crmQueryKeys.relationships.list(deps),
        queryFn: () => getRelationshipIndexRead({ data: deps }),
      }),
    ),
  head: () => ({
    meta: [
      { title: "Relationship Command Center — Fimmick ClientOps" },
      {
        name: "description",
        content:
          "Accounts with open relationship signals: stakeholder gaps, stale relationships, risk and cross-sell.",
      },
    ],
  }),
  errorComponent: RelationshipsErrorState,
  component: RelationshipsPage,
});

/**
 * Loader failures used to fall through to the root boundary, which renders the thrown
 * message into the page body. Both loaders on this route can throw a capability denial,
 * and `getRelationshipIndexRead` requires two capabilities the sidebar does not check.
 */
function RelationshipsErrorState({ error }: { error: unknown }) {
  const router = useRouter();

  return (
    <div className="px-4 py-6 md:px-6">
      <ErrorState
        kind="server"
        error={error}
        title="Relationship signals did not load"
        onRetry={() => {
          void router.invalidate({ filter: (match) => match.routeId === "/relationships" });
        }}
      />
    </div>
  );
}

function RelationshipsPage() {
  const initialRead = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const router = useRouter();
  const queryClient = useQueryClient();
  const clientNow = useClientNow();

  const filters = toRelationshipFilters(search);
  const relationshipQueryKey = crmQueryKeys.relationships.list(filters);
  /**
   * Seeded from the loader for *this* page, which is the whole fix.
   *
   * The previous version pinned `initialData` and its render fallback to a loader snapshot
   * that was always page 1, so a failed fetch of page 3 showed page-1 rows under a "Page 3"
   * caption and a banner claiming they were the previous results. `loaderDeps` now carries
   * every filter, so the snapshot and the query key always describe the same request.
   */
  const relationshipQuery = useQuery({
    ...routeQueryOptions({
      queryKey: relationshipQueryKey,
      queryFn: () => getRelationshipIndexRead({ data: filters }),
    }),
    initialData: initialRead,
  });

  const relationshipData = relationshipQuery.data;
  const items = relationshipData.items;
  const canDismiss = relationshipData.canDismissSignals;

  const accountNameById = useMemo(
    () => new Map(items.map((item) => [item.account.id, item.account.name])),
    [items],
  );
  const accountOwnerById = useMemo(
    () => new Map(items.map((item) => [item.account.id, item.account.account_owner])),
    [items],
  );
  const signals = useMemo(() => items.flatMap((item) => item.signalSummaries), [items]);
  const hiddenSignalCount = useMemo(
    () =>
      items.reduce(
        (total, item) => total + Math.max(0, item.openSignalCount - item.signalSummaries.length),
        0,
      ),
    [items],
  );

  const [dismissTarget, setDismissTarget] = useState<RelationshipSignal | null>(null);
  const [dismissReason, setDismissReason] = useState("");
  const [dismissingIds, setDismissingIds] = useState<ReadonlySet<string>>(() => new Set<string>());
  const isDismissing = dismissingIds.size > 0;

  const setSearchValue = (patch: Partial<RelationshipSearch>) =>
    navigate({ search: (current) => ({ ...current, ...patch, page: 1 }), replace: true });
  const setPage = (page: number) =>
    navigate({ search: (current) => ({ ...current, page }), replace: true });

  const hasActiveFilters = search.severity !== "all" || search.signalType !== "all";
  const clearFilters = () => setSearchValue({ severity: "all", signalType: "all" });
  const filterSummary = [
    search.severity !== "all"
      ? `Severity: ${search.severity.charAt(0).toUpperCase()}${search.severity.slice(1)}`
      : null,
    search.signalType !== "all" ? `Type: ${signalTypeLabel(search.signalType)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const signalAge = (signal: RelationshipSignal) =>
    clientNow === null
      ? `Raised ${formatDate(signal.created_at)}`
      : `Raised ${relativeTime(signal.created_at, clientNow)}`;

  /**
   * Dismiss is the only write on this page, and it is real:
   * `dismissRelationshipSignalFn` -> `requireCapability("engagements.update", …)` ->
   * `dismissRelationshipSignal`, which stamps `dismissed_at`.
   *
   * There is no optimistic removal. The row leaves because the refetch no longer returns
   * it, which is also why the invalidation runs before the dialog closes: a signal that
   * vanished locally and came back on the next loader run is the "did that work?" failure
   * this route already had once.
   */
  const runDismiss = async () => {
    const signal = dismissTarget;
    if (!signal || dismissingIds.has(signal.id)) return;

    const reason = dismissReason.trim();
    if (reason === "") {
      toast.error("Add a reason before dismissing this signal.");
      return;
    }

    setDismissingIds((current) => new Set(current).add(signal.id));
    try {
      await dismissRelationshipSignalFn({ data: { id: signal.id, reason } });
      await queryClient.invalidateQueries({ queryKey: crmQueryKeys.relationships.lists() });
      await router.invalidate({ filter: (match) => match.routeId === "/relationships" });
      setDismissTarget(null);
      setDismissReason("");
      toast.success("Signal dismissed");
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
    } finally {
      setDismissingIds((current) => {
        const next = new Set(current);
        next.delete(signal.id);
        return next;
      });
    }
  };

  const toAttentionItem = (signal: RelationshipSignal): AttentionItem => ({
    id: signal.id,
    severity: attentionSeverity(signal.signal_type),
    title: `${accountNameById.get(signal.account_id) ?? "Unknown account"} — ${signal.title}`,
    reason: signal.suggested_action?.trim()
      ? `${signal.reason} ${signal.suggested_action}`
      : signal.reason,
    owner: accountOwnerById.get(signal.account_id) ?? undefined,
    age: signalAge(signal),
    href: `/accounts/${signal.account_id}`,
    // No button at all when the caller's `engagements.update` probe came back false: the
    // write is certain to be refused, so a disabled control would only be a second way of
    // saying the same thing the caption above already says.
    action: canDismiss ? (
      <Button
        variant="outline"
        size="sm"
        disabled={isDismissing}
        onClick={() => {
          setDismissTarget(signal);
          setDismissReason("");
        }}
      >
        {dismissingIds.has(signal.id) ? "Dismissing…" : "Dismiss"}
      </Button>
    ) : undefined,
  });

  const claimedTypes = new Set<string>(SECTIONS.flatMap((section) => section.types));
  const sectionItems = (section: SignalSection) =>
    signals
      .filter((signal) =>
        section.id === OTHER_SECTION.id
          ? !claimedTypes.has(signal.signal_type)
          : (section.types as readonly string[]).includes(signal.signal_type),
      )
      .map(toAttentionItem);

  const severityCount = (severity: RelationshipSignal["severity"]) =>
    signals.filter((signal) => signal.severity === severity).length;

  const visibleSections = [...SECTIONS, OTHER_SECTION]
    .map((section) => ({ section, items: sectionItems(section) }))
    .filter(({ section, items: rows }) => section.id !== OTHER_SECTION.id || rows.length > 0);

  const totalOnScreen = signals.length;

  return (
    <>
      <WorkspaceHeader
        context="Retain & Grow"
        title="Relationship Command Center"
        description={`${formatCount(relationshipData.total)} accounts have open relationship signals. This page shows the highest-priority signals for ${formatCount(items.length)} of them.`}
        status={
          <StaleDataIndicator
            updatedAt={new Date(relationshipQuery.dataUpdatedAt).toISOString()}
            isRefetching={relationshipQuery.isFetching}
          />
        }
      />

      <div className="space-y-6 px-4 py-6 md:px-6">
        <MetricStrip
          metrics={[
            {
              id: "accounts",
              label: "Accounts flagged",
              value: relationshipData.total,
              hint: "with at least one open signal",
            },
            {
              id: "high",
              label: "High severity",
              value: severityCount("high"),
              hint: "signals on this page",
              tone: severityCount("high") > 0 ? "destructive" : "neutral",
            },
            {
              id: "medium",
              label: "Medium severity",
              value: severityCount("medium"),
              hint: "signals on this page",
              tone: severityCount("medium") > 0 ? "warning" : "neutral",
            },
            {
              id: "low",
              label: "Low severity",
              value: severityCount("low"),
              hint: "signals on this page",
            },
          ]}
          columns={4}
        />

        {relationshipQuery.isError && (
          <ErrorState
            kind="stale"
            error={relationshipQuery.error}
            title="The latest relationship signals did not load"
            description="You are looking at the last results that loaded successfully for these filters."
            retryLabel="Retry"
            onRetry={() => void relationshipQuery.refetch()}
          />
        )}

        <FilterToolbar
          filters={[
            {
              id: "severity",
              label: "Severity",
              value: search.severity,
              onChange: (value) =>
                setSearchValue({ severity: value as RelationshipSearch["severity"] }),
              options: [
                { value: "all", label: "All severities" },
                { value: "high", label: "High" },
                { value: "medium", label: "Medium" },
                { value: "low", label: "Low" },
              ],
            },
            {
              id: "signalType",
              label: "Signal type",
              value: search.signalType,
              onChange: (value) =>
                setSearchValue({ signalType: value as RelationshipSearch["signalType"] }),
              options: [
                { value: "all", label: "All signal types" },
                ...SIGNAL_TYPES.map((value) => ({ value, label: SIGNAL_TYPE_LABELS[value] })),
              ],
            },
          ]}
          onClear={clearFilters}
          resultCount={totalOnScreen}
        />

        {!canDismiss && totalOnScreen > 0 && (
          <p className="text-xs text-muted-foreground">
            You can review these signals but not dismiss them — dismissing needs the
            engagement-update capability.
          </p>
        )}

        {hiddenSignalCount > 0 && (
          <p className="text-xs text-muted-foreground">
            Showing the 10 highest-priority signals per account. {formatCount(hiddenSignalCount)}{" "}
            further open signal{hiddenSignalCount === 1 ? " is" : "s are"} on the account records
            themselves.
          </p>
        )}

        {totalOnScreen === 0 ? (
          hasActiveFilters ? (
            <FilteredEmptyState onClear={clearFilters} filterSummary={filterSummary} />
          ) : (
            <EmptyWorkspaceState
              title="No open relationship signals"
              description="Import event attendees, map stakeholders, or run relationship intelligence on an account to generate the next set of actions."
            />
          )
        ) : (
          visibleSections.map(({ section, items: rows }) => (
            <section key={section.id} className="space-y-3">
              <SectionHeader
                title={section.title}
                description={section.description}
                action={
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {formatCount(rows.length)} open
                  </span>
                }
              />
              <AttentionQueue
                items={rows}
                emptyTitle={section.emptyTitle}
                emptyDescription={section.emptyDescription}
              />
            </section>
          ))
        )}

        <ListPagination
          page={relationshipData.page}
          limit={relationshipData.limit}
          total={relationshipData.total}
          onPageChange={setPage}
        />
      </div>

      <Dialog
        open={dismissTarget !== null}
        onOpenChange={(open) => {
          if (isDismissing) return;
          if (!open) setDismissTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dismiss this signal?</DialogTitle>
            <DialogDescription>
              {dismissTarget
                ? `${signalTypeLabel(dismissTarget.signal_type)} on ${accountNameById.get(dismissTarget.account_id) ?? "this account"}. The reason is stored on the signal and it stops appearing in this queue.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="dismiss-signal-reason" className="text-xs">
              Dismissal reason
            </Label>
            <Input
              id="dismiss-signal-reason"
              name="dismiss-signal-reason"
              autoComplete="off"
              placeholder="Why is this signal being dismissed?"
              value={dismissReason}
              onChange={(event) => setDismissReason(event.target.value)}
              disabled={isDismissing}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={isDismissing}
              onClick={() => setDismissTarget(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={isDismissing || dismissReason.trim() === ""}
              onClick={() => void runDismiss()}
            >
              {isDismissing ? "Dismissing…" : "Dismiss signal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
