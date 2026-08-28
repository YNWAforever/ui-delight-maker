import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowUpRight, Bot, Info, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  EmptyWorkspaceState,
  ErrorState,
  ResponsiveRecordList,
  SectionHeader,
  StaleDataIndicator,
  StatusBadge,
  WorkspaceHeader,
  type ColumnDef,
} from "@/components/sales";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { settingsSearchSchema } from "@/lib/admin-ux-search";
import { ROLE_GRANTS } from "@/lib/admin/policy";
import { AGENT_DEFINITIONS } from "@/lib/agents";
import { toSafeErrorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import {
  createProduct,
  deactivateProductFn,
  getProducts,
  updateProduct,
} from "@/server-functions/products";
import type { Product } from "@/lib/types";

/**
 * What this page is, after the audit.
 *
 * Seven tabs went in; two came out. Five of them were surfaces with no persistence behind
 * them at all, and each is recorded here against its finding:
 *
 * - **Profile** (IF-E1-16) was a second, fake copy of `/account`, pre-filled with a
 *   hardcoded name and email belonging to no session. `/account` calls `updateMyProfile`
 *   and works, so this is a link now, not a form.
 * - **Team** (IF-E1-17/18/19, FW-3) toasted "Invite mocked" over a roster of five module
 *   fixtures. The real write paths - `inviteUsers`, `changeAdminUserRoleFn`,
 *   `deactivateAdminUserWithReassignmentFn` - all exist and are already called by
 *   `/admin/people`, behind the admin capability gate and its audit trail. Wiring them a
 *   second time here is what Instruction 9.24 forbids ("do not duplicate Admin
 *   functionality"), and a bare role `Select` cannot supply the `reason` those functions
 *   require, nor the reviewed inventory and successors that deactivation takes. So the tab
 *   is **removed as a duplicate surface** and points at Administration.
 * - **Pricing** (IF-E1-20) presented "Manager approval threshold: 400000 HKD" as a live
 *   control governing money. Nothing read those four numbers: `pricing_templates` is a
 *   service price list (service, unit_price, currency), not an approval-threshold store,
 *   and nothing compares a quote to a threshold: `requestQuoteApproval` records the quote's
 *   total on the approval it raises, but never branches on it (BD-10). Removed rather
 *   than restated, because a threshold card on a Settings page reads as configuration
 *   however it is worded.
 * - **Notifications** (IF-E1-23) was checked before it was removed:
 *   `src/server-functions/notifications.ts` exports exactly `getNotifications`,
 *   `markNotificationReadFn` and `markAllNotificationsReadFn`, and no migration defines a
 *   preference table. The checkboxes were uncontrolled `defaultChecked` with no handler, so
 *   every user was told email, Slack, WhatsApp and push were all on for all four events.
 *   Nothing persists, so it is not a settings surface.
 * - **API keys** (IF-E1-24/25/26) generated `Math.random()` in the browser and called it a
 *   key, shipped two fabricated secrets in the client bundle under the heading "Used for
 *   webhooks and external integrations", and toasted "Copied" without touching the
 *   clipboard.
 *
 * What is left is the two groups that are real: the product catalogue, which writes through
 * `createProduct` / `updateProduct` / `deactivateProductFn`, and the agent catalogue, which
 * is read-only per BD-3.
 */

const productsQueryKey = crmQueryKeys.products.list({});

/**
 * Keyed under `products`, not under `settings.detail("products")`.
 *
 * The old key was `["settings","detail","products"]` while both write handlers invalidated
 * `["products","list"]` - a prefix that can never match it (IF-E1-29). The table only ever
 * looked current because of a hand-written `setQueryData`, so a rejected write left a
 * locally fabricated row on screen with no refetch to correct it. One key now serves this
 * page and `/clients/$id`'s `products.list({activeOnly:true})`, and `products.lists()`
 * reaches both.
 */
const productsQueryOptions = () =>
  routeQueryOptions({
    queryKey: productsQueryKey,
    queryFn: () => getProducts({}),
  });

export const Route = createFileRoute("/settings")({
  validateSearch: settingsSearchSchema,
  loader: ({ context }) => context.queryClient.ensureQueryData(productsQueryOptions()),
  head: () => ({
    meta: [
      { title: "Settings - Fimmick ClientOps" },
      {
        name: "description",
        content: "Product catalogue and AI agent configuration.",
      },
    ],
  }),
  errorComponent: SettingsErrorState,
  component: SettingsPage,
});

/**
 * The loader reaches `getProducts`, which runs `requireCapability("products.view")` and then
 * raw SQL. Without a boundary here both a capability denial and any Neon driver string fall
 * through to the root handler (IF-E1-32).
 */
function SettingsErrorState({ error }: { error: unknown }) {
  const router = useRouter();

  return (
    <div className="px-4 py-6 md:px-6">
      <ErrorState
        kind="server"
        error={error}
        title="Settings did not load"
        onRetry={() => {
          void router.invalidate({ filter: (match) => match.routeId === "/settings" });
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------------------
 * Save state
 * ---------------------------------------------------------------------------------- */

/**
 * The explicit save state a settings group owes its reader.
 *
 * Every state names itself in words: there is no spinner standing alone for "saving" and no
 * tick standing alone for "saved". `error` carries its own retry so recovery is inline, next
 * to the thing that failed, rather than a toast the reader has already dismissed.
 */
type SaveState =
  | { kind: "idle" }
  | { kind: "unsaved" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "error"; message: string; retry?: () => void };

function SaveStateLine({ state }: { state: SaveState }) {
  if (state.kind === "idle") return null;

  if (state.kind === "error") {
    return (
      <p role="alert" className="flex flex-wrap items-center gap-2 text-xs text-destructive">
        <span>{state.message}</span>
        {state.retry && (
          <Button type="button" variant="outline" size="sm" onClick={state.retry}>
            Try again
          </Button>
        )}
      </p>
    );
  }

  return (
    <p role="status" className="text-xs text-muted-foreground">
      {state.kind === "unsaved" && "Unsaved changes"}
      {state.kind === "saving" && "Saving..."}
      {state.kind === "saved" && `Saved ${formatDateTime(state.at)}`}
    </p>
  );
}

/* -------------------------------------------------------------------------------------
 * Page
 * ---------------------------------------------------------------------------------- */

function SettingsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const context = Route.useRouteContext();
  const profile = context.profile ?? null;
  const adminNavigation = context.adminNavigation ?? [];

  const loadedProducts = Route.useLoaderData();
  const productsQuery = useQuery({
    ...productsQueryOptions(),
    initialData: loadedProducts,
  });

  const tab = search.tab ?? "products";

  // Guarded because an absent or invalid timestamp would make `toISOString()` throw and
  // take the whole page down with it.
  const updatedAt = Number.isFinite(productsQuery.dataUpdatedAt)
    ? new Date(productsQuery.dataUpdatedAt).toISOString()
    : null;

  return (
    <>
      <WorkspaceHeader
        context="Operate"
        title="Settings"
        description="The product catalogue quotes and engagements reference, and the agent catalogue this workspace dispatches."
        status={
          updatedAt === null ? undefined : (
            <StaleDataIndicator updatedAt={updatedAt} isRefetching={productsQuery.isFetching} />
          )
        }
      />

      <div className="space-y-6 px-4 py-6 md:px-6">
        <Tabs
          value={tab}
          onValueChange={(next) =>
            navigate({
              search: (current) => ({
                ...current,
                tab: next === "products" ? undefined : (next as NonNullable<typeof search.tab>),
              }),
              replace: true,
            })
          }
        >
          <div className="max-w-full overflow-x-auto pb-1">
            <TabsList className="w-max">
              <TabsTrigger value="products">Products</TabsTrigger>
              <TabsTrigger value="agents">AI agents</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="products" className="mt-4">
            <ProductsTab
              products={productsQuery.data}
              roleGrantsProductManage={
                profile ? ROLE_GRANTS[profile.role].has("products.manage") : true
              }
            />
          </TabsContent>
          <TabsContent value="agents" className="mt-4">
            <AgentCatalogueTab />
          </TabsContent>
        </Tabs>

        <ElsewhereSection
          adminPeopleHref={adminNavigation.find((item) => item.key === "people")?.href}
        />
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------------------
 * Products - the one group on this page that writes
 * ---------------------------------------------------------------------------------- */

const PRODUCT_CATEGORIES: Array<NonNullable<Product["category"]>> = [
  "AI transformation",
  "CRM",
  "KOC",
  "campaign",
  "data",
  "custom",
];

function ProductsTab({
  products,
  roleGrantsProductManage,
}: {
  products: Product[];
  roleGrantsProductManage: boolean;
}) {
  const queryClient = useQueryClient();

  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Product["category"]>("custom");
  const [billingType, setBillingType] = useState<Product["billing_type"]>("retainer");
  const [termMonths, setTermMonths] = useState(12);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [catalogueState, setCatalogueState] = useState<SaveState>({ kind: "idle" });

  const dirty =
    name.trim() !== "" || category !== "custom" || billingType !== "retainer" || termMonths !== 12;

  const resetDraft = () => {
    setName("");
    setCategory("custom");
    setBillingType("retainer");
    setTermMonths(12);
    setCreateError(null);
  };

  /**
   * One click is one product.
   *
   * The previous handler was a bare `async` passed straight to `onClick` with no guard and
   * no `catch` (IF-E1-27): two clicks wrote two catalogue rows, and the `AdminError` from
   * `requireCapability("products.manage")` became an unhandled rejection that left the
   * dialog sitting open saying nothing. It also fell back to a product literally named
   * "Untitled product" when the field was blank, which is a fabricated record; the Create
   * button is disabled until a name exists instead.
   */
  const create = async () => {
    const trimmed = name.trim();
    if (creating || trimmed === "") return;

    setCreating(true);
    setCreateError(null);
    setCatalogueState({ kind: "saving" });
    try {
      const created = await createProduct({
        data: {
          name: trimmed,
          category,
          billing_type: billingType,
          default_term_months: termMonths,
        },
      });
      // Not an optimistic write: this is the row the server returned, applied after the
      // await, so there is nothing to roll back. The invalidation is what refreshes every
      // other product key, including `/clients/$id`'s active-only list.
      queryClient.setQueryData<Product[]>(productsQueryKey, (current = []) => [
        ...current,
        created,
      ]);
      await queryClient.invalidateQueries({ queryKey: crmQueryKeys.products.lists() });
      setCatalogueState({ kind: "saved", at: new Date().toISOString() });
      toast.success(`Added product ${created.name}`);
      setNewOpen(false);
      resetDraft();
    } catch (error) {
      const message = toSafeErrorMessage(error);
      // The dialog stays open with every field intact, so the retry is one click.
      setCreateError(message);
      setCatalogueState({ kind: "error", message });
      toast.error(message);
    } finally {
      setCreating(false);
    }
  };

  /**
   * Activate and deactivate (M-5, IF-E1-28).
   *
   * Both server functions are real and capability-checked. What was missing was any signal
   * at all: no toast on success, no toast on failure, no per-row in-flight state, and an
   * invalidation aimed at a key this page does not use - so a forbidden click was a row
   * that silently did not change and said nothing about why.
   */
  const toggleActive = async (product: Product) => {
    if (pendingIds.has(product.id)) return;

    setPendingIds((current) => new Set(current).add(product.id));
    setCatalogueState({ kind: "saving" });
    try {
      const updated = product.active
        ? await deactivateProductFn({ data: { id: product.id } })
        : await updateProduct({ data: { id: product.id, updates: { active: true } } });

      queryClient.setQueryData<Product[]>(productsQueryKey, (current = []) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      await queryClient.invalidateQueries({ queryKey: crmQueryKeys.products.lists() });
      setCatalogueState({ kind: "saved", at: new Date().toISOString() });
      toast.success(product.active ? `${product.name} deactivated` : `${product.name} reactivated`);
    } catch (error) {
      const message = toSafeErrorMessage(error);
      setCatalogueState({
        kind: "error",
        message,
        retry: () => void toggleActive(product),
      });
      toast.error(message);
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(product.id);
        return next;
      });
    }
  };

  const columns: ColumnDef<Product>[] = [
    {
      id: "name",
      header: "Product",
      priority: "primary",
      sticky: true,
      cell: (product) => <span className="font-medium text-foreground">{product.name}</span>,
    },
    {
      id: "category",
      header: "Category",
      priority: "secondary",
      cell: (product) => (
        <span className="text-sm text-muted-foreground">{product.category ?? "Uncategorised"}</span>
      ),
    },
    {
      id: "billing",
      header: "Billing",
      priority: "secondary",
      cell: (product) => (
        <span className="text-sm capitalize">{product.billing_type.replace("_", " ")}</span>
      ),
    },
    {
      id: "term",
      header: "Default term",
      priority: "tertiary",
      cell: (product) => (
        <span className="text-sm">
          {product.default_term_months ? `${product.default_term_months}mo` : "No default"}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      priority: "primary",
      cell: (product) => (
        <StatusBadge domain="agents" value={product.active ? "active" : "inactive"} />
      ),
    },
    {
      id: "actions",
      header: "Actions",
      priority: "primary",
      cell: (product) => (
        <ToggleActiveButton product={product} pending={pendingIds} run={toggleActive} />
      ),
    },
  ];

  const renderCard = (product: Product) => (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{product.name}</span>
        <StatusBadge domain="agents" value={product.active ? "active" : "inactive"} />
      </div>
      <p className="text-xs text-muted-foreground">
        {product.category ?? "Uncategorised"} - {product.billing_type.replace("_", " ")} -{" "}
        {product.default_term_months ? `${product.default_term_months}mo` : "no default term"}
      </p>
      <ToggleActiveButton product={product} pending={pendingIds} run={toggleActive} />
    </div>
  );

  const newProductDialog = (
    <Dialog
      open={newOpen}
      onOpenChange={(open) => {
        if (creating) return;
        setNewOpen(open);
        if (!open) resetDraft();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus aria-hidden="true" className="mr-2 h-4 w-4" /> New product
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New product</DialogTitle>
          <DialogDescription>
            Added to the catalogue engagements, pricing templates and quotes reference.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="product-name" className="text-xs">
              Name
            </Label>
            <Input
              id="product-name"
              name="product-name"
              autoComplete="off"
              className="mt-1"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={creating}
            />
          </div>
          <div>
            <Label htmlFor="product-category" className="text-xs">
              Category
            </Label>
            <Select
              value={category ?? "custom"}
              onValueChange={(value) => setCategory(value as Product["category"])}
              disabled={creating}
            >
              <SelectTrigger id="product-category" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRODUCT_CATEGORIES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="product-billing-type" className="text-xs">
              Billing type
            </Label>
            <Select
              value={billingType}
              onValueChange={(value) => setBillingType(value as Product["billing_type"])}
              disabled={creating}
            >
              <SelectTrigger id="product-billing-type" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="retainer">Retainer</SelectItem>
                <SelectItem value="one_off">One-off</SelectItem>
                <SelectItem value="usage">Usage</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="product-term-months" className="text-xs">
              Default term (months)
            </Label>
            <Input
              id="product-term-months"
              name="term-months"
              type="number"
              inputMode="numeric"
              min={1}
              className="mt-1"
              value={termMonths}
              onChange={(event) => setTermMonths(Number(event.target.value) || 12)}
              disabled={creating}
            />
          </div>
        </div>

        {createError === null ? (
          dirty && !creating ? (
            <p role="status" className="text-xs text-muted-foreground">
              Unsaved changes
            </p>
          ) : null
        ) : (
          <p role="alert" className="text-xs text-destructive">
            {createError}
          </p>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setNewOpen(false);
              resetDraft();
            }}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button onClick={() => void create()} disabled={creating || name.trim() === ""}>
            {creating ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="space-y-4">
      {/*
        An advisory, not a gate - the call BD-12 forces everywhere else in this branch.
        `products.manage` is granted to admin and super_admin only, while `products.view`
        reaches every role, so five roles used to see fully enabled Create and Deactivate
        buttons whose clicks did nothing and said nothing (IF-E1-30). Disabling them from
        `ROLE_GRANTS` alone would lock out someone holding a `permission_overrides` allow,
        which the client cannot see, so the honest control states the rule up front and
        leaves the server as the only thing that decides.
      */}
      {!roleGrantsProductManage && (
        <div
          role="note"
          className="flex items-start gap-3 rounded-md border border-warning/30 bg-warning/10 p-4 text-sm"
        >
          <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" />
          <p className="text-warning-foreground">
            Changing the product catalogue needs admin access, which is not part of your role. You
            can read the catalogue here; saving will be refused unless you have been granted an
            exception.
          </p>
        </div>
      )}

      <SectionHeader
        title="Product catalogue"
        description="What engagements, pricing templates and quotes can reference."
        action={newProductDialog}
      />

      <SaveStateLine state={catalogueState} />

      {products.length === 0 ? (
        <EmptyWorkspaceState
          title="No products yet"
          description="Add the first product so quotes and engagements have something to reference."
        />
      ) : (
        <ResponsiveRecordList
          columns={columns}
          rows={products}
          rowKey={(product) => product.id}
          renderCard={renderCard}
          caption="Product catalogue"
        />
      )}
    </div>
  );
}

function ToggleActiveButton({
  product,
  pending,
  run,
}: {
  product: Product;
  pending: ReadonlySet<string>;
  run: (product: Product) => Promise<void>;
}) {
  const busy = pending.has(product.id);
  return (
    <Button variant="outline" size="sm" disabled={busy} onClick={() => void run(product)}>
      {busy ? "Saving..." : product.active ? "Deactivate" : "Reactivate"}
    </Button>
  );
}

/* -------------------------------------------------------------------------------------
 * Agents - read-only per BD-3
 * ---------------------------------------------------------------------------------- */

/**
 * The catalogue, stated rather than operated.
 *
 * This card used to carry two switches per agent - "Approval" and enable/pause - under the
 * description "Toggle agents and switch approval requirements" (IF-E1-21/22). Neither
 * switch left the browser: `status` and `human_approval` are fields of the code constant
 * `AGENT_DEFINITIONS`, there is no agent-config table in any migration, and no export in
 * `src/server-functions/` writes one. The `StatusBadge` beside the second switch rendered
 * from that same local state, so flipping it visibly rewrote the status the page reported
 * while the n8n dispatch path went on running the agent.
 *
 * It was also the third independent copy of the same fake control, after `/agents` and
 * `/agents/$name` - three surfaces, three local states, so flipping one contradicted the
 * other two. Per BD-3 the whole enforcement chain is missing (a versioned policy store,
 * server-side dispatch enforcement, capability checks on policy writes, an audit log,
 * rollback and runtime telemetry), and that is a project of its own, not a frontend
 * revision.
 */
function AgentCatalogueTab() {
  return (
    <div className="space-y-4">
      <SectionHeader
        title="Agent configuration"
        description="The dispatch catalogue, as the workflows read it."
      />

      <div
        role="note"
        className="flex items-start gap-3 rounded-md border border-border bg-muted/40 p-4 text-sm"
      >
        <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-muted-foreground">
          Configuration is read-only until runtime policy enforcement is enabled.
        </p>
      </div>

      <ul className="space-y-3">
        {AGENT_DEFINITIONS.map((agent) => (
          <li key={agent.name}>
            <Card>
              <CardContent className="flex flex-wrap items-start justify-between gap-4 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Bot aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm font-medium">{agent.display_name}</span>
                    <StatusBadge domain="agents" value={agent.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{agent.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Model <code>{agent.model}</code>
                  </p>
                </div>
                <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Human approval</dt>
                    <dd className="mt-0.5 font-medium text-foreground">
                      {agent.human_approval ? "Required" : "Auto-execute"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Workflow</dt>
                    <dd className="mt-0.5 font-medium text-foreground">
                      <code>{agent.workflow_type}</code>
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      <p className="text-sm text-muted-foreground">
        <Link to="/agents" className="inline-flex items-center gap-1 font-medium hover:underline">
          Open AI Ops
          <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>{" "}
        to see run history and what each agent has actually done.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------------------
 * Where the removed groups went
 * ---------------------------------------------------------------------------------- */

/**
 * Removal without a destination is just a missing feature.
 *
 * The Administration link is resolved from `adminNavigation`, the one server-scoped entry
 * in the shell read - it is empty for an actor holding none of the admin capabilities. So a
 * salesperson is told where user management lives rather than handed a link into a
 * capability gate that would throw at them.
 */
function ElsewhereSection({ adminPeopleHref }: { adminPeopleHref?: string }) {
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <SectionHeader
          title="Settings that live elsewhere"
          description="These used to be tabs here. Each is now one surface, with a real write path behind it."
        />
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-foreground">Your name, contact and leave</dt>
            <dd className="mt-1 text-sm text-muted-foreground">
              <Link
                to="/account"
                className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
              >
                Account settings
                <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
              </Link>{" "}
              covers your profile, availability, delegated coverage and access requests.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-foreground">People, roles and invitations</dt>
            <dd className="mt-1 text-sm text-muted-foreground">
              {adminPeopleHref ? (
                <>
                  <Link
                    to={adminPeopleHref}
                    className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
                  >
                    Administration, People
                    <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
                  </Link>{" "}
                  handles inviting, role changes and deactivation, with the audit record each one
                  requires.
                </>
              ) : (
                "Managed in Administration by your administrators. Ask them for an invitation or a role change."
              )}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
