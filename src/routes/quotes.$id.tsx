import { lazy, Suspense, useState, type SetStateAction } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Download,
  Lock,
  Send,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  ActivityTimeline,
  EmptyWorkspaceState,
  ErrorState,
  LoadingSkeleton,
  SectionHeader,
  StaleDataIndicator,
  StatusBadge,
  StickyActionBar,
  WorkspaceHeader,
  type ActivityEvent,
} from "@/components/sales";
import type { PricingTemplate, QuoteLineItem, QuoteStatus, QuoteVersion } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { quoteDetailSearchSchema } from "@/lib/admin-ux-search";
import { useQuoteReferenceData } from "@/hooks/use-quote-reference-data";
import { ROLE_GRANTS } from "@/lib/admin/policy";
import type { Capability } from "@/lib/admin/types";
import { toSafeErrorMessage } from "@/lib/errors";
import {
  invalidateLinkedCompanyWorkspaceMutation,
  type CompanyWorkspaceMutation,
} from "@/lib/company-workspace/invalidation";
import { crmQueryKeys } from "@/lib/query-keys";
import { getStatusLabel } from "@/lib/status-labels";
import { formatCurrencyAmount, formatDate, formatDateTime } from "@/lib/format";
import { calculateTotal, newLineItem } from "@/lib/quote-utils";
import {
  acceptQuoteAndCreateJobSheet,
  approveAndIssueQuote,
  approveQuote,
  issueQuoteVersion,
  rejectQuote,
  requestQuoteApproval,
  updateQuote,
} from "@/server-functions/quotes";
import {
  getQuoteDetailRead,
  getQuoteDocumentRead,
  getQuoteVersionsSection,
} from "@/server-functions/quote-workspace";

const QuoteDocumentPreview = lazy(() =>
  import("@/components/quotes/quote-document-tools").then((module) => ({
    default: module.QuoteDocumentPreview,
  })),
);

export const Route = createFileRoute("/quotes/$id")({
  validateSearch: quoteDetailSearchSchema,
  loader: ({ params }) => getQuoteDetailRead({ data: { id: params.id } }),
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.quote?.number ?? "Quote"} — ClientOps` },
      { name: "description", content: `Quote details, approval status, and PDF preview.` },
    ],
  }),
  notFoundComponent: () => (
    <div className="px-4 py-6 md:px-6">
      <h1 className="text-2xl font-semibold tracking-tight lg:text-3xl">Quote not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This quote has been removed, or the link is wrong.
      </p>
      <Link to="/quotes" className="mt-4 inline-block text-sm text-primary hover:underline">
        ← Back to quotes
      </Link>
    </div>
  ),
  errorComponent: QuoteDetailError,
  component: QuoteDetail,
});

/**
 * IF-C2-35: the root boundary prints `error.message` into the page body, so a Neon driver
 * message or a capability refusal reaches the reader verbatim. A route-local boundary keeps
 * the raw text in the console and shows a sanitized sentence with a way back.
 */
function QuoteDetailError({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="px-4 py-6 md:px-6">
      <ErrorState
        kind="server"
        error={error}
        title="This quote could not be loaded"
        retryLabel="Reload quote"
        onRetry={() => {
          reset();
          void router.invalidate({ filter: (match) => match.routeId === "/quotes/$id" });
        }}
      />
      <div className="mt-4 text-center">
        <Link to="/quotes" className="text-sm text-primary hover:underline">
          ← Back to quotes
        </Link>
      </div>
    </div>
  );
}

const TIMELINE: QuoteStatus[] = [
  "draft",
  "pending_approval",
  "approved",
  "sent",
  "viewed",
  "accepted",
];

const VERSION_REASON_LABELS: Record<QuoteVersion["reason"], string> = {
  issued: "Issued snapshot",
  revised: "Revision snapshot",
  accepted: "Accepted snapshot",
  change_order: "Change order snapshot",
};

const quoteMutationQueryKeys = {
  save: (quoteId: string) => [crmQueryKeys.quotes.detail(quoteId), crmQueryKeys.quotes.lists()],
  approval: (quoteId: string) => [
    crmQueryKeys.quotes.detail(quoteId),
    crmQueryKeys.quotes.lists(),
    crmQueryKeys.approvals.lists(),
  ],
  approval_issue: (quoteId: string) => [
    crmQueryKeys.quotes.detail(quoteId),
    crmQueryKeys.quotes.lists(),
    crmQueryKeys.approvals.lists(),
    crmQueryKeys.quotes.section(quoteId, "versions"),
    crmQueryKeys.quotes.section(quoteId, "document"),
  ],
  issue: (quoteId: string) => [
    crmQueryKeys.quotes.detail(quoteId),
    crmQueryKeys.quotes.lists(),
    crmQueryKeys.quotes.section(quoteId, "versions"),
    crmQueryKeys.quotes.section(quoteId, "document"),
  ],
  accept: (quoteId: string) => [
    crmQueryKeys.quotes.detail(quoteId),
    crmQueryKeys.quotes.lists(),
    crmQueryKeys.quotes.section(quoteId, "versions"),
    crmQueryKeys.quotes.section(quoteId, "document"),
    crmQueryKeys.jobSheets.lists(),
  ],
} as const;

/**
 * Which company-workspace sections each quote mutation stales.
 *
 * Acceptance is the one that reaches delivery_finance, because it writes a job sheet as
 * well as the quote.
 */
const quoteMutationWorkspaceEffects = {
  save: "change_quote",
  approval: "change_quote",
  approval_issue: "change_quote",
  issue: "change_quote",
  accept: "accept_quote",
} as const satisfies Record<keyof typeof quoteMutationQueryKeys, CompanyWorkspaceMutation>;

async function invalidateQuoteMutation(
  queryClient: ReturnType<typeof useQueryClient>,
  quote: { id: string; account_id: string | null },
  mutation: keyof typeof quoteMutationQueryKeys,
) {
  await Promise.all([
    ...quoteMutationQueryKeys[mutation](quote.id).map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
    // The quote's own keys are not enough: Account 360 counts quotes off
    // quotes.account_id and its timeline unions the quotes table, so both go stale here.
    invalidateLinkedCompanyWorkspaceMutation(
      queryClient,
      quote.account_id,
      quoteMutationWorkspaceEffects[mutation],
    ),
  ]);
}

/* -------------------------------------------------------------------------------------
 * Lifecycle actions
 *
 * Every lifecycle action is declared once and always rendered. A control the current state
 * or the current role does not allow is disabled with the reason printed beside it, never
 * dropped from the page: a salesperson who cannot find "Approve" has no way to learn that
 * approval is a manager's job, and a quote whose buttons silently change on every
 * transition reads as a broken page rather than a governed one.
 *
 * The capability check here is an honesty hint, not enforcement — `requireCapability` on
 * the server remains the only thing that decides. It reads the same role table the server
 * consults, but a per-user override can still widen access, so the hint defaults to
 * "allowed" whenever the shell profile is unavailable rather than disabling a control that
 * would in fact have worked.
 * ---------------------------------------------------------------------------------- */

type LifecycleActionKey = "request_approval" | "reject" | "approve" | "issue" | "accept";

type LifecycleAction = {
  key: LifecycleActionKey;
  label: string;
  /** What this step does, shown while the control is available. */
  hint: string;
  icon: LucideIcon;
  variant: "default" | "outline";
  capability: Capability;
  /** Why this role cannot run it. Never names a capability string. */
  capabilityReason: string;
  allowedStatuses: readonly QuoteStatus[];
};

const LIFECYCLE_ACTIONS: readonly LifecycleAction[] = [
  {
    key: "request_approval",
    label: "Submit for approval",
    hint: "Moves the quote into the approval queue.",
    icon: Send,
    variant: "default",
    capability: "quotes.request_approval",
    capabilityReason: "Submitting quotes for approval is not part of your role.",
    allowedStatuses: ["draft"],
  },
  {
    key: "reject",
    label: "Reject",
    hint: "Sends the quote back as rejected.",
    icon: XCircle,
    variant: "outline",
    capability: "quotes.approve",
    capabilityReason: "Deciding on quote approvals requires manager access.",
    allowedStatuses: ["pending_approval"],
  },
  {
    key: "approve",
    label: "Approve",
    hint: "Approves the commercials so the quote can be issued.",
    icon: CheckCircle2,
    variant: "default",
    capability: "quotes.approve",
    capabilityReason: "Deciding on quote approvals requires manager access.",
    allowedStatuses: ["pending_approval"],
  },
  {
    key: "issue",
    label: "Issue quote",
    hint: "Freezes an immutable snapshot and sends the quote to the client.",
    icon: Send,
    variant: "default",
    capability: "quotes.issue",
    capabilityReason: "Issuing quotes to clients requires administrator access.",
    allowedStatuses: ["approved"],
  },
  {
    key: "accept",
    label: "Mark accepted",
    hint: "Records the client's acceptance and opens a job sheet for accounting.",
    icon: CheckCircle2,
    variant: "default",
    capability: "job_sheets.accept",
    capabilityReason: "Recording an acceptance is done by accounting.",
    allowedStatuses: ["sent", "viewed"],
  },
] as const;

function statusWord(status: string) {
  return getStatusLabel("quotes", status).label.toLowerCase();
}

function describeAllowedStatuses(statuses: readonly QuoteStatus[]) {
  const words = statuses.map(statusWord);
  if (words.length === 1) return words[0];
  return `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
}

/** The sentence to print beside a disabled control, or null when it is available. */
function lifecycleBlockedReason(
  action: LifecycleAction,
  status: QuoteStatus,
  canRun: (capability: Capability) => boolean,
): string | null {
  if (!canRun(action.capability)) return action.capabilityReason;
  if (!action.allowedStatuses.includes(status)) {
    return `Available while the quote is ${describeAllowedStatuses(
      action.allowedStatuses,
    )}. It is ${statusWord(status)} now.`;
  }
  return null;
}

/** Why the commercials cannot be edited in this state, or null while they can. */
function lockReason(status: QuoteStatus): string | null {
  switch (status) {
    case "draft":
      return null;
    case "pending_approval":
      return "Waiting for a decision. Line items unlock again if the quote is rejected.";
    case "approved":
      return "Approved commercials are held as agreed until the quote is issued.";
    case "sent":
    case "viewed":
    case "accepted":
      return "This quote renders from an immutable snapshot taken when it was issued, so its line items can no longer change.";
    default:
      return "This quote is closed. Raise a new quote to change the commercials.";
  }
}

function QuoteDetail() {
  const initialRead = Route.useLoaderData();
  const search = Route.useSearch();
  const { profile } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const detailQuery = useQuery({
    queryKey: crmQueryKeys.quotes.detail(initialRead.quote.id),
    queryFn: () => getQuoteDetailRead({ data: { id: initialRead.quote.id } }),
    initialData: initialRead,
    staleTime: 30_000,
  });
  const { quote, lead, client } = detailQuery.data;
  const [versionPageByQuoteId, setVersionPageByQuoteId] = useState<Record<string, number>>({});
  const versionPage = versionPageByQuoteId[quote.id] ?? 1;
  const setVersionPage = (nextState: SetStateAction<number>) => {
    setVersionPageByQuoteId((previousPages) => {
      const previousPage = previousPages[quote.id] ?? 1;
      const nextPage = typeof nextState === "function" ? nextState(previousPage) : nextState;
      return { ...previousPages, [quote.id]: nextPage };
    });
  };
  const versionsQuery = useQuery({
    queryKey: crmQueryKeys.quotes.section(quote.id, "versions", { page: versionPage }),
    queryFn: () =>
      getQuoteVersionsSection({ data: { id: quote.id, page: versionPage, limit: 25 } }),
    enabled: search.tab === "versions",
    staleTime: 30_000,
  });
  const documentQuery = useQuery({
    queryKey: crmQueryKeys.quotes.section(quote.id, "document"),
    queryFn: () => getQuoteDocumentRead({ data: { id: quote.id } }),
    enabled: search.tab === "preview",
    staleTime: 30_000,
  });
  const versions = versionsQuery.data?.items ?? [];
  const { edit, approvalId } = search;

  /**
   * IF-C2-23: the status on screen is the status the server returned. The route used to
   * keep a local `statusByQuoteId` override that, once written, outranked every later
   * refetch — so a quote another user had rejected went on offering Approve indefinitely.
   */
  const status = quote.status as QuoteStatus;
  const isEditMode = edit === true || status === "draft";
  const locked = lockReason(status);

  const roleGrants = profile?.role ? ROLE_GRANTS[profile.role] : null;
  const canRun = (capability: Capability) => (roleGrants ? roleGrants.has(capability) : true);

  const navigate = useNavigate({ from: Route.fullPath });
  const [editorDrafts, setEditorDrafts] = useState<Record<string, QuoteLineItem[]>>(() => ({
    [quote.id]: quote.line_items ?? [],
  }));
  const [saving, setSaving] = useState(false);
  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const editItems = editorDrafts[quote.id] ?? quote.line_items ?? [];

  const setEditItems = (nextState: SetStateAction<QuoteLineItem[]>) => {
    setEditorDrafts((previousDrafts) => {
      const previousItems = previousDrafts[quote.id] ?? quote.line_items ?? [];
      const nextItems = typeof nextState === "function" ? nextState(previousItems) : nextState;
      return { ...previousDrafts, [quote.id]: nextItems };
    });
  };

  const totalValue = calculateTotal(editItems);
  const documentRead = documentQuery.data;
  const previewQuote =
    documentRead && isEditMode
      ? {
          ...documentRead.quote,
          total_value: totalValue,
          line_items: editItems,
        }
      : documentRead?.quote;
  const clientName =
    client?.company_name ?? lead?.company_name ?? quote.client_id ?? quote.lead_id ?? "Client";
  const currentPreviewVersionId = quote.accepted_version_id ?? quote.issued_version_id ?? null;

  const updateItemQty = (idx: number, qty: number) => {
    setEditItems((prev) =>
      prev.map((li, i) => (i === idx ? { ...li, qty: Math.max(1, qty) } : li)),
    );
  };

  const updateItemPrice = (idx: number, unit_price: number) => {
    setEditItems((prev) =>
      prev.map((li, i) => (i === idx ? { ...li, unit_price: Math.max(0, unit_price) } : li)),
    );
  };

  const removeItem = (idx: number) => {
    setEditItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const addFromTemplate = (template: PricingTemplate) => {
    setEditItems((prev) => [...prev, newLineItem(template)]);
    setCatalogueOpen(false);
  };

  const saveEditableQuoteFields = async () => {
    await updateQuote({
      data: { id: quote.id, updates: { line_items: editItems, total_value: totalValue } },
    });
  };

  const approveAndIssueReviewedQuote = async () => {
    if (!approvalId) {
      throw new Error("Approval context missing");
    }

    await saveEditableQuoteFields();
    await approveAndIssueQuote({ data: { id: quote.id, approvalId } });
    await invalidateQuoteMutation(queryClient, quote, "approval_issue");
    toast.success("Quote approved and issued");
    navigate({ to: "/approvals" });
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      await saveEditableQuoteFields();
      await invalidateQuoteMutation(queryClient, quote, "save");
      toast.success("Draft saved");
    } catch (err) {
      toast.error(toSafeErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitForApproval = async () => {
    setSaving(true);
    try {
      if (approvalId) {
        // Coming from the Approvals "Review & Edit" flow.
        await approveAndIssueReviewedQuote();
      } else {
        // Plain draft edit: save, then request approval.
        await saveEditableQuoteFields();
        await requestQuoteApproval({ data: { id: quote.id } });
        await invalidateQuoteMutation(queryClient, quote, "approval");
        toast.success("Quote submitted for approval");
      }
    } catch (err) {
      toast.error(toSafeErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const reachedIdx = TIMELINE.indexOf(status);

  /**
   * IF-C2-18: this was the one lifecycle handler with no in-flight flag, no `try`/`catch`
   * and an unconditional success toast — on a financial document, where a double click
   * re-entered the transition and a rejection produced no signal at all. It now matches its
   * four siblings exactly.
   */
  const handleRequestApproval = async () => {
    setSaving(true);
    try {
      // A draft is always on screen in its editable form, so the line items the user is
      // looking at are the ones being submitted. Persisting them first is what stops this
      // control from transitioning a quote whose commercials were just changed and never
      // saved — the silent-discard trap of having two buttons for one transition.
      if (isEditMode) await saveEditableQuoteFields();
      await requestQuoteApproval({ data: { id: quote.id } });
      await invalidateQuoteMutation(queryClient, quote, "approval");
      toast.success("Quote submitted for approval");
    } catch (err) {
      toast.error(toSafeErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleRejectQuote = async () => {
    setSaving(true);
    try {
      await rejectQuote({ data: { id: quote.id, approvalId } });
      await invalidateQuoteMutation(queryClient, quote, "approval");
      toast.success("Quote rejected");
      if (approvalId) {
        navigate({ to: "/approvals" });
      }
    } catch (err) {
      toast.error(toSafeErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleApproveQuote = async () => {
    setSaving(true);
    try {
      if (approvalId) {
        await approveAndIssueReviewedQuote();
        return;
      }

      await approveQuote({ data: { id: quote.id } });
      await invalidateQuoteMutation(queryClient, quote, "approval");
      toast.success("Quote approved");
    } catch (err) {
      toast.error(toSafeErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleIssueQuote = async () => {
    setSaving(true);
    try {
      await issueQuoteVersion({ data: { id: quote.id } });
      await invalidateQuoteMutation(queryClient, quote, "issue");
      toast.success("Quote issued and PDF version created");
    } catch (err) {
      toast.error(toSafeErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleAcceptQuote = async () => {
    setSaving(true);
    try {
      const result = await acceptQuoteAndCreateJobSheet({ data: { id: quote.id } });
      await Promise.all([
        invalidateQuoteMutation(queryClient, quote, "accept"),
        quote.client_id
          ? queryClient.invalidateQueries({
              queryKey: crmQueryKeys.clients.section(quote.client_id, "commercial"),
            })
          : Promise.resolve(),
        quote.client_id
          ? queryClient.invalidateQueries({
              queryKey: crmQueryKeys.clients.section(quote.client_id, "job_sheets"),
            })
          : Promise.resolve(),
      ]);
      toast.success(`Quote accepted. Job sheet ${result.jobSheet.number} is ready for accounting.`);
    } catch (err) {
      toast.error(toSafeErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const lifecycleHandlers: Record<LifecycleActionKey, () => Promise<void>> = {
    request_approval: handleRequestApproval,
    reject: handleRejectQuote,
    approve: handleApproveQuote,
    issue: handleIssueQuote,
    accept: handleAcceptQuote,
  };

  /**
   * Reasons that are neither a state nor a permission. Checked after those two so a quote
   * that is not a draft says so, rather than being told to add a line item it cannot add.
   */
  const extraBlockedReasons: Partial<Record<LifecycleActionKey, string>> =
    isEditMode && editItems.length === 0
      ? { request_approval: "Add at least one line item before submitting this quote." }
      : {};

  const blockedReasonFor = (action: LifecycleAction) =>
    lifecycleBlockedReason(action, status, canRun) ?? extraBlockedReasons[action.key] ?? null;

  const nextAction =
    LIFECYCLE_ACTIONS.find(
      (action) => action.key !== "reject" && action.allowedStatuses.includes(status),
    ) ?? null;
  const nextActionReason = nextAction ? blockedReasonFor(nextAction) : null;
  const NextActionIcon = nextAction?.icon;

  const versionEvents: ActivityEvent[] = versions.map((version) => ({
    id: version.id,
    at: version.created_at,
    kind: version.reason,
    title: `Version ${version.version_number} · ${VERSION_REASON_LABELS[version.reason]}`,
    description:
      version.id === currentPreviewVersionId
        ? "This is the snapshot the PDF preview renders."
        : undefined,
    // Author names are not resolvable here: the version read returns a profile id and no
    // read model joins `profiles` yet. A system-written snapshot is the one actor that can
    // be named truthfully, so nothing is invented for the rest.
    actor: version.created_by ? undefined : { name: "System" },
  }));

  const versionPageCount = versionsQuery.data
    ? Math.max(1, Math.ceil(versionsQuery.data.total / versionsQuery.data.limit))
    : 1;

  return (
    <>
      <WorkspaceHeader
        context="Convert"
        title={quote.number ?? "Quote"}
        description={`${clientName} · ${formatCurrencyAmount(quote.total_value, quote.currency)}`}
        backHref={{ to: "/quotes", label: "All quotes" }}
        status={
          <StaleDataIndicator
            updatedAt={quote.updated_at ?? quote.created_at}
            isRefetching={detailQuery.isFetching}
          />
        }
        secondaryActions={[
          <Button key="print-view" variant="outline" size="sm" asChild>
            <Link to="/quotes/$id/pdf" params={{ id: quote.id }}>
              <Download aria-hidden="true" className="mr-2 h-4 w-4" /> Print view
            </Link>
          </Button>,
        ]}
        primaryAction={
          nextAction && NextActionIcon ? (
            <div className="flex flex-col items-start gap-1 md:items-end">
              <Button
                type="button"
                size="sm"
                disabled={saving || Boolean(nextActionReason)}
                aria-describedby={nextActionReason ? "next-action-reason" : undefined}
                onClick={() => void lifecycleHandlers[nextAction.key]()}
              >
                <NextActionIcon aria-hidden="true" className="mr-2 h-4 w-4" />
                {nextAction.label}
              </Button>
              {nextActionReason && (
                <p id="next-action-reason" className="max-w-xs text-xs text-muted-foreground">
                  {nextActionReason}
                </p>
              )}
            </div>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-6 px-4 py-6 md:px-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardContent className="p-5">
              <Tabs
                value={search.tab ?? "items"}
                onValueChange={(tab) =>
                  navigate({
                    search: (current) => ({
                      ...current,
                      tab: tab === "items" ? undefined : (tab as NonNullable<typeof search.tab>),
                    }),
                    replace: true,
                  })
                }
              >
                <div className="max-w-full overflow-x-auto pb-1">
                  <TabsList className="w-max">
                    <TabsTrigger value="items">Line items</TabsTrigger>
                    <TabsTrigger value="versions">
                      Versions
                      {versionsQuery.data ? " (" + versionsQuery.data.total + ")" : null}
                    </TabsTrigger>
                    <TabsTrigger value="preview">PDF preview</TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent value="items" className="mt-4 space-y-4">
                  <SectionHeader
                    title="Line items"
                    description={
                      isEditMode
                        ? "Quantities and unit prices are saved with the quote total."
                        : (locked ?? "Read-only.")
                    }
                    action={
                      isEditMode ? undefined : (
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 text-xs font-medium text-foreground">
                          <Lock aria-hidden="true" className="h-3 w-3" />
                          Locked
                        </span>
                      )
                    }
                  />
                  {isEditMode ? (
                    <div className="space-y-4">
                      {editItems.length === 0 ? (
                        <EmptyWorkspaceState
                          title="No line items yet"
                          description="Add at least one service from the catalogue before submitting this quote for approval."
                        />
                      ) : (
                        <div className="max-w-full overflow-x-auto">
                          <table className="min-w-[640px] w-full text-sm">
                            <thead>
                              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                                <th className="py-2 text-left font-medium">Service</th>
                                <th className="w-20 py-2 text-right font-medium">Qty</th>
                                <th className="w-28 py-2 text-right font-medium">Unit</th>
                                <th className="w-28 py-2 text-right font-medium">Subtotal</th>
                                <th className="w-8" />
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {editItems.map((li, idx) => (
                                <tr key={li.id}>
                                  <td className="py-3">
                                    <div className="font-medium">{li.service}</div>
                                    <div className="text-xs text-muted-foreground">
                                      {li.description}
                                    </div>
                                  </td>
                                  <td className="py-2 text-right">
                                    <Input
                                      aria-label={`Quantity for ${li.service}`}
                                      name={`line-${idx}-qty`}
                                      type="number"
                                      inputMode="numeric"
                                      min={1}
                                      value={li.qty}
                                      onChange={(e) =>
                                        updateItemQty(idx, parseInt(e.target.value, 10) || 1)
                                      }
                                      className="h-8 w-16 text-right tabular-nums"
                                    />
                                  </td>
                                  <td className="py-2 text-right">
                                    <Input
                                      aria-label={`Unit price for ${li.service}`}
                                      name={`line-${idx}-unit-price`}
                                      type="number"
                                      inputMode="numeric"
                                      min={0}
                                      value={li.unit_price}
                                      onChange={(e) =>
                                        updateItemPrice(idx, parseFloat(e.target.value) || 0)
                                      }
                                      className="h-8 w-24 text-right tabular-nums"
                                    />
                                  </td>
                                  <td className="py-3 text-right font-medium tabular-nums">
                                    {formatCurrencyAmount(li.qty * li.unit_price, quote.currency)}
                                  </td>
                                  <td className="py-3 text-right">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      aria-label={`Remove ${li.service}`}
                                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                      onClick={() => removeItem(idx)}
                                    >
                                      ×
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t border-border">
                                <td colSpan={3} className="py-3 text-right text-sm font-semibold">
                                  Total
                                </td>
                                <td className="py-3 text-right text-base font-semibold tabular-nums">
                                  {formatCurrencyAmount(totalValue, quote.currency)}
                                </td>
                                <td />
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}

                      <Sheet open={catalogueOpen} onOpenChange={setCatalogueOpen}>
                        <SheetTrigger asChild>
                          <Button variant="outline" size="sm">
                            + Add service from catalogue
                          </Button>
                        </SheetTrigger>
                        <SheetContent>
                          <SheetHeader>
                            <SheetTitle>Service Catalogue</SheetTitle>
                          </SheetHeader>
                          {catalogueOpen ? (
                            <QuotePricingCatalogue onSelect={addFromTemplate} />
                          ) : null}
                        </SheetContent>
                      </Sheet>

                      <StickyActionBar>
                        <Button variant="outline" onClick={handleSaveDraft} disabled={saving}>
                          Save draft
                        </Button>
                        <Button
                          onClick={handleSubmitForApproval}
                          disabled={saving || editItems.length === 0}
                          aria-describedby={
                            editItems.length === 0 ? "submit-blocked-reason" : undefined
                          }
                        >
                          <CheckCircle2 aria-hidden="true" className="mr-2 h-4 w-4" />
                          {approvalId ? "Approve & Issue" : "Save & Request Approval"}
                        </Button>
                      </StickyActionBar>
                      {/* IF-C2-27: the disabled state used to grey out with nothing said. */}
                      {editItems.length === 0 && (
                        <p
                          id="submit-blocked-reason"
                          className="text-right text-xs text-muted-foreground"
                        >
                          Add at least one line item before submitting this quote.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="max-w-full overflow-x-auto">
                      <table className="min-w-[560px] w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                            <th className="py-2 text-left font-medium">Service</th>
                            <th className="py-2 text-right font-medium">Qty</th>
                            <th className="py-2 text-right font-medium">Unit</th>
                            <th className="py-2 text-right font-medium">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {quote.line_items.map((li: (typeof quote.line_items)[number]) => (
                            <tr key={li.id}>
                              <td className="py-3">
                                <div className="font-medium">{li.service}</div>
                                <div className="text-xs text-muted-foreground">
                                  {li.description}
                                </div>
                              </td>
                              <td className="py-3 text-right tabular-nums">{li.qty}</td>
                              <td className="py-3 text-right tabular-nums">
                                {formatCurrencyAmount(li.unit_price, quote.currency)}
                              </td>
                              <td className="py-3 text-right font-medium tabular-nums">
                                {formatCurrencyAmount(li.qty * li.unit_price, quote.currency)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-border">
                            <td colSpan={3} className="py-3 text-right text-sm font-semibold">
                              Total
                            </td>
                            <td className="py-3 text-right text-base font-semibold tabular-nums">
                              {formatCurrencyAmount(quote.total_value, quote.currency)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="versions" className="mt-4 space-y-4">
                  <SectionHeader
                    title="Version history"
                    description="Immutable snapshots written when this quote was issued, revised or accepted."
                  />
                  {versionsQuery.isPending ? (
                    <LoadingSkeleton variant="panel" label="version history" rows={3} />
                  ) : versionsQuery.isError ? (
                    <ErrorState
                      kind="server"
                      error={versionsQuery.error}
                      title="Version history could not be loaded"
                      onRetry={() => void versionsQuery.refetch()}
                    />
                  ) : (
                    <div className="space-y-4">
                      <ActivityTimeline
                        events={versionEvents}
                        emptyMessage="No snapshots yet. The first one is written when the quote is issued."
                      />
                      {versionsQuery.data && versionsQuery.data.total > versionsQuery.data.limit ? (
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label="Previous version page"
                            disabled={versionPage <= 1}
                            onClick={() => setVersionPage((page) => Math.max(1, page - 1))}
                          >
                            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                          </Button>
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {versionPage} / {versionPageCount}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label="Next version page"
                            disabled={
                              versionPage * versionsQuery.data.limit >= versionsQuery.data.total
                            }
                            onClick={() => setVersionPage((page) => page + 1)}
                          >
                            <ArrowRight aria-hidden="true" className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="preview" className="mt-4 space-y-4">
                  <SectionHeader
                    title="PDF preview"
                    description="What the client sees. Open the print view to save it as a PDF."
                  />
                  <div className="overflow-hidden rounded-md border border-border bg-muted/20 p-3">
                    {documentQuery.isPending ? (
                      <LoadingSkeleton variant="detail" label="PDF preview" rows={4} />
                    ) : documentQuery.isError ? (
                      <ErrorState
                        kind="server"
                        error={documentQuery.error}
                        title="PDF preview could not be loaded"
                        onRetry={() => void documentQuery.refetch()}
                      />
                    ) : previewQuote && documentRead ? (
                      <Suspense fallback={<QuoteDocumentPreviewSkeleton />}>
                        <QuoteDocumentPreview
                          quote={previewQuote}
                          versions={documentRead.versions}
                          clientName={clientName}
                        />
                      </Suspense>
                    ) : null}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-4 p-5">
              <SectionHeader
                title="Lifecycle"
                description="Every step is listed. One that is unavailable says why."
              />
              <ul className="space-y-3">
                {LIFECYCLE_ACTIONS.map((action) => {
                  const reason = blockedReasonFor(action);
                  const reasonId = `lifecycle-${action.key}-reason`;
                  const Icon = action.icon;
                  return (
                    <li key={action.key}>
                      <Button
                        type="button"
                        variant={action.variant}
                        size="sm"
                        className="w-full justify-start"
                        disabled={saving || Boolean(reason)}
                        aria-describedby={reasonId}
                        onClick={() => void lifecycleHandlers[action.key]()}
                      >
                        <Icon aria-hidden="true" className="mr-2 h-4 w-4" />
                        {action.label}
                      </Button>
                      <p id={reasonId} className="mt-1 text-xs text-muted-foreground">
                        {reason ?? action.hint}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-5">
              <SectionHeader title="Status timeline" />
              <ol className="space-y-3">
                {TIMELINE.map((stage, idx) => {
                  const reached = idx <= reachedIdx;
                  const current = idx === reachedIdx;
                  return (
                    <li key={stage} className="flex items-center gap-3">
                      <div
                        className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                          reached
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-muted-foreground"
                        }`}
                      >
                        {reached ? (
                          <Check aria-hidden="true" className="h-3 w-3" />
                        ) : (
                          <span className="text-[10px] tabular-nums">{idx + 1}</span>
                        )}
                      </div>
                      <span
                        className={`text-sm ${
                          current
                            ? "font-semibold"
                            : reached
                              ? "text-foreground"
                              : "text-muted-foreground"
                        }`}
                      >
                        {getStatusLabel("quotes", stage).label}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-5">
              <SectionHeader title="Quote details" />
              <div className="space-y-3 text-sm">
                <Row label="Status">
                  <StatusBadge domain="quotes" value={status} />
                </Row>
                {locked && (
                  <p className="flex items-start gap-1.5 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                    <Lock aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>
                      <span className="font-medium text-foreground">Locked · </span>
                      {locked}
                    </span>
                  </p>
                )}
                {/* IF-C2-30: `account_id` is the column Account 360 rolls up on, and this
                    page never showed it. The account's name is not in the read model, so
                    the row links by id rather than inventing a label. */}
                <Row label="Account">
                  {quote.account_id ? (
                    <Link
                      to="/accounts/$id"
                      params={{ id: quote.account_id }}
                      className="text-primary hover:underline"
                    >
                      Open Account 360
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">Not linked</span>
                  )}
                </Row>
                {!quote.account_id && (
                  <p className="text-xs text-muted-foreground">
                    Account rollups count only quotes that carry an account link, so this one is
                    invisible on Account 360. The link cannot be set from this screen yet.
                  </p>
                )}
                <Row label="Client">
                  {client ? (
                    <Link
                      to="/clients/$id"
                      params={{ id: client.id }}
                      className="text-primary hover:underline"
                    >
                      {client.company_name}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">Not linked</span>
                  )}
                </Row>
                <Row label="Lead">
                  {lead ? (
                    <Link
                      to="/leads/$id"
                      params={{ id: lead.id }}
                      className="text-primary hover:underline"
                    >
                      {lead.company_name}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">Not linked</span>
                  )}
                </Row>
                <Separator />
                {/* IF-C2-28: these rows used to resolve ids through a hardcoded fixture map
                    that can never match a real profile, so "Approved by" printed "Pending"
                    on quotes that were in fact approved — contradicting the badge three rows
                    above. Until a read model joins `profiles`, they say what is true. */}
                <Row label="Created by">
                  <span className="text-muted-foreground">
                    {quote.created_by ? "Name not available" : "Not recorded"}
                  </span>
                </Row>
                <Row label="Approved by">
                  <span className="text-muted-foreground">
                    {quote.approved_by ? "Name not available" : "Not approved yet"}
                  </span>
                </Row>
                <Separator />
                <Row label="Valid until">{formatDate(quote.valid_until)}</Row>
                <Row label="Created">{formatDateTime(quote.created_at)}</Row>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function QuotePricingCatalogue({ onSelect }: { onSelect: (template: PricingTemplate) => void }) {
  const catalogue = useQuoteReferenceData<PricingTemplate>("pricing", {
    items: [],
    total: 0,
    page: 1,
    limit: 25,
  });
  const pageCount = Math.max(1, Math.ceil(catalogue.data.total / catalogue.data.limit));

  return (
    <div className="mt-4 space-y-3">
      <Input
        aria-label="Search service catalogue"
        placeholder="Search services"
        value={catalogue.search}
        onChange={(event) => catalogue.setSearch(event.target.value)}
      />
      <ScrollArea className="h-[calc(100vh-210px)]">
        {catalogue.isError ? (
          <ErrorState
            kind="server"
            title="Service catalogue could not be loaded"
            onRetry={() => void catalogue.refetch()}
          />
        ) : catalogue.data.items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {catalogue.isFetching ? "Loading services..." : "No matching services."}
          </p>
        ) : (
          <ul className="space-y-2 pr-4">
            {catalogue.data.items.map((template) => (
              <li key={template.id}>
                <button
                  type="button"
                  onClick={() => onSelect(template)}
                  className="w-full rounded-md border border-border p-3 text-left text-sm transition-colors hover:bg-muted/50"
                >
                  <div className="font-medium">{template.service}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{template.description}</div>
                  <div className="mt-1 text-xs font-medium tabular-nums text-primary">
                    {formatCurrencyAmount(template.unit_price, "HKD")}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
      {pageCount > 1 ? (
        <div className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous catalogue page"
            disabled={catalogue.page <= 1 || catalogue.isFetching}
            onClick={() => catalogue.setPage((page) => Math.max(1, page - 1))}
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          </Button>
          <span className="tabular-nums">
            Page {catalogue.page} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next catalogue page"
            disabled={catalogue.page >= pageCount || catalogue.isFetching}
            onClick={() => catalogue.setPage((page) => Math.min(pageCount, page + 1))}
          >
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

function QuoteDocumentPreviewSkeleton() {
  return (
    <div
      className="min-h-[420px] animate-pulse rounded-md bg-muted"
      aria-label="Loading quote PDF preview"
    />
  );
}
